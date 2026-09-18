import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
const FUNCTION_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ad-analytics`
const SUPPORTED_PROVIDERS = ['meta', 'google', 'tiktok'] as const
type Provider = typeof SUPPORTED_PROVIDERS[number]

type ProviderConfig = { clientId: string, clientSecret: string, authUrl: string, tokenUrl: string, scopes: string[] }
const providers: Record<Provider, ProviderConfig> = {
  meta: { clientId: Deno.env.get('META_ADS_CLIENT_ID') ?? Deno.env.get('META_CLIENT_ID') ?? '', clientSecret: Deno.env.get('META_ADS_CLIENT_SECRET') ?? Deno.env.get('META_CLIENT_SECRET') ?? '', authUrl: 'https://www.facebook.com/v21.0/dialog/oauth', tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token', scopes: ['ads_read', 'business_management'] },
  google: { clientId: Deno.env.get('GOOGLE_ADS_CLIENT_ID') ?? '', clientSecret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') ?? '', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['openid', 'email', 'https://www.googleapis.com/auth/adwords'] },
  tiktok: { clientId: Deno.env.get('TIKTOK_ADS_CLIENT_KEY') ?? '', clientSecret: Deno.env.get('TIKTOK_ADS_CLIENT_SECRET') ?? '', authUrl: 'https://business-api.tiktok.com/portal/auth', tokenUrl: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', scopes: ['ads.read'] },
}

const db = () => createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })
const isProvider = (value: string): value is Provider => SUPPORTED_PROVIDERS.includes(value as Provider)
const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const makeState = () => base64Url(crypto.getRandomValues(new Uint8Array(32)))
const callbackUrl = (provider: Provider) => `${FUNCTION_URL}?provider=${provider}`

const userFromRequest = async (request: Request) => {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false } })
  const { data } = await client.auth.getUser(token)
  return data.user ?? null
}

const redirect = (status: 'connected' | 'failed', provider: string, message = '') => {
  const url = new URL(APP_URL)
  url.searchParams.set('ads', status)
  url.searchParams.set('provider', provider)
  if (message) url.searchParams.set('ads_error', message)
  return Response.redirect(url.toString(), 302)
}

const metaAccounts = async (accessToken: string) => {
  const response = await fetch('https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=100', { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error('Meta did not return an advertising account.')
  const payload = await response.json()
  return (payload.data ?? []).map((account: { id: string }) => account.id)
}

const googleAccounts = async (accessToken: string) => {
  const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
  if (!developerToken) throw new Error('Google Ads developer token is not configured.')
  const response = await fetch('https://googleads.googleapis.com/v19/customers:listAccessibleCustomers', { headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken } })
  if (!response.ok) throw new Error('Google Ads did not return an accessible customer.')
  const payload = await response.json()
  return (payload.resourceNames ?? []).map((name: string) => name.split('/').pop())
}

const exchangeCode = async (provider: Provider, code: string) => {
  const config = providers[provider]
  const body = provider === 'tiktok'
    ? { app_id: config.clientId, secret: config.clientSecret, auth_code: code, grant_type: 'authorization_code' }
    : { client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: callbackUrl(provider), grant_type: 'authorization_code' }
  const response = await fetch(config.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
  if (!response.ok) throw new Error(`${provider} token exchange failed.`)
  const payload = await response.json()
  return payload.data ?? payload
}

const providerStatus = async (userId: string) => {
  const { data: connections, error } = await db().from('ad_oauth_connections').select('provider, expires_at').eq('user_id', userId)
  if (error) throw error
  return SUPPORTED_PROVIDERS.map((provider) => {
    const connection = connections?.find((item) => item.provider === provider)
    const configured = Boolean(providers[provider].clientId && providers[provider].clientSecret)
    return { provider, status: connection ? 'connected' : configured ? 'not_connected' : 'needs_setup', expiresAt: connection?.expires_at ?? null }
  })
}

const metaReport = async (accessToken: string, accounts: string[], days: number) => {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)
  const campaigns = []
  for (const account of accounts) {
    const endpoint = `https://graph.facebook.com/v21.0/${account}/insights?level=campaign&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&fields=campaign_id,campaign_name,spend,impressions,clicks,actions,cost_per_action_type`
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) continue
    const payload = await response.json()
    for (const row of payload.data ?? []) {
      const conversions = Number(row.actions?.find((action: { action_type: string }) => action.action_type === 'offsite_conversion')?.value ?? 0)
      const spend = Number(row.spend ?? 0)
      campaigns.push({ id: row.campaign_id, provider: 'meta', name: row.campaign_name, spend, impressions: Number(row.impressions ?? 0), clicks: Number(row.clicks ?? 0), conversions, costPerConversion: conversions ? spend / conversions : 0 })
    }
  }
  return campaigns
}

const googleReport = async (accessToken: string, accounts: string[], days: number) => {
  const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
  if (!developerToken) return []
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)
  const query = `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`
  const campaigns = []
  for (const account of accounts) {
    const customerId = account.replaceAll('-', '')
    const response = await fetch(`https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!response.ok) continue
    const batches = await response.json()
    for (const row of batches.flatMap((batch: { results?: unknown[] }) => batch.results ?? []) as Array<{ campaign: { id: string, name: string }, metrics: { costMicros: string, impressions: string, clicks: string, conversions: number }>) {
      const spend = Number(row.metrics.costMicros ?? 0) / 1_000_000
      const conversions = Number(row.metrics.conversions ?? 0)
      campaigns.push({ id: row.campaign.id, provider: 'google', name: row.campaign.name, spend, impressions: Number(row.metrics.impressions ?? 0), clicks: Number(row.metrics.clicks ?? 0), conversions, costPerConversion: conversions ? spend / conversions : 0 })
    }
  }
  return campaigns
}

const tiktokReport = async (accessToken: string, accounts: string[], days: number) => {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)
  const campaigns = []
  for (const advertiserId of accounts) {
    const params = new URLSearchParams({ advertiser_id: advertiserId, report_type: 'BASIC', data_level: 'AUCTION_CAMPAIGN', start_date: since, end_date: until, dimensions: JSON.stringify(['campaign_id']), metrics: JSON.stringify(['campaign_name', 'spend', 'impressions', 'clicks', 'conversion']) })
    const response = await fetch(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params}`, { headers: { 'Access-Token': accessToken } })
    if (!response.ok) continue
    const payload = await response.json()
    for (const row of payload.data?.list ?? []) {
      const spend = Number(row.metrics?.spend ?? 0)
      const conversions = Number(row.metrics?.conversion ?? 0)
      campaigns.push({ id: String(row.dimensions?.campaign_id ?? row.campaign_id), provider: 'tiktok', name: row.metrics?.campaign_name ?? 'TikTok campaign', spend, impressions: Number(row.metrics?.impressions ?? 0), clicks: Number(row.metrics?.clicks ?? 0), conversions, costPerConversion: conversions ? spend / conversions : 0 })
    }
  }
  return campaigns
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) })
  const url = new URL(request.url)
  const callbackProvider = String(url.searchParams.get('provider') ?? '')
  if (request.method === 'GET' && isProvider(callbackProvider)) {
    const state = url.searchParams.get('state') ?? ''
    const code = url.searchParams.get('code') ?? ''
    if (!state || !code) return redirect('failed', callbackProvider, 'Authorization was cancelled.')
    try {
      const database = db()
      const { data: pending } = await database.from('ad_oauth_states').select('*').eq('state', state).eq('provider', callbackProvider).maybeSingle()
      if (!pending || new Date(pending.created_at).getTime() < Date.now() - 15 * 60 * 1000) throw new Error('Authorization expired. Please try again.')
      const token = await exchangeCode(callbackProvider, code)
      const accessToken = token.access_token
      if (!accessToken) throw new Error('The provider did not return an access token.')
      const accounts = callbackProvider === 'meta' ? await metaAccounts(accessToken) : callbackProvider === 'google' ? await googleAccounts(accessToken) : Array.isArray(token.advertiser_ids) ? token.advertiser_ids.map(String) : []
      const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null
      const { error } = await database.from('ad_oauth_connections').upsert({ user_id: pending.user_id, provider: callbackProvider, access_token: accessToken, refresh_token: token.refresh_token ?? null, expires_at: expiresAt, external_account_ids: accounts, updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' })
      if (error) throw error
      await database.from('ad_oauth_states').delete().eq('state', state)
      return redirect('connected', callbackProvider)
    } catch (error) { return redirect('failed', callbackProvider, error instanceof Error ? error.message : 'Authorization failed.') }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)
  const user = await userFromRequest(request)
  if (!user) return json({ error: 'Authentication required.' }, 401, request)
  try {
    const body = await request.json()
    if (body.action === 'status') return json({ connections: await providerStatus(user.id) }, 200, request)
    if (body.action === 'connect' && isProvider(String(body.provider ?? ''))) {
      const provider = body.provider as Provider
      const config = providers[provider]
      if (!config.clientId || !config.clientSecret) return json({ error: `${provider} advertising credentials have not been configured.` }, 409, request)
      const state = makeState()
      await db().from('ad_oauth_states').insert({ state, user_id: user.id, provider })
      const authUrl = new URL(config.authUrl)
      authUrl.searchParams.set('client_id', config.clientId)
      authUrl.searchParams.set('redirect_uri', callbackUrl(provider))
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('scope', provider === 'meta' ? config.scopes.join(',') : config.scopes.join(' '))
      return json({ url: authUrl.toString() }, 200, request)
    }
    if (body.action === 'report') {
      const days = Math.max(1, Math.min(Number(body.days) || 30, 90))
      const { data: connections, error } = await db().from('ad_oauth_connections').select('*').eq('user_id', user.id)
      if (error) throw error
      const reports = await Promise.all((connections ?? []).map((connection) =>
        connection.provider === 'meta'
          ? metaReport(connection.access_token, connection.external_account_ids, days)
          : connection.provider === 'google'
            ? googleReport(connection.access_token, connection.external_account_ids, days)
            : connection.provider === 'tiktok'
              ? tiktokReport(connection.access_token, connection.external_account_ids, days)
              : [],
      ))
      const campaigns = reports.flat()
      const totals = campaigns.reduce((sum, campaign) => ({ spend: sum.spend + campaign.spend, impressions: sum.impressions + campaign.impressions, clicks: sum.clicks + campaign.clicks, conversions: sum.conversions + campaign.conversions }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 })
      const report = { totals: { ...totals, ctr: totals.impressions ? totals.clicks / totals.impressions * 100 : 0, costPerConversion: totals.conversions ? totals.spend / totals.conversions : 0 }, campaigns: campaigns.sort((left, right) => right.spend - left.spend), insights: campaigns.filter((campaign) => campaign.conversions > 0).sort((left, right) => left.costPerConversion - right.costPerConversion).slice(0, 3).map((campaign) => `${campaign.name} has the lowest verified cost per conversion at $${campaign.costPerConversion.toFixed(2)}.`) }
      return json({ report }, 200, request)
    }
    return json({ error: 'Unsupported advertising request.' }, 400, request)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Advertising service failed.' }, 500, request) }
})