import { canUseAgentMode, runUserAiAgent } from './aiAgentService'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'x', 'tiktok', 'youtube', 'linkedin', 'reddit']
const SOURCE_TYPES = ['social', 'news', 'forums', 'blogs', 'reviews', 'web']
const ALERT_WINDOWS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'your',
  'their',
  'about',
  'into',
  'after',
  'when',
  'have',
  'just',
  'will',
  'been',
  'were',
  'they',
  'them',
  'there',
  'what',
  'where',
  'while',
  'across',
  'using',
  'more',
  'than',
  'over',
  'real',
  'time',
])

const SOURCE_CATALOG = [
  { sourceType: 'social', platform: 'instagram', sourceName: 'Instagram feed' },
  { sourceType: 'social', platform: 'x', sourceName: 'X timeline' },
  { sourceType: 'social', platform: 'tiktok', sourceName: 'TikTok comments' },
  { sourceType: 'social', platform: 'youtube', sourceName: 'YouTube comments' },
  { sourceType: 'news', platform: 'web', sourceName: 'Tech News Daily' },
  { sourceType: 'news', platform: 'web', sourceName: 'Martech Wire' },
  { sourceType: 'forums', platform: 'reddit', sourceName: 'r/socialmedia' },
  { sourceType: 'forums', platform: 'reddit', sourceName: 'r/marketing' },
  { sourceType: 'blogs', platform: 'web', sourceName: 'CreatorOps Blog' },
  { sourceType: 'reviews', platform: 'web', sourceName: 'App review portals' },
  { sourceType: 'web', platform: 'web', sourceName: 'Open web mentions' },
]

const CONVERSATION_THEMES = ['feature request', 'pricing', 'support issue', 'campaign result', 'competitor compare', 'onboarding friction']
const CRISIS_KEYWORDS = ['outage', 'broken', 'scam', 'data leak', 'refund', 'lawsuit', 'boycott']
const AI_CHATBOT_TERMS = ['chatgpt', 'gemini', 'copilot', 'claude', 'perplexity']
const SALES_TERMS = ['buy', 'price', 'pricing', 'cost', 'quote', 'order', 'recommend', 'looking for', 'need a', 'where can', 'available']
const PRODUCT_TERMS = ['wish', 'feature', 'request', 'missing', 'issue', 'problem', 'broken', 'support', 'help', 'feedback']
const TREND_TERMS = ['trend', 'popular', 'viral', 'season', 'yearbook', 'sports', 'apparel', 'uniform', 'merch', 'event']

const BUILTIN_SOURCE_NAMES = {
  social: 'Open social adapters',
  news: 'Hacker News index',
  forums: 'Reddit search',
  blogs: 'Dev.to articles',
  reviews: 'GitHub feedback threads',
  web: 'Wikipedia web mentions',
}

// Endpoints and keys now live in the listening-fetch edge function. The client
// only knows which source types exist, never how to reach them.
export const createDefaultListeningConnectors = () => ({
  social: { enabled: isSupabaseConfigured, managed: true },
  news: { enabled: isSupabaseConfigured, managed: true },
  forums: { enabled: isSupabaseConfigured, managed: true },
  blogs: { enabled: isSupabaseConfigured, managed: true },
  reviews: { enabled: isSupabaseConfigured, managed: true },
  web: { enabled: isSupabaseConfigured, managed: true },
})

const hashNumber = (value) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

export const parseTrackedValues = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const safePlatformName = (platform) => {
  const normalized = String(platform || '').trim().toLowerCase()
  if (!normalized) return 'web'
  return SOCIAL_PLATFORMS.includes(normalized) ? normalized : 'web'
}

const pickByHash = (items, key) => items[hashNumber(key) % items.length]

const pickPrimaryTerm = (terms, fallback) => terms.find(Boolean) || fallback

const buildQuery = ({ brandTerms, competitorTerms, keywordTerms, hashtagTerms }) =>
  [
    ...brandTerms.slice(0, 2),
    ...competitorTerms.slice(0, 1),
    ...keywordTerms.slice(0, 2),
    ...hashtagTerms.slice(0, 1),
  ]
    .filter(Boolean)
    .join(' ')

const parseScoreSentiment = (score) => {
  const numeric = Number(score)
  if (!Number.isFinite(numeric)) return 'neutral'
  if (numeric >= 4) return 'positive'
  if (numeric <= -1) return 'negative'
  return 'neutral'
}

const parseUnixSeconds = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return new Date().toISOString()
  return new Date(number * 1000).toISOString()
}

const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = 9000) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

const normalizeLiveResponseArray = (payload) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.mentions)) {
    return payload.mentions
  }

  if (Array.isArray(payload?.items)) {
    return payload.items
  }

  if (Array.isArray(payload?.results)) {
    return payload.results
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  return []
}

const inferSentiment = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (['positive', 'neutral', 'negative'].includes(normalized)) {
    return normalized
  }

  if (normalized.includes('pos')) return 'positive'
  if (normalized.includes('neg')) return 'negative'
  return 'neutral'
}

const normalizeLiveMention = ({ mention, sourceType }) => {
  const text = String(mention.text || mention.content || mention.message || mention.body || '').trim()
  if (!text) {
    return null
  }

  const platform = safePlatformName(mention.platform || mention.network || mention.channel || 'web')
  const followers = Number(mention.followers || mention.audience || mention.authorFollowers || 0)
  const engagement = Number(mention.engagement || mention.interactions || mention.likes || 0)
  const reach = Number(mention.reach || mention.impressions || 0)
  const timestamp = mention.timestamp || mention.publishedAt || mention.createdAt || new Date().toISOString()
  const keyword = String(mention.keyword || mention.topic || '').trim()
  const hashtag = String(mention.hashtag || mention.tag || '').trim()
  const sentiment = inferSentiment(mention.sentiment)

  return {
    id: String(mention.id || mention.uuid || `${sourceType}-${hashNumber(`${text}-${timestamp}`)}`),
    sourceType,
    sourceName: String(mention.sourceName || mention.source || `Live ${sourceType}`),
    platform,
    timestamp,
    sentiment,
    author: String(mention.author || mention.handle || mention.username || 'unknown'),
    followers: Number.isFinite(followers) && followers >= 0 ? followers : 0,
    engagement: Number.isFinite(engagement) && engagement >= 0 ? engagement : 0,
    reach: Number.isFinite(reach) && reach >= 0 ? reach : 0,
    keyword,
    hashtag,
    text,
    competitor: String(mention.competitor || '').trim(),
    includesBrand: Boolean(mention.includesBrand),
    aiReferenced: Boolean(mention.aiReferenced),
    crisis: Boolean(mention.crisis),
    influenceScore: Math.round((Number.isFinite(followers) ? followers : 0) * 0.002 + (Number.isFinite(engagement) ? engagement : 0) * 0.45 + (Number.isFinite(reach) ? reach : 0) * 0.01),
  }
}

const dedupeMentions = (mentions) => {
  const seen = new Set()
  return mentions.filter((mention) => {
    const key = `${mention.id}:${mention.timestamp}:${mention.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const getEnabledConnectorCount = (connectors) =>
  SOURCE_TYPES.filter((sourceType) => Boolean(connectors?.[sourceType]?.enabled)).length

export const fetchLiveMentions = async ({
  connectors,
  brandTerms,
  competitorTerms,
  keywordTerms,
  hashtagTerms,
  connectedPlatforms,
  enabledSourceTypes,
  windowKey,
  maxPerSource = 80,
}) => {
  const activeSourceTypes = enabledSourceTypes.filter((sourceType) =>
    Boolean(connectors?.[sourceType]?.enabled),
  )

  if (!activeSourceTypes.length) {
    return { mentions: [], usedLive: false, errors: [] }
  }

  const sinceIso = new Date(Date.now() - (ALERT_WINDOWS[windowKey] || ALERT_WINDOWS['7d'])).toISOString()
  const payload = {
    brandTerms,
    competitorTerms,
    keywordTerms,
    hashtagTerms,
    platforms: connectedPlatforms,
    sourceTypes: activeSourceTypes,
    since: sinceIso,
    limit: maxPerSource,
  }

  const results = await Promise.all(
    activeSourceTypes.map(async (sourceType) => {
      try {
        const { data, error } = await supabase.functions.invoke('listening-fetch', {
          body: { ...payload, sourceTypes: [sourceType] },
        })

        if (error) {
          throw new Error(error.message)
        }

        const entry = data?.results?.[0]
        if (entry?.error) {
          throw new Error(entry.error)
        }

        const rawItems = normalizeLiveResponseArray(entry?.items)

        const normalizedMentions = rawItems
          .map((item) => normalizeLiveMention({ mention: item, sourceType }))
          .filter(Boolean)

        return { sourceType, mentions: normalizedMentions, error: null }
      } catch (error) {
        return { sourceType, mentions: [], error: error.message }
      }
    }),
  )

  const mentions = dedupeMentions(results.flatMap((entry) => entry.mentions))
  const errors = results.filter((entry) => entry.error).map((entry) => `${entry.sourceType}: ${entry.error}`)

  return {
    mentions,
    usedLive: mentions.length > 0,
    errors,
  }
}

const fetchRedditMentions = async ({ query, sourceType, maxPerSource }) => {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${Math.min(100, maxPerSource)}`
  const json = await fetchJsonWithTimeout(url)
  const items = json?.data?.children || []

  return items
    .map((entry) => {
      const data = entry?.data
      if (!data?.title) return null
      const text = `${data.title} ${data.selftext || ''}`.trim()
      return {
        id: `reddit-${data.id}`,
        sourceType,
        sourceName: BUILTIN_SOURCE_NAMES[sourceType],
        platform: sourceType === 'social' ? 'reddit' : 'reddit',
        timestamp: parseUnixSeconds(data.created_utc),
        sentiment: parseScoreSentiment(data.score),
        author: data.author ? `u/${data.author}` : 'reddit-user',
        followers: 0,
        engagement: Number(data.num_comments || 0),
        reach: Math.max(150, Number(data.score || 0) * 45),
        keyword: '',
        hashtag: '',
        text,
        competitor: '',
        includesBrand: false,
        aiReferenced: AI_CHATBOT_TERMS.some((term) => text.toLowerCase().includes(term)),
        crisis: CRISIS_KEYWORDS.some((word) => text.toLowerCase().includes(word)),
        influenceScore: Math.round(Number(data.num_comments || 0) * 2 + Number(data.score || 0)),
      }
    })
    .filter(Boolean)
}

const fetchHackerNewsMentions = async ({ query, maxPerSource }) => {
  const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=${Math.min(100, maxPerSource)}`
  const json = await fetchJsonWithTimeout(url)
  const hits = json?.hits || []

  return hits
    .map((item) => {
      const title = String(item?.title || item?.story_title || '').trim()
      if (!title) return null
      return {
        id: `hn-${item.objectID}`,
        sourceType: 'news',
        sourceName: BUILTIN_SOURCE_NAMES.news,
        platform: 'web',
        timestamp: item.created_at || new Date().toISOString(),
        sentiment: parseScoreSentiment(Number(item.points || 0) - 3),
        author: item.author || 'hn-user',
        followers: 0,
        engagement: Number(item.num_comments || 0),
        reach: Math.max(200, Number(item.points || 0) * 60),
        keyword: '',
        hashtag: '',
        text: title,
        competitor: '',
        includesBrand: false,
        aiReferenced: AI_CHATBOT_TERMS.some((term) => title.toLowerCase().includes(term)),
        crisis: CRISIS_KEYWORDS.some((word) => title.toLowerCase().includes(word)),
        influenceScore: Math.round(Number(item.num_comments || 0) * 1.8 + Number(item.points || 0) * 1.2),
      }
    })
    .filter(Boolean)
}

const fetchDevToMentions = async ({ tagTerm, maxPerSource }) => {
  const safeTag = String(tagTerm || 'marketing').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'marketing'
  const url = `https://dev.to/api/articles?per_page=${Math.min(30, maxPerSource)}&tag=${encodeURIComponent(safeTag)}`
  const articles = await fetchJsonWithTimeout(url)

  return (Array.isArray(articles) ? articles : [])
    .map((article) => {
      const text = `${article.title || ''} ${article.description || ''}`.trim()
      if (!text) return null
      const positiveScore = Number(article.public_reactions_count || 0) + Number(article.comments_count || 0)
      return {
        id: `devto-${article.id}`,
        sourceType: 'blogs',
        sourceName: BUILTIN_SOURCE_NAMES.blogs,
        platform: 'web',
        timestamp: article.published_at || new Date().toISOString(),
        sentiment: parseScoreSentiment(positiveScore - 3),
        author: article.user?.username ? `@${article.user.username}` : 'devto-author',
        followers: 0,
        engagement: Number(article.comments_count || 0),
        reach: Math.max(200, Number(article.public_reactions_count || 0) * 70),
        keyword: '',
        hashtag: '',
        text,
        competitor: '',
        includesBrand: false,
        aiReferenced: AI_CHATBOT_TERMS.some((term) => text.toLowerCase().includes(term)),
        crisis: CRISIS_KEYWORDS.some((word) => text.toLowerCase().includes(word)),
        influenceScore: Math.round(Number(article.public_reactions_count || 0) * 2 + Number(article.comments_count || 0) * 1.5),
      }
    })
    .filter(Boolean)
}

const fetchGithubReviewMentions = async ({ query, maxPerSource }) => {
  const encodedQuery = encodeURIComponent(`${query} in:title,body state:open`)
  const url = `https://api.github.com/search/issues?q=${encodedQuery}&per_page=${Math.min(50, maxPerSource)}`
  const json = await fetchJsonWithTimeout(url)
  const items = json?.items || []

  return items
    .map((item) => {
      const title = String(item?.title || '').trim()
      if (!title) return null
      const body = String(item?.body || '').slice(0, 320)
      const text = `${title} ${body}`.trim()
      return {
        id: `gh-issue-${item.id}`,
        sourceType: 'reviews',
        sourceName: BUILTIN_SOURCE_NAMES.reviews,
        platform: 'web',
        timestamp: item.created_at || new Date().toISOString(),
        sentiment: item.state === 'open' ? 'negative' : 'neutral',
        author: item.user?.login ? `@${item.user.login}` : 'github-user',
        followers: 0,
        engagement: Number(item.comments || 0),
        reach: Math.max(220, Number(item.comments || 0) * 65),
        keyword: '',
        hashtag: '',
        text,
        competitor: '',
        includesBrand: false,
        aiReferenced: AI_CHATBOT_TERMS.some((term) => text.toLowerCase().includes(term)),
        crisis: CRISIS_KEYWORDS.some((word) => text.toLowerCase().includes(word)),
        influenceScore: Math.round(Number(item.comments || 0) * 1.7 + 18),
      }
    })
    .filter(Boolean)
}

const fetchWikipediaMentions = async ({ query, maxPerSource }) => {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${Math.min(40, maxPerSource)}&srsearch=${encodeURIComponent(query)}`
  const json = await fetchJsonWithTimeout(url)
  const results = json?.query?.search || []

  return results
    .map((item) => {
      const snippet = String(item?.snippet || '').replace(/<[^>]+>/g, ' ')
      const text = `${item.title || ''} ${snippet}`.trim()
      if (!text) return null
      return {
        id: `wiki-${item.pageid}`,
        sourceType: 'web',
        sourceName: BUILTIN_SOURCE_NAMES.web,
        platform: 'web',
        timestamp: item.timestamp || new Date().toISOString(),
        sentiment: 'neutral',
        author: 'wikipedia-index',
        followers: 0,
        engagement: 0,
        reach: 180,
        keyword: '',
        hashtag: '',
        text,
        competitor: '',
        includesBrand: false,
        aiReferenced: AI_CHATBOT_TERMS.some((term) => text.toLowerCase().includes(term)),
        crisis: CRISIS_KEYWORDS.some((word) => text.toLowerCase().includes(word)),
        influenceScore: 24,
      }
    })
    .filter(Boolean)
}

export const fetchBuiltinMentions = async ({
  brandTerms,
  competitorTerms,
  keywordTerms,
  hashtagTerms,
  enabledSourceTypes,
  maxPerSource = 50,
}) => {
  const isBrowserRuntime = typeof window !== 'undefined'
  const query = buildQuery({ brandTerms, competitorTerms, keywordTerms, hashtagTerms }) || 'marketing analytics social media'
  const tagTerm = pickPrimaryTerm(keywordTerms, 'marketing').replace('#', '')
  const reviewQuery = `${pickPrimaryTerm(brandTerms, 'marketing tool')} feedback review`

  // Browser-side Reddit JSON endpoints typically block cross-origin calls.
  // Keep adapters quiet in browser and rely on other CORS-friendly sources.
  const browserBlockedSources = isBrowserRuntime ? new Set(['social', 'forums']) : new Set()

  const sourceFetchers = {
    social: () => fetchRedditMentions({ query, sourceType: 'social', maxPerSource }),
    forums: () => fetchRedditMentions({ query, sourceType: 'forums', maxPerSource }),
    news: () => fetchHackerNewsMentions({ query, maxPerSource }),
    blogs: () => fetchDevToMentions({ tagTerm, maxPerSource }),
    reviews: () => fetchGithubReviewMentions({ query: reviewQuery, maxPerSource }),
    web: () => fetchWikipediaMentions({ query, maxPerSource }),
  }

  const activeSources = enabledSourceTypes.filter((sourceType) => Boolean(sourceFetchers[sourceType]))
  if (!activeSources.length) {
    return { mentions: [], usedBuiltin: false, errors: [] }
  }

  const results = await Promise.all(
    activeSources.map(async (sourceType) => {
      if (browserBlockedSources.has(sourceType)) {
        return {
          sourceType,
          mentions: [],
          error: 'Disabled in browser runtime due to CORS restrictions (use a server-side connector endpoint).',
        }
      }

      try {
        const mentions = await sourceFetchers[sourceType]()
        return { sourceType, mentions, error: null }
      } catch (error) {
        return { sourceType, mentions: [], error: error.message }
      }
    }),
  )

  const mentions = dedupeMentions(results.flatMap((entry) => entry.mentions))
  const errors = results.filter((entry) => entry.error).map((entry) => `${entry.sourceType}: ${entry.error}`)

  return {
    mentions,
    usedBuiltin: mentions.length > 0,
    errors,
  }
}

const buildMentionText = ({ brandTerms, competitorTerms, keywordTerms, hashtagTerms, index }) => {
  const brand = pickByHash(brandTerms, `brand-${index}`)
  const competitor = pickByHash(competitorTerms, `comp-${index}`)
  const keyword = pickByHash(keywordTerms, `kw-${index}`)
  const hashtag = pickByHash(hashtagTerms, `hash-${index}`)
  const theme = pickByHash(CONVERSATION_THEMES, `theme-${index}`)
  const chatbot = pickByHash(AI_CHATBOT_TERMS, `bot-${index}`)

  const options = [
    `${brand} discussion: teams are comparing ${keyword} workflows vs ${competitor}. ${hashtag}`,
    `Conversation thread on ${theme}: users mention ${brand} and ask if ${keyword} is faster than ${competitor}.`,
    `Audience post says ${brand} helped with ${keyword}, but asks for deeper analytics. ${hashtag}`,
    `Review mention: ${brand} appears in ${chatbot} recommendations for ${keyword} use cases.`,
    `Forum feedback references ${brand} and ${competitor} while evaluating ${theme}.`,
  ]

  return pickByHash(options, `text-${index}`)
}

const buildSentiment = (seed) => {
  const value = seed % 100
  if (value < 23) return 'negative'
  if (value < 63) return 'neutral'
  return 'positive'
}

const toIsoWithinWindow = (seed, maxAgeMs) => {
  const offset = seed % maxAgeMs
  return new Date(Date.now() - offset).toISOString()
}

export const generateListeningMentions = ({
  brandTerms,
  competitorTerms,
  keywordTerms,
  hashtagTerms,
  connectedPlatforms,
  enabledSourceTypes,
  count = 80,
}) => {
  const safeBrands = brandTerms.length ? brandTerms : ['EchoAI']
  const safeCompetitors = competitorTerms.length ? competitorTerms : ['Competitor A', 'Competitor B']
  const safeKeywords = keywordTerms.length ? keywordTerms : ['social listening', 'campaign analytics']
  const safeHashtags = hashtagTerms.length ? hashtagTerms : ['#socialmedia', '#marketing']
  const safePlatforms = connectedPlatforms.length ? connectedPlatforms.map(safePlatformName) : ['instagram', 'x', 'reddit', 'web']

  const enabledSources = SOURCE_CATALOG.filter((entry) => enabledSourceTypes.includes(entry.sourceType))
  const sourcePool = enabledSources.length ? enabledSources : SOURCE_CATALOG

  return Array.from({ length: count }, (_, index) => {
    const seedKey = `${safeBrands[0]}-${index}-${safeKeywords.join('|')}`
    const seed = hashNumber(seedKey)
    const sourceTemplate = pickByHash(sourcePool, `src-${seed}`)
    const platform = sourceTemplate.platform === 'web' ? pickByHash(safePlatforms, `plat-${seed}`) : sourceTemplate.platform
    const sentiment = buildSentiment(seed)
    const engagement = 10 + (seed % 980)
    const reach = 400 + (seed % 45000)
    const followers = 200 + (seed % 180000)
    const aiReferenced = seed % 7 === 0
    const text = buildMentionText({
      brandTerms: safeBrands,
      competitorTerms: safeCompetitors,
      keywordTerms: safeKeywords,
      hashtagTerms: safeHashtags,
      index,
    })
    const crisis = CRISIS_KEYWORDS.some((word) => text.toLowerCase().includes(word))
    const keyword = pickByHash(safeKeywords, `kw-hit-${seed}`)
    const hashtag = pickByHash(safeHashtags, `hash-hit-${seed}`)

    return {
      id: `mention_${seed}_${index}`,
      sourceType: sourceTemplate.sourceType,
      sourceName: sourceTemplate.sourceName,
      platform,
      timestamp: toIsoWithinWindow(seed, ALERT_WINDOWS['30d']),
      sentiment,
      author: `@${pickByHash(['pulse', 'trend', 'insight', 'creator', 'brandwatch', 'socialops'], `author-${seed}`)}${seed % 991}`,
      followers,
      engagement,
      reach,
      keyword,
      hashtag,
      text,
      competitor: pickByHash(safeCompetitors, `comp-hit-${seed}`),
      includesBrand: safeBrands.some((term) => text.toLowerCase().includes(term.toLowerCase())),
      aiReferenced,
      crisis,
      influenceScore: Math.round(followers * 0.002 + engagement * 0.45 + reach * 0.01),
    }
  })
}

export const filterMentions = ({ mentions, search, platform, sourceType, sentiment, windowKey }) => {
  const query = String(search || '').trim().toLowerCase()
  const cutoff = Date.now() - (ALERT_WINDOWS[windowKey] || ALERT_WINDOWS['7d'])

  return mentions.filter((mention) => {
    const mentionTime = new Date(mention.timestamp).getTime()
    if (Number.isFinite(mentionTime) && mentionTime < cutoff) {
      return false
    }

    if (platform !== 'all' && mention.platform !== platform) {
      return false
    }

    if (sourceType !== 'all' && mention.sourceType !== sourceType) {
      return false
    }

    if (sentiment !== 'all' && mention.sentiment !== sentiment) {
      return false
    }

    if (!query) return true

    return `${mention.text} ${mention.author} ${mention.keyword} ${mention.hashtag} ${mention.competitor}`
      .toLowerCase()
      .includes(query)
  })
}

export const classifyListeningSignal = (mention) => {
  const content = `${mention.text} ${mention.keyword} ${mention.hashtag}`.toLowerCase()
  const matches = (terms) => terms.filter((term) => content.includes(term))
  const salesMatches = matches(SALES_TERMS)
  const productMatches = matches(PRODUCT_TERMS)
  const trendMatches = matches(TREND_TERMS)

  if (salesMatches.length) return { kind: 'sales', label: 'Sales opportunity', terms: salesMatches }
  if (productMatches.length) return { kind: 'product', label: 'Product feedback', terms: productMatches }
  if (trendMatches.length || mention.reach >= 10000) return { kind: 'trend', label: 'Marketing trend', terms: trendMatches }
  return { kind: 'conversation', label: 'Conversation signal', terms: [] }
}

const tally = (items, getKey) =>
  items.reduce((acc, item) => {
    const key = getKey(item)
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

const percentage = (value, total) => {
  if (!total) return 0
  return Math.round((value / total) * 1000) / 10
}

const getTrendBuckets = (mentions, windowKey) => {
  const windowMs = ALERT_WINDOWS[windowKey] || ALERT_WINDOWS['7d']
  const now = Date.now()
  const currentStart = now - windowMs
  const previousStart = currentStart - windowMs

  let current = 0
  let previous = 0

  mentions.forEach((mention) => {
    const ts = new Date(mention.timestamp).getTime()
    if (!Number.isFinite(ts)) return
    if (ts >= currentStart) current += 1
    if (ts >= previousStart && ts < currentStart) previous += 1
  })

  const deltaPct = previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100)
  return { current, previous, deltaPct }
}

const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

const getTopTokens = (mentions, { hashtagsOnly = false, limit = 8 } = {}) => {
  const tokenCount = new Map()

  mentions.forEach((mention) => {
    tokenize(mention.text).forEach((token) => {
      const isHashtag = token.startsWith('#')
      if (hashtagsOnly && !isHashtag) return
      if (!hashtagsOnly && (isHashtag || STOP_WORDS.has(token) || token.length < 4)) return
      tokenCount.set(token, (tokenCount.get(token) || 0) + 1)
    })
  })

  return [...tokenCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token, count]) => ({ token, count }))
}

export const buildListeningSnapshot = ({ mentions, brandTerms, competitorTerms, windowKey }) => {
  const total = mentions.length
  const sentimentCounts = tally(mentions, (mention) => mention.sentiment)
  const sourceCounts = tally(mentions, (mention) => mention.sourceType)
  const platformCounts = tally(mentions, (mention) => mention.platform)

  const brandHits = mentions.filter((mention) =>
    brandTerms.some((term) => mention.text.toLowerCase().includes(term.toLowerCase())),
  ).length

  const competitorHits = competitorTerms.map((name) => ({
    name,
    mentions: mentions.filter((mention) => mention.text.toLowerCase().includes(name.toLowerCase())).length,
  }))

  const voicePool = [
    { name: brandTerms[0] || 'Brand', mentions: brandHits },
    ...competitorHits,
  ]
  const totalVoice = voicePool.reduce((sum, item) => sum + item.mentions, 0)
  const shareOfVoice = voicePool.map((item) => ({
    ...item,
    sharePct: percentage(item.mentions, totalVoice),
  }))

  const trend = getTrendBuckets(mentions, windowKey)
  const aiVisibilityCount = mentions.filter((mention) => mention.aiReferenced).length
  const crisisCount = mentions.filter((mention) => mention.crisis || (mention.sentiment === 'negative' && mention.reach > 18000)).length

  const influencers = [...mentions]
    .sort((a, b) => b.influenceScore - a.influenceScore)
    .slice(0, 8)
    .map((mention) => ({
      author: mention.author,
      platform: mention.platform,
      followers: mention.followers,
      engagement: mention.engagement,
      reach: mention.reach,
      influenceScore: mention.influenceScore,
      text: mention.text,
      sentiment: mention.sentiment,
    }))

  const alerts = []
  const negativeRate = percentage(sentimentCounts.negative || 0, total)

  if (negativeRate >= 32) {
    alerts.push({
      id: 'alert-negative-spike',
      level: 'high',
      title: 'Negative sentiment spike detected',
      message: `${negativeRate}% of mentions are negative in the selected window.`,
      recommendation: 'Escalate to support/PR and draft a response thread within the next hour.',
    })
  }

  if (trend.deltaPct >= 35) {
    alerts.push({
      id: 'alert-volume-spike',
      level: 'medium',
      title: 'Conversation volume is accelerating',
      message: `Mention volume is up ${trend.deltaPct}% vs the previous period.`,
      recommendation: 'Inspect top conversations and pin root causes before momentum turns negative.',
    })
  }

  if (crisisCount >= 5) {
    alerts.push({
      id: 'alert-crisis',
      level: 'high',
      title: 'Potential crisis signals in high-reach mentions',
      message: `${crisisCount} high-risk mentions flagged (negative + high reach or crisis keyword).`,
      recommendation: 'Trigger crisis playbook and assign response owners by channel.',
    })
  }

  const topKeywords = getTopTokens(mentions)
  const topHashtags = getTopTokens(mentions, { hashtagsOnly: true })

  return {
    totalMentions: total,
    sentimentCounts,
    sourceCounts,
    platformCounts,
    trend,
    shareOfVoice,
    aiVisibilityCount,
    aiVisibilityPct: percentage(aiVisibilityCount, total),
    crisisCount,
    influencers,
    alerts,
    topKeywords,
    topHashtags,
  }
}

export const summarizeListeningInsights = (snapshot) => {
  const leadingVoice = [...snapshot.shareOfVoice].sort((a, b) => b.sharePct - a.sharePct)[0]
  const topKeyword = snapshot.topKeywords[0]?.token || 'brand conversation'
  const topHashtag = snapshot.topHashtags[0]?.token || '#brand'
  const positiveRate = percentage(snapshot.sentimentCounts.positive || 0, snapshot.totalMentions)
  const negativeRate = percentage(snapshot.sentimentCounts.negative || 0, snapshot.totalMentions)

  return [
    `${leadingVoice?.name || 'Brand'} currently leads with ${leadingVoice?.sharePct || 0}% share of voice in the selected window.`,
    `Conversation trend moved ${snapshot.trend.deltaPct >= 0 ? 'up' : 'down'} by ${Math.abs(snapshot.trend.deltaPct)}% vs the previous period.`,
    `Sentiment balance is ${positiveRate}% positive vs ${negativeRate}% negative; top keyword is ${topKeyword}.`,
    `AI chatbot visibility is ${snapshot.aiVisibilityPct}% and the highest recurring hashtag is ${topHashtag}.`,
  ]
}

export const generateAgentListeningInsights = async ({ agentConfig, snapshot, brandTerms, competitorTerms }) => {
  if (!canUseAgentMode(agentConfig, 'message')) {
    return summarizeListeningInsights(snapshot)
  }

  try {
    const basePrompt = [
      `Analyze social listening for ${brandTerms.join(', ')} against ${competitorTerms.join(', ')}.`,
      `Mentions: ${snapshot.totalMentions}. Trend delta: ${snapshot.trend.deltaPct}%.`,
      `Positive: ${snapshot.sentimentCounts.positive || 0}, Neutral: ${snapshot.sentimentCounts.neutral || 0}, Negative: ${snapshot.sentimentCounts.negative || 0}.`,
      `Share of voice: ${snapshot.shareOfVoice.map((item) => `${item.name} ${item.sharePct}%`).join(', ')}.`,
      `Return concise recommendations for reputation management, crisis detection, product feedback, campaign measurement, and audience research.`,
    ].join(' ')

    const result = await runUserAiAgent({
      agentConfig,
      mode: 'copy',
      prompt: basePrompt,
      payload: {
        prompt: basePrompt,
        context: {
          brandTerms,
          competitorTerms,
          metrics: snapshot,
        },
      },
    })

    if (Array.isArray(result.suggestions) && result.suggestions.length) {
      return result.suggestions.slice(0, 5).map((item) => item.copy || item.title).filter(Boolean)
    }

    if (typeof result.payload === 'string' && result.payload.trim()) {
      return result.payload
        .split(/\n+/)
        .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 6)
    }

    if (result.payload?.insights && Array.isArray(result.payload.insights)) {
      return result.payload.insights.slice(0, 6)
    }
  } catch (error) {
    console.warn('AI listening insights unavailable; using local summary fallback.', error)
  }

  return summarizeListeningInsights(snapshot)
}

export const SOURCE_TYPES_ALL = SOURCE_TYPES
