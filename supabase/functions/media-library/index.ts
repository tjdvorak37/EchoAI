// Stock media library for the Video Editor: royalty-free sound effects (Freesound CC0 via Openverse,
// no key needed) and stock/transition videos (Pixabay, needs PIXABAY_API_KEY).
// Downloads are proxied because Pixabay's CDN sends no CORS headers, and editing/export needs
// same-origin blobs. Only allowlisted CDN hosts can be fetched, so this is not an open proxy.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const DOWNLOAD_HOSTS = new Set(['cdn.pixabay.com', 'cdn.freesound.org', 'pixabay.com'])
const MAX_DOWNLOAD_BYTES = 400 * 1024 * 1024
const PAGE_SIZE = 20
const IMAGE_PAGE_SIZE = 40
const MAX_PAGE = 100

const cleanQuery = (value: unknown, fallback: string) => {
  const text = typeof value === 'string' ? value.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim().slice(0, 80) : ''
  return text || fallback
}

const pageNumber = (value: unknown) => Math.max(1, Math.min(MAX_PAGE, Math.floor(Number(value) || 1)))

// A key saved from IT / Management (Vault) wins over the PIXABAY_API_KEY server secret.
let cachedKey: { value: string, expires: number } | null = null
const pixabayKey = async () => {
  if (cachedKey && cachedKey.expires > Date.now()) return cachedKey.value
  let value = ''
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })
    const { data } = await admin.rpc('get_integration_secret', { p_name: 'pixabay_api_key' })
    value = typeof data === 'string' ? data : ''
  } catch (error) {
    console.error('pixabay key lookup failed', error)
  }
  value = value || Deno.env.get('PIXABAY_API_KEY') || ''
  cachedKey = { value, expires: Date.now() + 60_000 }
  return value
}

const searchSounds = async (query: string, page: number) => {
  const params = new URLSearchParams({
    q: query,
    license: 'cc0',
    source: 'freesound',
    page_size: String(PAGE_SIZE),
    page: String(page),
    mature: 'false',
  })
  const response = await fetch(`https://api.openverse.org/v1/audio/?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'EchoAI-media-library/1.0' },
  })
  if (!response.ok) throw new Error(`Sound search failed (${response.status}).`)
  const payload = await response.json()
  const items = (payload.results ?? [])
    .filter((item: Record<string, unknown>) => {
      try {
        return DOWNLOAD_HOSTS.has(new URL(String(item.url)).hostname)
      } catch {
        return false
      }
    })
    .map((item: Record<string, unknown>) => ({
      id: `sound-${item.id}`,
      kind: 'sound',
      title: String(item.title ?? 'Sound effect'),
      creator: String(item.creator ?? 'Freesound contributor'),
      duration: Number(item.duration ?? 0) / 1000,
      url: String(item.url),
      pageUrl: String(item.foreign_landing_url ?? ''),
      license: 'CC0 (no attribution required)',
      tags: ((item.tags as Array<{ name?: string }> | undefined) ?? []).map((tag) => tag.name).filter(Boolean).slice(0, 5),
    }))
  return { configured: true, items, hasMore: page < Math.min(MAX_PAGE, Number(payload.page_count ?? 0)), provider: 'Freesound via Openverse' }
}

const IMAGE_TYPES = new Set(['all', 'photo', 'illustration', 'vector'])
const VIDEO_TYPES = new Set(['all', 'film', 'animation'])

const searchImages = async (query: string, page: number, imageType: unknown, order: unknown) => {
  const key = await pixabayKey()
  if (!key) return { configured: false, items: [], hasMore: false, provider: 'Pixabay' }
  const params = new URLSearchParams({
    key,
    page: String(page),
    per_page: String(IMAGE_PAGE_SIZE),
    safesearch: 'true',
    image_type: IMAGE_TYPES.has(String(imageType)) ? String(imageType) : 'all',
    order: order === 'latest' ? 'latest' : 'popular',
  })
  if (query) params.set('q', query)
  const response = await fetch(`https://pixabay.com/api/?${params}`)
  if (!response.ok) throw new Error(`Image search failed (${response.status}).`)
  const payload = await response.json()
  const items = (payload.hits ?? []).map((hit: Record<string, unknown>) => ({
    id: `image-${hit.id}`,
    kind: 'image',
    title: String(hit.tags ?? 'Stock image'),
    creator: String(hit.user ?? 'Pixabay contributor'),
    thumbnail: String(hit.webformatURL ?? hit.previewURL ?? ''),
    url: String(hit.largeImageURL ?? hit.webformatURL ?? ''),
    width: Number(hit.imageWidth ?? 0),
    height: Number(hit.imageHeight ?? 0),
    type: String(hit.type ?? 'photo'),
    pageUrl: String(hit.pageURL ?? ''),
    license: 'Pixabay Content License (free, no attribution required)',
  }))
  return { configured: true, items, total: Number(payload.totalHits ?? 0), hasMore: page < MAX_PAGE && page * IMAGE_PAGE_SIZE < Number(payload.totalHits ?? 0), provider: 'Pixabay' }
}

const searchVideos = async (query: string, page: number, videoType: unknown, order: unknown) => {
  const key = await pixabayKey()
  if (!key) return { configured: false, items: [], hasMore: false, provider: 'Pixabay' }
  const params = new URLSearchParams({
    key, page: String(page), per_page: String(PAGE_SIZE), safesearch: 'true',
    video_type: VIDEO_TYPES.has(String(videoType)) ? String(videoType) : 'all',
    order: order === 'latest' ? 'latest' : 'popular',
  })
  if (query) params.set('q', query)
  const response = await fetch(`https://pixabay.com/api/videos/?${params}`)
  if (!response.ok) throw new Error(`Video search failed (${response.status}).`)
  const payload = await response.json()
  type Rendition = { url?: string, width?: number, height?: number, size?: number, thumbnail?: string }
  const items = (payload.hits ?? []).map((hit: Record<string, unknown>) => {
    const videos = (hit.videos ?? {}) as Record<string, Rendition>
    const rendition = (entry?: Rendition) => entry?.url ? { url: entry.url, width: entry.width ?? 0, height: entry.height ?? 0, size: entry.size ?? 0 } : null
    const large = rendition(videos.large)
    return {
      id: `video-${hit.id}`,
      kind: 'video',
      title: String(hit.tags ?? 'Stock video'),
      creator: String(hit.user ?? 'Pixabay contributor'),
      duration: Number(hit.duration ?? 0),
      thumbnail: videos.medium?.thumbnail || videos.small?.thumbnail || videos.tiny?.thumbnail || '',
      previewUrl: videos.tiny?.url || videos.small?.url || '',
      renditions: {
        uhd: large && large.width >= 3840 ? large : null,
        hd: rendition(videos.medium) ?? large,
        sd: rendition(videos.small) ?? rendition(videos.tiny),
      },
      pageUrl: String(hit.pageURL ?? ''),
      license: 'Pixabay Content License (free, no attribution required)',
    }
  })
  return { configured: true, items, total: Number(payload.totalHits ?? 0), hasMore: page < MAX_PAGE && page * PAGE_SIZE < Number(payload.totalHits ?? 0), provider: 'Pixabay' }
}

const download = async (rawUrl: unknown, request: Request) => {
  let url: URL
  try {
    url = new URL(String(rawUrl))
  } catch {
    return json({ error: 'Invalid media URL.' }, 400, request)
  }
  if (url.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(url.hostname)) {
    return json({ error: 'That media source is not allowed.' }, 400, request)
  }
  const upstream = await fetch(url, { redirect: 'follow' })
  const finalHost = new URL(upstream.url).hostname
  if (!upstream.ok || !upstream.body || !DOWNLOAD_HOSTS.has(finalHost)) {
    return json({ error: `The media file could not be downloaded (${upstream.status}).` }, 502, request)
  }
  const type = upstream.headers.get('content-type') ?? ''
  if (!type.startsWith('audio/') && !type.startsWith('video/') && !type.startsWith('image/')) {
    return json({ error: 'The media source returned an unexpected file type.' }, 502, request)
  }
  const size = Number(upstream.headers.get('content-length') ?? 0)
  if (size > MAX_DOWNLOAD_BYTES) {
    return json({ error: 'That file is too large. Pick a smaller quality.' }, 413, request)
  }
  // octet-stream makes supabase-js hand the client a Blob instead of decoding text.
  return new Response(upstream.body, {
    status: 200,
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/octet-stream', ...(size ? { 'Content-Length': String(size) } : {}) },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, request)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Authentication required.' }, 401, request)
  }
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )
  const { data: userData } = await client.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!userData?.user) {
    return json({ error: 'Authentication required.' }, 401, request)
  }

  try {
    const body = await request.json()
    if (body.action === 'download') return await download(body.url, request)
    if (body.action === 'search') {
      const page = pageNumber(body.page)
      if (body.kind === 'sound') return json(await searchSounds(cleanQuery(body.query, 'whoosh'), page), 200, request)
      if (body.kind === 'video') return json(await searchVideos(cleanQuery(body.query, ''), page, body.videoType, body.order), 200, request)
      if (body.kind === 'image') return json(await searchImages(cleanQuery(body.query, ''), page, body.imageType, body.order), 200, request)
    }
    return json({ error: 'Unknown request.' }, 400, request)
  } catch (error) {
    console.error('media-library failed', error)
    return json({ error: error instanceof Error ? error.message : 'Media library request failed.' }, 502, request)
  }
})
