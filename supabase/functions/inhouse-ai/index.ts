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
    const reference = (payload.references as Array<Record<string, unknown>> | undefined)?.find((item) => item.imageSrc)
    const referenceFile = dataUrlFile(reference?.imageSrc)
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
  const connectionQuery = payload.connectionId
    ? admin.from('ai_agent_connections').select('id, endpoint, api_key, model, provider, capabilities, routing, enabled').eq('id', payload.connectionId).eq('user_id', user.id).maybeSingle()
    : admin.from('user_ai_agent_config').select('config').eq('user_id', user.id).maybeSingle()
  const { data: record, error: configError } = await connectionQuery

  if (configError) return json({ error: 'Could not load the AI connection.' }, 500, request)
  const config = record?.config ?? record ?? {}
  if (config.enabled === false) return json({ error: 'This AI tool is disabled.' }, 409, request)
  if (!config.endpoint) return json({ error: 'No AI endpoint is configured. Add one in Integrations.' }, 503, request)
  const providerApiKey = config.api_key ?? config.apiKey ?? ''

  try {
    const result = config.provider === 'openai'
      ? await openAiRequest(config, payload)
      : await (async () => {
          const response = await fetch(config.endpoint as string, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(providerApiKey ? { Authorization: `Bearer ${providerApiKey}` } : {}) },
            body: JSON.stringify(payload),
          })
          return { response, body: await response.text() }
        })()
    const upstream = result.response
    const responseBody = parseProviderBody(result.body, upstream.headers.get('content-type') ?? '')
    if (!upstream.ok) {
      await admin.from('ai_agent_connections').update({ status: 'error', last_error: `Provider returned ${upstream.status}`, last_checked_at: new Date().toISOString() }).eq('id', payload.connectionId).eq('user_id', user.id)
      return json({ error: `AI provider returned ${upstream.status}.`, detail: responseBody }, 502, request)
    }
    if (payload.connectionId) {
      await admin.from('ai_agent_connections').update({ status: 'connected', last_error: null, last_checked_at: new Date().toISOString() }).eq('id', payload.connectionId).eq('user_id', user.id)
    }
    if (config.provider === 'openai' && payload.mode === 'test') {
      return json({ status: 'ok', provider: 'openai', message: 'OpenAI API key verified.' }, 200, request)
    }
    if (config.provider === 'openai' && (payload.capability === 'image' || payload.mode === 'image')) {
      const image = (responseBody as Record<string, unknown>)?.data?.[0] as Record<string, unknown> | undefined
      return json({ imageUrl: image?.url, imageBase64: image?.b64_json, title: 'OpenAI generated image' }, 200, request)
    }
    if (config.provider === 'openai') {
      const choice = (responseBody as Record<string, unknown>)?.choices?.[0] as Record<string, unknown> | undefined
      const message = choice?.message as Record<string, unknown> | undefined
      return json({ title: 'OpenAI response', text: message?.content || '' }, 200, request)
    }
    return json(responseBody, 200, request)
  } catch (error) {
    console.error('inhouse-ai proxy failed', error)
    return json({ error: error instanceof Error ? error.message : 'The configured AI provider could not be reached.' }, 502, request)
  }
})