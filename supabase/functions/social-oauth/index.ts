import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
const FUNCTION_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/social-oauth`

type Platform = 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'x' | 'linkedin'

type ProviderConfig = {
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
  tokenAuth: 'body' | 'basic'
}

const META_SCOPES_BY_PLATFORM: Record<'facebook' | 'instagram', string[]> = {
  facebook: [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
  ],
  instagram: [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish',
  ],
}

const PROVIDERS: Record<'meta' | 'youtube' | 'tiktok' | 'x' | 'linkedin', ProviderConfig> = {
  meta: {
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    clientId: Deno.env.get('META_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('META_CLIENT_SECRET') ?? '',
    scopes: META_SCOPES_BY_PLATFORM.facebook,
    tokenAuth: 'body',
  },
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: Deno.env.get('YOUTUBE_CLIENT_ID') ?? Deno.env.get('youtube_client_id') ?? '',
    clientSecret: Deno.env.get('YOUTUBE_CLIENT_SECRET') ?? Deno.env.get('youtube_client_secret') ?? '',
    scopes: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
    tokenAuth: 'body',
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    clientId: Deno.env.get('TIKTOK_CLIENT_KEY') ?? '',
    clientSecret: Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '',
    scopes: ['user.info.basic', 'video.publish'],
    tokenAuth: 'body',
  },
  x: {
    authUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    clientId: Deno.env.get('X_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('X_CLIENT_SECRET') ?? '',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    tokenAuth: 'basic',
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientId: Deno.env.get('LINKEDIN_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('LINKEDIN_CLIENT_SECRET') ?? '',
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
    tokenAuth: 'body',
  },
}

const platformIsSupported = (value: string): value is Platform =>
  ['facebook', 'instagram', 'youtube', 'tiktok', 'x', 'linkedin'].includes(value)

const providerForPlatform = (platform: Platform) =>
  platform === 'youtube' ? 'youtube' : platform === 'tiktok' ? 'tiktok' : platform === 'x' ? 'x' : platform === 'linkedin' ? 'linkedin' : 'meta'

const scopesForPlatform = (platform: Platform, provider: ProviderConfig) => {
  if (platform === 'facebook' || platform === 'instagram') {
    return META_SCOPES_BY_PLATFORM[platform]
  }
  return provider.scopes
}

const scopeParamForPlatform = (platform: Platform, scopes: string[]) =>
  (platform === 'facebook' || platform === 'instagram' || platform === 'tiktok')
    ? scopes.join(',')
    : scopes.join(' ')

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

const providerConfig = async (providerKey: keyof typeof PROVIDERS) => {
  const fallback = PROVIDERS[providerKey]
  const { data } = await admin()
    .from('developer_app_credentials')
    .select('client_id, client_secret, scopes, enabled')
    .eq('provider', providerKey)
    .maybeSingle()
  if (!data || data.enabled === false) return fallback
  return {
    ...fallback,
    clientId: data.client_id || fallback.clientId,
    clientSecret: data.client_secret || fallback.clientSecret,
    scopes: Array.isArray(data.scopes) && data.scopes.length ? data.scopes : fallback.scopes,
  }
}

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

  if (platform === 'instagram') {
    const pagesResponse = await fetch(
      'https://graph.facebook.com/v21.0/me/accounts?fields=id,name,link,access_token,instagram_business_account{id,username}',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!pagesResponse.ok) throw new Error('Meta Page discovery failed.')
    const payload = await pagesResponse.json()
    const pages = payload.data ?? []
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

  if (platform === 'tiktok') {
    const response = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw new Error('TikTok account discovery failed.')
    const payload = await response.json()
    const user = payload.data?.user
    if (!user?.open_id) throw new Error('TikTok did not return an account.')
    return { id: String(user.open_id), name: String(user.display_name ?? 'TikTok account'), url: '', publishingAccessToken: accessToken }
  }

  if (platform === 'x') {
    const response = await fetch('https://api.x.com/2/users/me?user.fields=username', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw new Error('X account discovery failed.')
    const payload = await response.json()
    if (!payload.data?.id) throw new Error('X did not return an account.')
    return { id: String(payload.data.id), name: `@${payload.data.username ?? 'X account'}`, url: '', publishingAccessToken: accessToken }
  }

  if (platform === 'linkedin') {
    const response = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw new Error('LinkedIn account discovery failed.')
    const payload = await response.json()
    if (!payload.sub) throw new Error('LinkedIn did not return an account.')
    return { id: String(payload.sub), name: String(payload.name ?? 'LinkedIn account'), url: '', publishingAccessToken: accessToken }
  }

  const pagesResponse = await fetch(
    'https://graph.facebook.com/v21.0/me/accounts?fields=id,name,link,access_token,instagram_business_account{id,username}',
    { headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!pagesResponse.ok) throw new Error('Meta Page discovery failed.')
  const payload = await pagesResponse.json()
  const pages = payload.data ?? []

  const page = pages[0]
  if (!page?.id) throw new Error('No Facebook Page is available for this Meta account.')
  return {
    id: String(page.id),
    name: String(page.name ?? 'Facebook Page'),
    url: String(page.link ?? ''),
    publishingAccessToken: String(page.access_token ?? accessToken),
  }
}

const redirect = (status: string, platform: string, reason = '') => {
  const destination = new URL(APP_URL)
  destination.searchParams.set('social', status)
  destination.searchParams.set('platform', platform)
  if (reason.trim()) {
    destination.searchParams.set('reason', reason.trim().slice(0, 180))
  }
  return Response.redirect(destination.toString(), 302)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  }

  const url = new URL(request.url)
  if (request.method === 'GET' && url.searchParams.has('error')) {
    const state = url.searchParams.get('state') ?? ''
    const providerError = url.searchParams.get('error_description')
      ?? url.searchParams.get('error')
      ?? 'Provider denied authorization.'

    let platform = 'unknown'
    if (state) {
      const db = admin()
      const { data: pending } = await db
        .from('social_oauth_states')
        .select('platform')
        .eq('state', state)
        .maybeSingle()

      if (pending && platformIsSupported(pending.platform)) {
        platform = pending.platform
      }

      await db.from('social_oauth_states').delete().eq('state', state)
    }

    return redirect('provider_error', platform, providerError)
  }

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
    const provider = await providerConfig(providerForPlatform(platform))
    const oauthScopes = scopesForPlatform(platform, provider)

    try {
      const tokenHeaders: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
      const tokenBody: Record<string, string> = {
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: FUNCTION_URL,
      }
      if (pending.code_verifier) tokenBody.code_verifier = pending.code_verifier
      if (provider.tokenAuth === 'basic') {
        tokenHeaders.Authorization = `Basic ${btoa(`${provider.clientId}:${provider.clientSecret}`)}`
        delete tokenBody.client_secret
      }
      if (platform === 'tiktok') {
        tokenBody.client_key = provider.clientId
        delete tokenBody.client_id
      }
      const tokenResponse = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: tokenHeaders,
        body: new URLSearchParams(tokenBody),
      })
      if (!tokenResponse.ok) throw new Error('OAuth token exchange failed.')

      const token = await tokenResponse.json()
      const tokenData = token.data ?? token
      const accessToken = tokenData.access_token
      if (!accessToken) throw new Error('OAuth provider did not return an access token.')
      const account = await queryProviderAccounts(platform, accessToken)
      const expiresIn = tokenData.expires_in
      const expiresAt = expiresIn
        ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString()
        : null

      const { data: existingCredential } = await db
        .from('social_oauth_credentials')
        .select('refresh_token')
        .eq('user_id', pending.user_id)
        .eq('platform', platform)
        .maybeSingle()

      const credentialResult = await db.from('social_oauth_credentials').upsert({
        user_id: pending.user_id,
        platform,
        external_account_id: account.id,
        access_token: account.publishingAccessToken,
        refresh_token: tokenData.refresh_token ?? existingCredential?.refresh_token ?? null,
        expires_at: expiresAt,
        scope: tokenData.scope ?? oauthScopes.join(' '),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' })
      if (credentialResult.error) throw credentialResult.error

      const accountResult = await db.from('user_social_accounts').upsert({
        user_id: pending.user_id,
        platform,
        account_name: account.name,
        account_type: platform === 'facebook' ? 'page' : platform === 'instagram' ? 'professional' : platform === 'youtube' ? 'channel' : 'profile',
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
      const message = error instanceof Error ? error.message : 'OAuth callback failed.'
      console.error('social OAuth callback failed', platform, message)
      return redirect('failed', platform, message)
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

      const readiness = await Promise.all([
          {
            platform: 'facebook',
            provider: 'meta',
            oauthImplemented: true,
            publishing: 'Facebook Page text posts',
          },
          {
            platform: 'instagram',
            provider: 'meta',
            oauthImplemented: true,
            publishing: 'Instagram Professional single-image posts',
          },
          {
            platform: 'youtube',
            provider: 'youtube',
            oauthImplemented: true,
            publishing: 'YouTube video uploads',
          },
          ...['tiktok', 'x', 'linkedin'].map((platform) => ({
            platform,
            provider: platform,
            oauthImplemented: true,
            publishing: `${platform} text and media publishing`,
          })),
          {
            platform: 'snapchat',
            provider: 'snapchat',
            oauthConfigured: false,
            oauthImplemented: false,
            publishing: 'Snapchat Public Profile API target is not selected',
          },
        ].map(async (entry) => {
          if (entry.provider === 'snapchat') return entry
          const config = await providerConfig(entry.provider as keyof typeof PROVIDERS)
          return { ...entry, oauthConfigured: Boolean(config.clientId && config.clientSecret) }
        }),
      )

      return json({ platforms: await Promise.all(readiness) }, 200, request)
    }

    const platform = String(body.platform ?? '').toLowerCase()
    if (body.action !== 'connect' || !platformIsSupported(platform)) {
      return json({ error: 'This social platform is not available for OAuth yet.' }, 400, request)
    }

    const provider = await providerConfig(providerForPlatform(platform))
    const oauthScopes = scopesForPlatform(platform, provider)
    if (!provider.clientId || !provider.clientSecret) {
      return json({ error: `${platform} OAuth is not configured on this deployment.` }, 503, request)
    }

    const db = admin()
    await db.rpc('prune_social_oauth_states')
    const state = crypto.randomUUID()
    const codeVerifier = platform === 'x' ? base64Url(crypto.getRandomValues(new Uint8Array(32))) : ''
    const requestedScopes = Array.isArray(body.requestedScopes)
      ? body.requestedScopes.filter((scope: unknown) => typeof scope === 'string').slice(0, 10)
      : []
    const stateResult = await db.from('social_oauth_states').insert({
      state,
      user_id: user.id,
      platform,
      requested_scopes: requestedScopes,
      code_verifier: codeVerifier || null,
    })
    if (stateResult.error) throw stateResult.error

    const authorizationUrl = new URL(provider.authUrl)
    authorizationUrl.searchParams.set(platform === 'tiktok' ? 'client_key' : 'client_id', provider.clientId)
    authorizationUrl.searchParams.set('redirect_uri', FUNCTION_URL)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('scope', scopeParamForPlatform(platform, oauthScopes))
    authorizationUrl.searchParams.set('state', state)
    if (platform === 'x') {
      const challenge = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
      authorizationUrl.searchParams.set('code_challenge', base64Url(new Uint8Array(challenge)))
      authorizationUrl.searchParams.set('code_challenge_method', 'S256')
    }
    if (platform === 'youtube') {
      authorizationUrl.searchParams.set('access_type', 'offline')
      authorizationUrl.searchParams.set('prompt', 'consent')
    }

    return json({ url: authorizationUrl.toString() }, 200, request)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to start social authorization.' }, 500, request)
  }
})
