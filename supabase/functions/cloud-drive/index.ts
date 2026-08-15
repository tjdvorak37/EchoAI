// Cloud drive bridge for OneDrive, SharePoint, and Google Drive.
//
// Files are never copied into EchoAI. This returns listings and short-lived
// links, so the bytes stay in the customer's own drive and count against their
// storage there, not ours.
//
// OAuth client secrets and user tokens stay in this function; the browser only
// ever sees file metadata.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { corsHeaders, json } from '../_shared/cors.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
const FUNCTION_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cloud-drive`

const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
    // Read-only: EchoAI never needs to modify a customer's drive.
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.readonly openid email',
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: Deno.env.get('MICROSOFT_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('MICROSOFT_CLIENT_SECRET') ?? '',
    scope: 'offline_access User.Read Files.Read.All Sites.Read.All',
  },
} as const

type ProviderKey = keyof typeof PROVIDERS

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

const userFromRequest = async (request: Request) => {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data } = await client.auth.getUser(authHeader.replace('Bearer ', ''))
  return data?.user ?? null
}

// Refreshes the stored token when it is close to expiry.
const freshAccessToken = async (userId: string, provider: ProviderKey) => {
  const db = admin()
  const { data: connection } = await db
    .from('cloud_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (!connection) throw new Error('not_connected')

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0
  if (expiresAt - Date.now() > 60_000) {
    return connection.access_token
  }

  if (!connection.refresh_token) throw new Error('reauth_required')

  const config = PROVIDERS[provider]
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) throw new Error('reauth_required')

  const token = await response.json()

  await db
    .from('cloud_connections')
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? connection.refresh_token,
      expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)

  return token.access_token as string
}

const listGoogle = async (accessToken: string, folderId: string, search: string) => {
  const query = search
    ? `name contains '${search.replace(/'/g, "\\'")}' and trashed = false`
    : `'${folderId || 'root'}' in parents and trashed = false`

  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', query)
  url.searchParams.set('pageSize', '100')
  url.searchParams.set('fields', 'files(id,name,mimeType,size,thumbnailLink,webViewLink,modifiedTime)')

  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error(`Google Drive returned ${response.status}`)

  const payload = await response.json()
  return (payload.files ?? []).map((file: Record<string, unknown>) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size ?? 0),
    isFolder: file.mimeType === 'application/vnd.google-apps.folder',
    thumbnailUrl: file.thumbnailLink ?? '',
    webUrl: file.webViewLink ?? '',
    modifiedAt: file.modifiedTime ?? '',
  }))
}

const listGoogleCalendarEvents = async (accessToken: string, timeMin: string, timeMax: string) => {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '250')

  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error(`Google Calendar returned ${response.status}`)

  const payload = await response.json()
  return (payload.items ?? []).map((event: Record<string, any>) => ({
    id: event.id,
    title: event.summary ?? 'Untitled event',
    description: event.description ?? '',
    location: event.location ?? '',
    htmlLink: event.htmlLink ?? '',
    start: event.start?.dateTime ?? event.start?.date ?? '',
    end: event.end?.dateTime ?? event.end?.date ?? '',
    allDay: Boolean(event.start?.date),
  }))
}

const listMicrosoft = async (accessToken: string, folderId: string, search: string, siteId: string) => {
  const base = siteId
    ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`
    : 'https://graph.microsoft.com/v1.0/me/drive'

  const path = search
    ? `${base}/root/search(q='${encodeURIComponent(search)}')`
    : folderId
      ? `${base}/items/${folderId}/children`
      : `${base}/root/children`

  const response = await fetch(`${path}?$top=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Microsoft Graph returned ${response.status}`)

  const payload = await response.json()
  return (payload.value ?? []).map((item: Record<string, any>) => ({
    id: item.id,
    name: item.name,
    mimeType: item.file?.mimeType ?? (item.folder ? 'folder' : 'application/octet-stream'),
    size: Number(item.size ?? 0),
    isFolder: Boolean(item.folder),
    thumbnailUrl: item.thumbnails?.[0]?.medium?.url ?? '',
    webUrl: item.webUrl ?? '',
    // Short-lived direct link Graph provides for previewing.
    downloadUrl: item['@microsoft.graph.downloadUrl'] ?? '',
    modifiedAt: item.lastModifiedDateTime ?? '',
  }))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(request.url)

  // OAuth callback arrives as a browser redirect, not an app fetch.
  if (request.method === 'GET' && url.searchParams.has('code')) {
    const code = url.searchParams.get('code') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const db = admin()

    const { data: pending } = await db
      .from('cloud_oauth_states')
      .select('*')
      .eq('state', state)
      .maybeSingle()

    if (!pending) {
      return Response.redirect(`${APP_URL}/?cloud=invalid_state`, 302)
    }

    await db.from('cloud_oauth_states').delete().eq('state', state)

    const provider = pending.provider as ProviderKey
    const config = PROVIDERS[provider]

    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: FUNCTION_URL,
      }),
    })

    if (!tokenResponse.ok) {
      console.error('token exchange failed', await tokenResponse.text())
      return Response.redirect(`${APP_URL}/?cloud=failed`, 302)
    }

    const token = await tokenResponse.json()

    let accountEmail = ''
    try {
      const meUrl = provider === 'google'
        ? 'https://www.googleapis.com/oauth2/v2/userinfo'
        : 'https://graph.microsoft.com/v1.0/me'
      const me = await fetch(meUrl, { headers: { Authorization: `Bearer ${token.access_token}` } })
      const profile = await me.json()
      accountEmail = profile.email ?? profile.mail ?? profile.userPrincipalName ?? ''
    } catch {
      // A missing display email is not worth failing the connection over.
    }

    await db.from('cloud_connections').upsert(
      {
        user_id: pending.user_id,
        provider,
        account_email: accountEmail,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
        scope: token.scope ?? config.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )

    return Response.redirect(`${APP_URL}/?cloud=connected&provider=${provider}`, 302)
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const user = await userFromRequest(request)
  if (!user) {
    return json({ error: 'Authentication required.' }, 401)
  }

  try {
    const body = await request.json()
    const action = body.action as string
    const provider = body.provider as ProviderKey

    if (action === 'connect') {
      const config = PROVIDERS[provider]
      if (!config?.clientId) {
        return json({ error: `${provider} is not configured on this deployment.` }, 503)
      }

      const db = admin()
      await db.rpc('prune_cloud_oauth_states')

      const state = crypto.randomUUID()
      await db.from('cloud_oauth_states').insert({ state, user_id: user.id, provider })

      const authUrl = new URL(config.authUrl)
      authUrl.searchParams.set('client_id', config.clientId)
      authUrl.searchParams.set('redirect_uri', FUNCTION_URL)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', config.scope)
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')

      return json({ url: authUrl.toString() })
    }

    if (action === 'list') {
      const accessToken = await freshAccessToken(user.id, provider)
      const items = provider === 'google'
        ? await listGoogle(accessToken, body.folderId ?? '', body.search ?? '')
        : await listMicrosoft(accessToken, body.folderId ?? '', body.search ?? '', body.siteId ?? '')

      return json({ items })
    }

    if (action === 'calendar' && provider === 'google') {
      const accessToken = await freshAccessToken(user.id, provider)
      const timeMin = body.timeMin ?? new Date().toISOString()
      const timeMax = body.timeMax ?? new Date(Date.now() + 31 * 86400000).toISOString()
      const events = await listGoogleCalendarEvents(accessToken, timeMin, timeMax)
      return json({ events })
    }

    // A fresh, short-lived link for previewing or dragging a file into an editor.
    if (action === 'link') {
      const accessToken = await freshAccessToken(user.id, provider)

      if (provider === 'google') {
        return json({
          url: `https://www.googleapis.com/drive/v3/files/${body.fileId}?alt=media`,
          token: accessToken,
          expiresIn: 3600,
        })
      }

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${body.fileId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      const item = await response.json()
      return json({ url: item['@microsoft.graph.downloadUrl'] ?? item.webUrl, expiresIn: 3600 })
    }

    if (action === 'sites' && provider === 'microsoft') {
      const accessToken = await freshAccessToken(user.id, provider)
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/sites?search=*',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      const payload = await response.json()
      return json({
        sites: (payload.value ?? []).map((site: Record<string, unknown>) => ({
          id: site.id,
          name: site.displayName ?? site.name,
          webUrl: site.webUrl,
        })),
      })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'not_connected' || message === 'reauth_required') {
      return json({ error: message }, 409)
    }
    console.error('cloud-drive failed', error)
    return json({ error: 'Cloud drive request failed.' }, 500)
  }
})
