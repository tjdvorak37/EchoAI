// Proxies the social listening connectors. Endpoints and keys are read from
// server-side secrets so they never reach the browser.
//
// The browser supplies only the source type and search terms; it can no longer
// name an arbitrary URL, which also removes an SSRF path.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const SOURCE_TYPES = ['social', 'news', 'forums', 'blogs', 'reviews', 'web']

const textValues = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.trim()).slice(0, 5)
  : []

const buildQuery = (body: Record<string, unknown>) => [
  ...textValues(body.brandTerms),
  ...textValues(body.competitorTerms).slice(0, 2),
  ...textValues(body.keywordTerms).slice(0, 3),
  ...textValues(body.hashtagTerms).slice(0, 2),
].join(' ').trim() || 'marketing social media'

const fetchJson = async (url: string) => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'EchoAI-listening/1.0' },
  })
  if (!response.ok) throw new Error(`source failed (${response.status})`)
  return response.json()
}

const toRedditItems = async (query: string, sourceType: string, limit: number) => {
  const payload = await fetchJson(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${limit}`)
  return (payload?.data?.children ?? []).map((entry: Record<string, any>) => {
    const item = entry?.data ?? {}
    return {
      id: `reddit-${sourceType}-${item.id}`,
      text: `${item.title ?? ''} ${item.selftext ?? ''}`.trim(),
      sourceName: sourceType === 'social' ? 'Reddit public conversations' : 'Reddit public forums',
      platform: 'reddit',
      timestamp: item.created_utc ? new Date(item.created_utc * 1000).toISOString() : new Date().toISOString(),
      author: item.author ? `u/${item.author}` : 'reddit-user',
      engagement: Number(item.num_comments ?? 0),
      reach: Math.max(150, Number(item.score ?? 0) * 45),
      sentiment: Number(item.score ?? 0) >= 4 ? 'positive' : Number(item.score ?? 0) <= -1 ? 'negative' : 'neutral',
    }
  }).filter((item: Record<string, unknown>) => item.text)
}

const managedItemsFor = async (sourceType: string, body: Record<string, unknown>) => {
  const query = buildQuery(body)
  const limit = Math.min(30, Math.max(1, Number(body.limit) || 20))

  if (sourceType === 'social' || sourceType === 'forums') return toRedditItems(query, sourceType, limit)

  if (sourceType === 'news') {
    const payload = await fetchJson(`https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=${limit}`)
    return (payload?.hits ?? []).map((item: Record<string, any>) => ({
      id: `hn-${item.objectID}`,
      text: item.title || item.story_title || '',
      sourceName: 'Hacker News public index',
      platform: 'web',
      timestamp: item.created_at || new Date().toISOString(),
      author: item.author || 'hn-user',
      engagement: Number(item.num_comments ?? 0),
      reach: Math.max(200, Number(item.points ?? 0) * 60),
      sentiment: Number(item.points ?? 0) >= 4 ? 'positive' : 'neutral',
    })).filter((item: Record<string, unknown>) => item.text)
  }

  if (sourceType === 'blogs') {
    const tag = query.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, '') || 'marketing'
    const payload = await fetchJson(`https://dev.to/api/articles?per_page=${limit}&tag=${encodeURIComponent(tag)}`)
    return (Array.isArray(payload) ? payload : []).map((item: Record<string, any>) => ({
      id: `devto-${item.id}`,
      text: `${item.title ?? ''} ${item.description ?? ''}`.trim(),
      sourceName: 'Dev.to public articles',
      platform: 'web',
      timestamp: item.published_at || new Date().toISOString(),
      author: item.user?.name || item.user?.username || 'devto-author',
      engagement: Number(item.positive_reactions_count ?? 0) + Number(item.comments_count ?? 0),
      reach: Math.max(100, Number(item.page_views_count ?? 0)),
      sentiment: 'neutral',
    })).filter((item: Record<string, unknown>) => item.text)
  }

  if (sourceType === 'reviews') {
    const payload = await fetchJson(`https://api.github.com/search/issues?q=${encodeURIComponent(`${query} is:issue`)}&per_page=${limit}`)
    return (payload?.items ?? []).map((item: Record<string, any>) => ({
      id: `github-${item.id}`,
      text: `${item.title ?? ''} ${item.body ?? ''}`.trim(),
      sourceName: 'GitHub public feedback',
      platform: 'web',
      timestamp: item.created_at || new Date().toISOString(),
      author: item.user?.login || 'github-user',
      engagement: Number(item.comments ?? 0),
      reach: Math.max(80, Number(item.comments ?? 0) * 80),
      sentiment: item.state === 'closed' ? 'positive' : 'neutral',
    })).filter((item: Record<string, unknown>) => item.text)
  }

  const payload = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}&origin=*`)
  return (payload?.query?.search ?? []).map((item: Record<string, any>) => ({
    id: `wiki-${item.pageid}`,
    text: `${item.title ?? ''} ${String(item.snippet ?? '').replace(/<[^>]+>/g, '')}`.trim(),
    sourceName: 'Wikipedia public web index',
    platform: 'web',
    timestamp: item.timestamp || new Date().toISOString(),
    author: 'Wikipedia contributors',
    engagement: Number(item.wordcount ?? 0),
    reach: Math.max(100, Number(item.wordcount ?? 0) * 2),
    sentiment: 'neutral',
  })).filter((item: Record<string, unknown>) => item.text)
}

const connectorFor = (sourceType: string) => ({
  endpoint: Deno.env.get(`LISTENING_${sourceType.toUpperCase()}_ENDPOINT`) ?? '',
  apiKey: Deno.env.get(`LISTENING_${sourceType.toUpperCase()}_API_KEY`) ?? '',
})

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
    const requested: string[] = Array.isArray(body.sourceTypes) ? body.sourceTypes : []
    const active = requested.filter((type) => SOURCE_TYPES.includes(type))

    if (!active.length) {
      return json({ results: [], configured: [] }, 200, request)
    }

    const results = await Promise.all(
      active.map(async (sourceType) => {
        const connector = connectorFor(sourceType)

        try {
          if (!connector.endpoint) {
            return { sourceType, items: await managedItemsFor(sourceType, body), error: null, managed: true }
          }
          const upstream = await fetch(connector.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(connector.apiKey
                ? { Authorization: `Bearer ${connector.apiKey}`, 'x-api-key': connector.apiKey }
                : {}),
            },
            body: JSON.stringify({ ...body, sourceTypes: undefined, sourceType }),
          })

          if (!upstream.ok) {
            return { sourceType, items: [], error: `connector failed (${upstream.status})` }
          }

          const contentType = upstream.headers.get('content-type') ?? ''
          const parsed = contentType.includes('application/json')
            ? await upstream.json()
            : await upstream.text()

          return { sourceType, items: parsed, error: null }
        } catch (error) {
          return { sourceType, items: [], error: (error as Error).message }
        }
      }),
    )

    return json({
      results,
      configured: SOURCE_TYPES,
    }, 200, request)
  } catch (error) {
    console.error('listening-fetch failed', error)
    return json({ error: 'Listening sources are unavailable right now.' }, 500, request)
  }
})
