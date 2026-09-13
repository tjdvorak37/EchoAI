import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const getUser = async (request: Request) => {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )
  const { data } = await client.auth.getUser(token)
  return data.user ?? null
}

const providerBaseUrl = (endpoint: string) => endpoint.replace(/\/+$/, '')

const dataUrlFile = (value: unknown) => {
  if (typeof value !== 'string' || !value.startsWith('data:')) return null
  const match = value.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const binary = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
  return new File([binary], 'reference.png', { type: match[1] })
}

const openAiRequest = async (config: Record<string, unknown>, payload: Record<string, unknown>) => {
  const baseUrl = providerBaseUrl(String(config.endpoint))
  const apiKey = String(config.api_key ?? config.apiKey ?? '')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }

  if (payload.mode === 'test') {
    const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
    const body = await response.text()
    return { response, body }
  }

  if (payload.capability === 'image' || payload.mode === 'image') {
    const ratio = String((payload.output as Record<string, unknown> | undefined)?.aspectRatio ?? '1:1')
    const size = ratio === '16:9' ? '1536x1024' : ratio === '9:16' ? '1024x1536' : '1024x1024'
    const reference = (payload.references as Array<Record<string, unknown>> | undefined)?.find((item) => item.imageSrc || item.url)
    const referenceFile = dataUrlFile(reference?.imageSrc || reference?.url)
    let response: Response
    if (referenceFile) {
      const form = new FormData()
      form.append('model', String(config.model || '').startsWith('gpt-image') ? String(config.model) : 'gpt-image-1')
      form.append('prompt', String(payload.prompt || '').slice(0, 4000))
      form.append('size', size)
      form.append('n', '1')
      form.append('image[]', referenceFile)
      response = await fetch(`${baseUrl}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form })
    } else {
      response = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: String(config.model || '').startsWith('gpt-image') ? config.model : 'gpt-image-1',
          prompt: String(payload.prompt || '').slice(0, 4000),
          size,
          n: 1,
        }),
      })
    }
    const body = await response.text()
    return { response, body }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: String(payload.prompt || '') }],
    }),
  })
  const body = await response.text()
  return { response, body }
}

const parseProviderBody = (rawBody: string, contentType: string) => {
  if (contentType.includes('application/json')) {
    try { return JSON.parse(rawBody) } catch { return { raw: rawBody.slice(0, 1000) } }
  }
  return { raw: rawBody.slice(0, 1000) }
}

const routeModel = (config: Record<string, unknown>, payload: Record<string, unknown>) => {
  const routing = (config.routing ?? {}) as Record<string, unknown>
  const models = (routing.models ?? {}) as Record<string, unknown>
  const routeKey = String(payload.creatorMode || payload.capability || 'standard')
  return String(models[routeKey] || config.model || 'default')
}

const loadRoute = async (admin: ReturnType<typeof createClient>, payload: Record<string, unknown>) => {
  const capability = String(payload.capability || 'message')
  const mode = String(payload.creatorMode || 'standard')
  const { data } = await admin.from('echo_ai_route_overrides')
    .select('pricing:echo_ai_pricing(id, provider_key, model, bot_name, bot_description, echo_credit_cost, credit_cost, provider_cost_per_unit)')
    .eq('capability', capability).eq('mode', mode).eq('enabled', true).maybeSingle()
  return data?.pricing || null
}

const reserveCreatorJob = async (admin: ReturnType<typeof createClient>, payload: Record<string, unknown>) => {
  if (!payload.echoCreator) return null
  const cost = Number.isInteger(payload.creditCost) ? Number(payload.creditCost) : 0
  const { data, error } = await admin.rpc('reserve_echo_ai_job', {
    p_capability: payload.capability,
    p_mode: payload.creatorMode || 'standard',
    p_prompt: payload.prompt,
    p_cost: cost,
    p_request: { settings: payload.output || {}, brandProfile: payload.brandProfile || null },
  })
  if (error) throw new Error(error.message)
  return data
}

const estimateProviderCost = (payload: Record<string, unknown>, route: Record<string, unknown> | null, responseBody: Record<string, unknown> = {}) => {
  if (!payload.echoCreator) return 0
  const usage = responseBody.usage as Record<string, unknown> | undefined
  if (payload.capability === 'message' && usage) {
    const input = Number(usage.prompt_tokens || usage.input_tokens || 0)
    const output = Number(usage.completion_tokens || usage.output_tokens || 0)
    return input * Number(route?.provider_cost_input || 0) / 1_000_000 + output * Number(route?.provider_cost_output || 0) / 1_000_000
  }
  if (payload.capability === 'video') return payload.creatorMode === 'premium' ? 1.2 : 0.5
  if (payload.capability === 'image' || payload.capability === 'image_edit') return Number(route?.provider_cost_per_unit || (payload.creatorMode === 'premium' ? 0.12 : 0.04))
  return Number(route?.provider_cost_per_unit || (payload.creatorMode === 'premium' ? 0.03 : 0.01))
}

const finishCreatorJob = async (admin: ReturnType<typeof createClient>, jobId: unknown, result: Record<string, unknown>, status = 'completed', error = null, providerCostUsd = 0) => {
  if (!jobId) return
  if (status === 'failed') {
    await admin.rpc('fail_echo_ai_job', { p_job_id: jobId, p_error: error || 'Provider request failed' })
    return
  }
  await admin.rpc('complete_echo_ai_job', { p_job_id: jobId, p_provider_cost_usd: providerCostUsd, p_result: result })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request)

  const user = await getUser(request)
  if (!user) return json({ error: 'Authentication required.' }, 401, request)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )
  const payload = await request.clone().json().catch(() => ({}))
  const config = {
    enabled: true,
    provider: 'openai',
    endpoint: Deno.env.get('OPENAI_API_BASE_URL') ?? 'https://api.openai.com/v1',
    api_key: Deno.env.get('OPENAI_API_KEY') ?? '',
    model: Deno.env.get('OPENAI_TEXT_MODEL') ?? 'gpt-4o-mini',
    routing: { models: { standard: Deno.env.get('OPENAI_TEXT_MODEL') ?? 'gpt-4o-mini' } },
  }
  const route = await loadRoute(admin, payload)
  const routeProvider = route?.provider_key || 'openai'
  const routeEndpoint = Deno.env.get(`${routeProvider.toUpperCase()}_API_BASE_URL`) || config.endpoint
  const routeKey = Deno.env.get(`${routeProvider.toUpperCase()}_API_KEY`) || config.api_key
  const routedConfig = { ...config, provider: routeProvider, endpoint: routeEndpoint, api_key: routeKey, model: route?.model || routeModel(config, payload) }
  if (config.enabled === false) return json({ error: 'This AI tool is disabled.' }, 409, request)
  if (!config.endpoint) return json({ error: 'No AI endpoint is configured. Add one in Integrations.' }, 503, request)
  const routedModel = routeModel(config, payload)
  let creatorJob: Record<string, unknown> | null = null

  try {
    creatorJob = await reserveCreatorJob(admin, payload)
    const result = routedConfig.provider === 'openai'
      ? await openAiRequest({ ...routedConfig, model: routedConfig.model || routedModel(config, payload) }, payload)
      : await (async () => {
          const response = await fetch(routedConfig.endpoint as string, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(routedConfig.api_key ? { Authorization: `Bearer ${routedConfig.api_key}` } : {}) },
            body: JSON.stringify(payload),
          })
          return { response, body: await response.text() }
        })()
    const upstream = result.response
    const responseBody = parseProviderBody(result.body, upstream.headers.get('content-type') ?? '')
    if (!upstream.ok) {
      await finishCreatorJob(admin, creatorJob?.jobId, {}, 'failed', `Provider returned ${upstream.status}`)
      return json({ error: `AI provider returned ${upstream.status}.`, detail: responseBody }, 502, request)
    }
    if (routedConfig.provider === 'openai' && payload.mode === 'test') {
      return json({ status: 'ok', provider: routedConfig.provider, botName: route?.bot_name || '', message: 'AI provider key verified.' }, 200, request)
    }
    if (routedConfig.provider === 'openai' && (payload.capability === 'image' || payload.mode === 'image')) {
      const image = (responseBody as Record<string, unknown>)?.data?.[0] as Record<string, unknown> | undefined
      const output = { imageUrl: image?.url, imageBase64: image?.b64_json, title: 'OpenAI generated image', jobId: creatorJob?.jobId, creditsRemaining: creatorJob?.creditsRemaining }
      await finishCreatorJob(admin, creatorJob?.jobId, output, 'completed', null, estimateProviderCost(payload, route, responseBody as Record<string, unknown>))
      return json(output, 200, request)
    }
    if (routedConfig.provider === 'openai') {
      const choice = (responseBody as Record<string, unknown>)?.choices?.[0] as Record<string, unknown> | undefined
      const message = choice?.message as Record<string, unknown> | undefined
      const output = { title: 'OpenAI response', text: message?.content || '', jobId: creatorJob?.jobId, creditsRemaining: creatorJob?.creditsRemaining }
      await finishCreatorJob(admin, creatorJob?.jobId, output, 'completed', null, estimateProviderCost(payload, route, responseBody as Record<string, unknown>))
      return json(output, 200, request)
    }
    await finishCreatorJob(admin, creatorJob?.jobId, responseBody as Record<string, unknown>, 'completed', null, estimateProviderCost(payload, route, responseBody as Record<string, unknown>))
    return json(responseBody, 200, request)
  } catch (error) {
    await finishCreatorJob(admin, creatorJob?.jobId, {}, 'failed', error instanceof Error ? error.message : 'Provider request failed')
    console.error('inhouse-ai proxy failed', error)
    return json({ error: error instanceof Error ? error.message : 'The configured AI provider could not be reached.' }, 502, request)
  }
})