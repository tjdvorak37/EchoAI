import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

const getCaller = async (request: Request) => {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false } })
  const { data } = await client.auth.getUser(token)
  return data.user ?? null
}

const providers = ['meta', 'meta_ads', 'google_ads', 'youtube', 'x', 'linkedin', 'google_drive', 'microsoft_365', 'twitch', 'google_business', 'pinterest']

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, request)

  const caller = await getCaller(request)
  if (!caller) return json({ error: 'Authentication required.' }, 401, request)
  const db = admin()
  const callerEmail = caller.email?.trim().toLowerCase() || ''
  let { data: profile } = await db.from('profiles').select('role, developer_app_edit_access').eq('id', caller.id).maybeSingle()
  if (!profile && callerEmail) {
    const { data: profileByEmail } = await db
      .from('profiles')
      .select('role, developer_app_edit_access')
      .ilike('email', callerEmail)
      .maybeSingle()
    profile = profileByEmail
  }
  const role = String(profile?.role || caller.user_metadata?.role || caller.app_metadata?.role || '').toLowerCase()
  const isOwner = callerEmail === 'tdvorak37@gmail.com' || callerEmail === 'support@echoaipro.com'
  const isAdmin = ['admin', 'super_admin'].includes(role) || isOwner
  const canEdit = isAdmin || profile?.developer_app_edit_access === true
  if (request.method === 'POST' && !canEdit) return json({ error: 'Developer app editing access is required.' }, 403, request)

  if (request.method === 'GET') {
    const { data, error } = await db.from('developer_app_credentials').select('provider, app_name, client_id, redirect_uri, scopes, enabled, updated_by, updated_at').order('provider')
    if (error) return json({ error: error.message }, 500, request)
    return json({ providers, records: data ?? [], canEdit }, 200, request)
  }

  const body = await request.json().catch(() => ({}))
  if (!providers.includes(body.provider)) return json({ error: 'Unsupported provider.' }, 400, request)
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : ''
  const appName = typeof body.appName === 'string' ? body.appName.trim().slice(0, 160) : ''
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri.trim().slice(0, 500) : ''
  const scopes = Array.isArray(body.scopes) ? body.scopes.filter((scope: unknown) => typeof scope === 'string').slice(0, 30) : []
  if (!clientId || !appName) return json({ error: 'App name and client ID are required.' }, 400, request)

  const update: Record<string, unknown> = {
    provider: body.provider,
    app_name: appName,
    client_id: clientId,
    redirect_uri: redirectUri,
    scopes,
    enabled: body.enabled !== false,
    updated_by: caller.id,
    updated_at: new Date().toISOString(),
  }
  if (clientSecret) update.client_secret = clientSecret
  const { data, error } = await db.from('developer_app_credentials').upsert(update).select('provider, app_name, client_id, redirect_uri, scopes, enabled, updated_by, updated_at').single()
  if (error) return json({ error: error.message }, 500, request)
  return json({ record: data }, 200, request)
})