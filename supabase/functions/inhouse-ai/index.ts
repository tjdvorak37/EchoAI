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
    const upstream = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(providerApiKey ? { Authorization: `Bearer ${providerApiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    })
    const contentType = upstream.headers.get('content-type') ?? ''
    const rawBody = await upstream.text()
    let responseBody: unknown = rawBody
    if (contentType.includes('application/json') && rawBody) {
      try {
        responseBody = JSON.parse(rawBody)
      } catch {
        responseBody = { raw: rawBody.slice(0, 1000) }
      }
    }
    if (!upstream.ok) {
      await admin.from('ai_agent_connections').update({ status: 'error', last_error: `Provider returned ${upstream.status}`, last_checked_at: new Date().toISOString() }).eq('id', payload.connectionId).eq('user_id', user.id)
      return json({ error: `AI provider returned ${upstream.status}.`, detail: responseBody }, 502, request)
    }
    if (payload.connectionId) {
      await admin.from('ai_agent_connections').update({ status: 'connected', last_error: null, last_checked_at: new Date().toISOString() }).eq('id', payload.connectionId).eq('user_id', user.id)
    }
    return json(responseBody, 200, request)
  } catch (error) {
    console.error('inhouse-ai proxy failed', error)
    return json({ error: error instanceof Error ? error.message : 'The configured AI provider could not be reached.' }, 502, request)
  }
})