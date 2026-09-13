import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

type ScheduledPost = {
  id: string
  user_id: string
  message: string
  channels: string[]
  media: Array<{ type?: string; mime?: string; name?: string; storagePath?: string; webUrl?: string }>
}

type Credential = {
  platform: string
  external_account_id: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
}

const GRAPH_URL = 'https://graph.facebook.com/v21.0'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
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

const publishFacebookPost = async (credential: Credential, message: string, media: ScheduledPost['media']) => {
  const attachment = media.find((item) => item.type === 'image' || item.type === 'video')
  if (attachment?.type === 'video') {
    throw new Error('Facebook video publishing is not available yet. Remove the video or publish an image instead.')
  }

  if (attachment?.type === 'image' && !attachment.storagePath) {
    throw new Error('Re-upload the selected image before publishing so EchoAI can send it to Facebook.')
  }

  if (attachment?.type === 'image' && attachment.storagePath) {
    const { data: file, error } = await admin().storage.from('social-media').download(attachment.storagePath)
    if (error || !file) throw new Error('Unable to retrieve the selected image for Facebook publishing.')

    const form = new FormData()
    form.set('message', message)
    form.set('access_token', credential.access_token)
    form.set('source', file, attachment.name ?? 'image')
    const response = await fetch(`${GRAPH_URL}/${credential.external_account_id}/photos`, {
      method: 'POST',
      body: form,
    })
    if (!response.ok) throw new Error(await providerError(response, 'Facebook image publishing failed.'))
    const payload = await response.json()
    if (!payload.post_id && !payload.id) throw new Error('Facebook did not return a post ID.')
    return String(payload.post_id ?? payload.id)
  }

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

const publishYouTubeVideo = async (credential: Credential, post: ScheduledPost) => {
  const video = post.media.find((item) => item.type === 'video' && item.storagePath)
  if (!video?.storagePath) {
    throw new Error('YouTube publishing requires an uploaded video attached to the post.')
  }

  const { data: file, error: downloadError } = await admin().storage.from('social-media').download(video.storagePath)
  if (downloadError || !file) throw new Error('Unable to retrieve the selected video for YouTube publishing.')

  const metadataResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': video.mime || 'video/mp4',
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify({
      snippet: {
        title: (post.campaign || 'EchoAI video').slice(0, 100),
        description: post.message.slice(0, 5000),
      },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
    }),
  })
  if (!metadataResponse.ok) throw new Error(await providerError(metadataResponse, 'YouTube upload session could not be created.'))

  const uploadUrl = metadataResponse.headers.get('location')
  if (!uploadUrl) throw new Error('YouTube did not return an upload URL.')

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${credential.access_token}`,
      'Content-Type': video.mime || 'video/mp4',
      'Content-Length': String(file.size),
    },
    body: file,
  })
  if (!uploadResponse.ok) throw new Error(await providerError(uploadResponse, 'YouTube video upload failed.'))
  const uploaded = await uploadResponse.json()
  if (!uploaded.id) throw new Error('YouTube did not return a video ID.')
  return String(uploaded.id)
}

const refreshYouTubeCredential = async (credential: Credential, userId: string) => {
  if (credential.platform !== 'youtube' || !credential.refresh_token || !credential.expires_at) return credential
  if (new Date(credential.expires_at).getTime() > Date.now() + 60_000) return credential

  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID') ?? Deno.env.get('youtube_client_id') ?? ''
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET') ?? Deno.env.get('youtube_client_secret') ?? ''
  if (!clientId || !clientSecret) throw new Error('YouTube token refresh is not configured.')

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: credential.refresh_token, grant_type: 'refresh_token' }),
  })
  if (!response.ok) throw new Error(await providerError(response, 'YouTube authorization could not be refreshed.'))
  const token = await response.json()
  const refreshed = { ...credential, access_token: token.access_token, expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString() }
  await admin().from('social_oauth_credentials').update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('platform', 'youtube')
  return refreshed
}

const publishChannel = async (post: ScheduledPost, channel: string, credential: Credential) => {
  if (channel === 'facebook') return publishFacebookPost(credential, post.message, post.media ?? [])
  if (channel === 'instagram') return publishInstagramImage(credential, post.message, post.media ?? [])
  if (channel === 'youtube') return publishYouTubeVideo(credential, post)
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
      .select('platform, external_account_id, access_token, refresh_token, expires_at')
      .eq('user_id', post.user_id)
      .eq('platform', channel)
      .maybeSingle<Credential>()

    if (!credential) {
      failures.push(`${channel}: credential is missing`)
      continue
    }
    let activeCredential: Credential
    try {
      activeCredential = await refreshYouTubeCredential(credential, post.user_id)
    } catch (error) {
      failures.push(`${channel}: ${error instanceof Error ? error.message : 'authorization refresh failed'}`)
      continue
    }
    if (activeCredential.expires_at && new Date(activeCredential.expires_at) <= new Date()) {
      await db
        .from('user_social_accounts')
        .update({ connection_status: 'reauth_required', updated_at: new Date().toISOString() })
        .eq('user_id', post.user_id)
        .eq('platform', channel)
      failures.push(`${channel}: authorization expired`)
      continue
    }

    try {
      providerPostIds[channel] = await publishChannel(post, channel, activeCredential)
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
  if (!user || !['publish_now', 'cancel_scheduled'].includes(body.action) || typeof body.postId !== 'string') {
    return json({ error: 'Authentication and a post ID are required.' }, 401, request)
  }

  const db = admin()
  if (body.action === 'cancel_scheduled') {
    const { data: cancelled, error: cancelError } = await db
      .from('scheduled_posts')
      .delete()
      .eq('id', body.postId)
      .eq('user_id', user.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()
    if (cancelError) return json({ error: cancelError.message }, 500, request)
    if (!cancelled) return json({ error: 'This post is not owned by the signed-in user or is no longer queued.' }, 409, request)
    return json({ id: cancelled.id, deleted: true }, 200, request)
  }

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
