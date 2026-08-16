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
  const { data: record, error: configError } = await admin
    .from('user_ai_agent_config')
    .select('config')
    .eq('user_id', user.id)
    .maybeSingle()

  if (configError) return json({ error: 'Could not load the AI connection.' }, 500, request)
  const config = record?.config ?? {}
  if (!config.endpoint) return json({ error: 'No AI endpoint is configured. Add one in Integrations.' }, 503, request)

  try {
    const payload = await request.json()
    const upstream = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    })
    const contentType = upstream.headers.get('content-type') ?? ''
    const responseBody = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text()
    if (!upstream.ok) return json({ error: `AI provider returned ${upstream.status}.`, detail: responseBody }, 502, request)
    return json(responseBody, 200, request)
  } catch (error) {
    console.error('inhouse-ai proxy failed', error)
    return json({ error: 'The configured AI provider could not be reached.' }, 502, request)
  }
})