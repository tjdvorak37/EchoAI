import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
const FUNCTION_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/social-oauth`

type Platform = 'facebook' | 'instagram' | 'youtube'

type ProviderConfig = {
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
}

const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
]

const PROVIDERS: Record<'meta' | 'youtube', ProviderConfig> = {
  meta: {
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    clientId: Deno.env.get('META_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('META_CLIENT_SECRET') ?? '',
    scopes: META_SCOPES,
  },
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: Deno.env.get('YOUTUBE_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('YOUTUBE_CLIENT_SECRET') ?? '',
    scopes: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
  },
}

const platformIsSupported = (value: string): value is Platform =>
  ['facebook', 'instagram', 'youtube'].includes(value)

const providerForPlatform = (platform: Platform) =>
  platform === 'youtube' ? 'youtube' : 'meta'

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

const userFromRequest = async (request: Request) => {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )
  const { data } = await client.auth.getUser(authorization.slice('Bearer '.length))
  return data.user ?? null
}

const queryProviderAccounts = async (platform: Platform, accessToken: string) => {
  if (platform === 'youtube') {
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!response.ok) throw new Error('YouTube account discovery failed.')
    const payload = await response.json()
    const channel = payload.items?.[0]
    if (!channel?.id) throw new Error('No YouTube channel is available for this Google account.')
    return {
      id: String(channel.id),
      name: String(channel.snippet?.title ?? 'YouTube channel'),
      url: `https://www.youtube.com/channel/${channel.id}`,
      publishingAccessToken: accessToken,
    }
  }

  const pagesResponse = await fetch(
    'https://graph.facebook.com/v21.0/me/accounts?fields=id,name,link,access_token,instagram_business_account{id,username}',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!pagesResponse.ok) throw new Error('Meta Page discovery failed.')
  const payload = await pagesResponse.json()
  const pages = payload.data ?? []

  if (platform === 'instagram') {
    const page = pages.find((entry: Record<string, unknown>) => entry.instagram_business_account)
    const instagram = page?.instagram_business_account as Record<string, unknown> | undefined
    if (!instagram?.id) throw new Error('Connect an Instagram Professional account to a Facebook Page before authorizing EchoAI.')
    const username = String(instagram.username ?? page.name ?? 'Instagram account')
    return {
      id: String(instagram.id),
      name: username.startsWith('@') ? username : `@${username}`,
      url: '',
      publishingAccessToken: String(page.access_token ?? accessToken),
    }
  }

  const page = pages[0]
  if (!page?.id) throw new Error('No Facebook Page is available for this Meta account.')
  return {
    id: String(page.id),
    name: String(page.name ?? 'Facebook Page'),
    url: String(page.link ?? ''),
    publishingAccessToken: String(page.access_token ?? accessToken),
  }
}

const redirect = (status: string, platform: string) =>
  Response.redirect(`${APP_URL}/?social=${encodeURIComponent(status)}&platform=${encodeURIComponent(platform)}`, 302)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  }

  const url = new URL(request.url)
  if (request.method === 'GET' && url.searchParams.has('code')) {
    const code = url.searchParams.get('code') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const db = admin()
    const { data: pending } = await db
      .from('social_oauth_states')
      .select('*')
      .eq('state', state)
      .maybeSingle()

    if (!pending || !platformIsSupported(pending.platform)) {
      return redirect('invalid_state', 'unknown')
    }

    await db.from('social_oauth_states').delete().eq('state', state)
    const platform = pending.platform
    const provider = PROVIDERS[providerForPlatform(platform)]

    try {
      const tokenResponse = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: provider.clientId,
          client_secret: provider.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: FUNCTION_URL,
        }),
      })
      if (!tokenResponse.ok) throw new Error('OAuth token exchange failed.')

      const token = await tokenResponse.json()
      const account = await queryProviderAccounts(platform, token.access_token)
      const expiresAt = token.expires_in
        ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
        : null

      const credentialResult = await db.from('social_oauth_credentials').upsert({
        user_id: pending.user_id,
        platform,
        external_account_id: account.id,
        access_token: account.publishingAccessToken,
        refresh_token: token.refresh_token ?? null,
        expires_at: expiresAt,
        scope: token.scope ?? provider.scopes.join(' '),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' })
      if (credentialResult.error) throw credentialResult.error

      const accountResult = await db.from('user_social_accounts').upsert({
        user_id: pending.user_id,
        platform,
        account_name: account.name,
        account_type: platform === 'facebook' ? 'page' : platform === 'instagram' ? 'professional' : 'channel',
        external_account_id: account.id,
        provider_account_url: account.url,
        publishing_scopes: pending.requested_scopes,
        connection_status: 'oauth_connected',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' })
      if (accountResult.error) throw accountResult.error

      return redirect('connected', platform)
    } catch (error) {
      console.error('social OAuth callback failed', platform, error instanceof Error ? error.message : 'unknown error')
      return redirect('failed', platform)
    }
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, request)
  }

  const user = await userFromRequest(request)
  if (!user) return json({ error: 'Authentication required.' }, 401, request)

  try {
    const body = await request.json()
    if (body.action === 'status') {
      const db = admin()
      const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profileError) throw profileError
      if (!['admin', 'super_admin', 'it'].includes(String(profile.role).toLowerCase())) {
        return json({ error: 'Administrator access is required.' }, 403, request)
      }

      return json({
        platforms: [
          {
            platform: 'facebook',
            oauthConfigured: Boolean(PROVIDERS.meta.clientId && PROVIDERS.meta.clientSecret),
            oauthImplemented: true,
            publishing: 'Facebook Page text posts',
          },
          {
            platform: 'instagram',
            oauthConfigured: Boolean(PROVIDERS.meta.clientId && PROVIDERS.meta.clientSecret),
            oauthImplemented: true,
            publishing: 'Instagram Professional single-image posts',
          },
          {
            platform: 'youtube',
            oauthConfigured: Boolean(PROVIDERS.youtube.clientId && PROVIDERS.youtube.clientSecret),
            oauthImplemented: true,
            publishing: 'Authorization ready; video publishing pending',
          },
          ...['tiktok', 'x', 'linkedin', 'snapchat'].map((platform) => ({
            platform,
            oauthConfigured: false,
            oauthImplemented: false,
            publishing: 'Provider adapter not deployed',
          })),
        ],
      }, 200, request)
    }

    const platform = String(body.platform ?? '').toLowerCase()
    if (body.action !== 'connect' || !platformIsSupported(platform)) {
      return json({ error: 'This social platform is not available for OAuth yet.' }, 400, request)
    }

    const provider = PROVIDERS[providerForPlatform(platform)]
    if (!provider.clientId || !provider.clientSecret) {
      return json({ error: `${platform} OAuth is not configured on this deployment.` }, 503, request)
    }

    const db = admin()
    await db.rpc('prune_social_oauth_states')
    const state = crypto.randomUUID()
    const requestedScopes = Array.isArray(body.requestedScopes)
      ? body.requestedScopes.filter((scope: unknown) => typeof scope === 'string').slice(0, 10)
      : []
    const stateResult = await db.from('social_oauth_states').insert({
      state,
      user_id: user.id,
      platform,
      requested_scopes: requestedScopes,
    })
    if (stateResult.error) throw stateResult.error

    const authorizationUrl = new URL(provider.authUrl)
    authorizationUrl.searchParams.set('client_id', provider.clientId)
    authorizationUrl.searchParams.set('redirect_uri', FUNCTION_URL)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('scope', provider.scopes.join(' '))
    authorizationUrl.searchParams.set('state', state)
    if (platform === 'youtube') {
      authorizationUrl.searchParams.set('access_type', 'offline')
      authorizationUrl.searchParams.set('prompt', 'consent')
    }

    return json({ url: authorizationUrl.toString() }, 200, request)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to start social authorization.' }, 500, request)
  }
})
