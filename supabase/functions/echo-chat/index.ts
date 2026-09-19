import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const DEFAULT_SYSTEM_PROMPT = `You are Echo, the friendly EchoAI idea and workflow assistant. Help people turn rough ideas into useful surveys, campaigns, content plans, and next steps. Give concise, practical answers with clear structure. Ask one short clarifying question only when audience, goal, or channel is essential and missing. Do not claim to perform actions or access data that was not provided.`

const getUser = async (request: Request) => {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { user: null, token: '' }

  const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  const { data } = await client.auth.getUser(token)
  return { user: data.user ?? null, token }
}

const userClient = (token: string) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

const cleanHistory = (history: unknown) => {
  if (!Array.isArray(history)) return []
  return history
    .slice(-6)
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const { role, content } = entry as { role?: unknown; content?: unknown }
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return []
      return [{ role, content: content.trim().slice(0, 2_000) }]
    })
}

const isStaffRole = (role: unknown) => ['admin', 'manager', 'it'].includes(String(role))

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request)

  const { user, token } = await getUser(request)
  if (!user || !token) return json({ error: 'Authentication required.' }, 401, request)

  const payload = await request.json().catch(() => ({}))
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: settings, error: settingsError } = await admin
    .from('echo_chat_settings')
    .select('enabled, gateway_url, gateway_token, model, daily_message_limit, max_response_tokens, system_prompt')
    .eq('id', true)
    .maybeSingle()

  if (settingsError || !settings) return json({ error: 'Ask Echo is not configured yet.' }, 503, request)

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isTest = payload?.action === 'test'
  if (isTest && !isStaffRole(profile?.role)) return json({ error: 'Technician access is required.' }, 403, request)

  if (!settings.enabled && !isTest) return json({ error: 'Ask Echo is not available yet.' }, 503, request)
  if (!settings.gateway_url.startsWith('https://') || !settings.gateway_token.trim()) {
    return json({ error: 'Ask Echo needs a secure gateway URL and token before it can be enabled.' }, 503, request)
  }

  let message = typeof payload?.message === 'string' ? payload.message.trim() : ''
  if (isTest) message = 'Reply with exactly: Echo connection verified.'
  if (!message || message.length > 4_000) return json({ error: 'Enter a question up to 4,000 characters.' }, 400, request)

  if (!isTest) {
    const client = userClient(token)
    const { data: entitlement, error: entitlementError } = await client.rpc('my_entitlement')
    if (entitlementError || !entitlement?.entitled) return json({ error: 'Ask Echo is included with Premium.' }, 403, request)

    const { data: quota, error: quotaError } = await client.rpc('consume_echo_chat_quota', {
      p_daily_limit: settings.daily_message_limit,
    })
    const quotaResult = Array.isArray(quota) ? quota[0] : quota
    if (quotaError || !quotaResult?.allowed) return json({ error: 'You have reached today\'s Ask Echo limit. Please come back tomorrow.' }, 429, request)
  }

  const activeTab = typeof payload?.activeTab === 'string' ? payload.activeTab.replace(/[^a-z-]/gi, '').slice(0, 40) : 'workspace'
  const messages = [
    { role: 'system', content: `${settings.system_prompt.trim() || DEFAULT_SYSTEM_PROMPT}\n\nThe user is currently in the EchoAI ${activeTab} area.` },
    ...cleanHistory(payload?.history),
    { role: 'user', content: message },
  ]

  try {
    const response = await fetch(settings.gateway_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.gateway_token}`,
      },
      body: JSON.stringify({ model: settings.model, messages, stream: false, maxTokens: settings.max_response_tokens }),
      signal: AbortSignal.timeout(45_000),
    })
    const rawBody = await response.text()
    const body = (() => { try { return JSON.parse(rawBody) } catch { return {} } })()
    if (!response.ok) {
      console.error('Ask Echo gateway request failed', response.status, rawBody)
      const detail = `Upstream ${response.status}: ${rawBody.slice(0, 500) || '(empty body)'}`
      return json({
        error: isTest
          ? `Ask Echo could not reach its model server. ${detail}`
          : 'Ask Echo could not reach its model server. Please try again shortly.',
      }, 502, request)
    }

    const text = typeof body?.text === 'string'
      ? body.text
      : typeof body?.message?.content === 'string'
        ? body.message.content
        : typeof body?.choices?.[0]?.message?.content === 'string'
          ? body.choices[0].message.content
          : ''
    if (!text.trim()) return json({ error: 'Ask Echo returned an empty response. Please try again.' }, 502, request)
    return json({ text: text.trim(), model: settings.model }, 200, request)
  } catch (error) {
    console.error('Ask Echo gateway request failed', error)
    const message = error instanceof Error ? error.message : String(error)
    return json({
      error: isTest
        ? `Ask Echo could not reach its model server. ${message}`
        : 'Ask Echo could not reach its model server. Please try again shortly.',
    }, 502, request)
  }
})