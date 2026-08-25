import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

type ScheduledPost = {
  id: string
  user_id: string
  message: string
  channels: string[]
  media: Array<{ type?: string; webUrl?: string }>
}

type Credential = {
  platform: string
  external_account_id: string
  access_token: string
  expires_at: string | null
}

const GRAPH_URL = 'https://graph.facebook.com/v21.0'
const maxAttempts = 3

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

const isAuthorizedWorker = (request: Request) => {
  const secret = Deno.env.get('SOCIAL_PUBLISHER_CRON_SECRET') ?? ''
  const authorization = request.headers.get('Authorization') ?? ''
  return Boolean(secret) && authorization === `Bearer ${secret}`
}

const providerError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null)
  return payload?.error?.message || fallback
}

const publishFacebookPost = async (credential: Credential, message: string) => {
  const response = await fetch(`${GRAPH_URL}/${credential.external_account_id}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message, access_token: credential.access_token }),
  })
  if (!response.ok) throw new Error(await providerError(response, 'Facebook publishing failed.'))
  const payload = await response.json()
  if (!payload.id) throw new Error('Facebook did not return a post ID.')
  return String(payload.id)
}

const publishInstagramImage = async (credential: Credential, message: string, media: ScheduledPost['media']) => {
  const image = media.find((item) => item.type === 'image' && item.webUrl)
  if (!image?.webUrl) {
    throw new Error('Instagram publishing requires an attached image with a provider-accessible URL.')
  }

  const containerResponse = await fetch(`${GRAPH_URL}/${credential.external_account_id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: image.webUrl, caption: message, access_token: credential.access_token }),
  })
  if (!containerResponse.ok) throw new Error(await providerError(containerResponse, 'Instagram media upload failed.'))
  const container = await containerResponse.json()
  if (!container.id) throw new Error('Instagram did not return a media container ID.')

  const publishResponse = await fetch(`${GRAPH_URL}/${credential.external_account_id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: String(container.id), access_token: credential.access_token }),
  })
  if (!publishResponse.ok) throw new Error(await providerError(publishResponse, 'Instagram publishing failed.'))
  const published = await publishResponse.json()
  if (!published.id) throw new Error('Instagram did not return a post ID.')
  return String(published.id)
}

const publishChannel = async (post: ScheduledPost, channel: string, credential: Credential) => {
  if (channel === 'facebook') return publishFacebookPost(credential, post.message)
  if (channel === 'instagram') return publishInstagramImage(credential, post.message, post.media ?? [])
  throw new Error(`${channel} publishing is not deployed yet.`)
}

const publishPost = async (post: ScheduledPost) => {
  const db = admin()
  const providerPostIds: Record<string, string> = {}
  const failures: string[] = []

  for (const rawChannel of post.channels ?? []) {
    const channel = String(rawChannel).toLowerCase()
    const { data: account } = await db
      .from('user_social_accounts')
      .select('connection_status')
      .eq('user_id', post.user_id)
      .eq('platform', channel)
      .maybeSingle()

    if (account?.connection_status !== 'oauth_connected') {
      failures.push(`${channel}: account authorization is required`)
      continue
    }

    const { data: credential } = await db
      .from('social_oauth_credentials')
      .select('platform, external_account_id, access_token, expires_at')
      .eq('user_id', post.user_id)
      .eq('platform', channel)
      .maybeSingle<Credential>()

    if (!credential) {
      failures.push(`${channel}: credential is missing`)
      continue
    }
    if (credential.expires_at && new Date(credential.expires_at) <= new Date()) {
      await db
        .from('user_social_accounts')
        .update({ connection_status: 'reauth_required', updated_at: new Date().toISOString() })
        .eq('user_id', post.user_id)
        .eq('platform', channel)
      failures.push(`${channel}: authorization expired`)
      continue
    }

    try {
      providerPostIds[channel] = await publishChannel(post, channel, credential)
    } catch (error) {
      failures.push(`${channel}: ${error instanceof Error ? error.message : 'publishing failed'}`)
    }
  }

  if (!failures.length) {
    await db
      .from('scheduled_posts')
      .update({
        status: 'published',
        provider_post_ids: providerPostIds,
        last_publish_error: null,
        published_at: new Date().toISOString(),
      })
      .eq('id', post.id)
    return { id: post.id, status: 'published' }
  }

  const errorMessage = failures.join('; ').slice(0, 2000)
  const { data: current } = await db
    .from('scheduled_posts')
    .select('publish_attempts')
    .eq('id', post.id)
    .single()
  const attempts = Number(current?.publish_attempts ?? maxAttempts)
  const retry = attempts < maxAttempts && !failures.some((failure) => failure.includes('not deployed yet'))

  await db
    .from('scheduled_posts')
    .update({
      status: retry ? 'scheduled' : 'failed',
      scheduled_at: retry ? new Date(Date.now() + attempts * 5 * 60_000).toISOString() : undefined,
      provider_post_ids: providerPostIds,
      last_publish_error: errorMessage,
    })
    .eq('id', post.id)

  return { id: post.id, status: retry ? 'retrying' : 'failed', error: errorMessage }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)

  const body = await request.json().catch(() => ({}))
  if (isAuthorizedWorker(request)) {
    const limit = Math.max(1, Math.min(Number(body.limit) || 25, 100))
    const db = admin()
    const { data: duePosts, error } = await db.rpc('claim_due_scheduled_posts', { p_limit: limit })
    if (error) return json({ error: error.message }, 500, request)

    const results = []
    for (const post of (duePosts ?? []) as ScheduledPost[]) {
      results.push(await publishPost(post))
    }

    return json({ processed: results.length, results }, 200, request)
  }

  const user = await userFromRequest(request)
  if (!user || body.action !== 'publish_now' || typeof body.postId !== 'string') {
    return json({ error: 'Authentication and a post ID are required.' }, 401, request)
  }

  const db = admin()
  const { data: post, error } = await db
    .from('scheduled_posts')
    .update({
      status: 'publishing',
      publishing_started_at: new Date().toISOString(),
      publish_attempts: 1,
    })
    .eq('id', body.postId)
    .eq('user_id', user.id)
    .eq('status', 'scheduled')
    .select('*')
    .maybeSingle<ScheduledPost>()

  if (error) return json({ error: error.message }, 500, request)
  if (!post) return json({ error: 'Post is unavailable or is already being published.' }, 409, request)

  const result = await publishPost(post)
  if (result.status !== 'published') return json(result, 422, request)
  return json(result, 200, request)
})
