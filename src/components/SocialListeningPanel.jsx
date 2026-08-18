import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SOURCE_TYPES_ALL,
  buildListeningSnapshot,
  classifyListeningSignal,
  createDefaultListeningConnectors,
  fetchBuiltinMentions,
  fetchLiveMentions,
  filterMentions,
  generateAgentListeningInsights,
  generateListeningMentions,
  parseTrackedValues,
  summarizeListeningInsights,
} from '../services/socialListeningService'
import { isSupabaseConfigured } from '../lib/supabase'

const WINDOWS = [
  { key: '24h', label: 'Last 24h' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
]

const SOURCE_LABELS = {
  social: 'Social',
  news: 'News',
  forums: 'Forums',
  blogs: 'Blogs',
  reviews: 'Reviews',
  web: 'Web',
}

const SENTIMENT_TONE = {
  positive: 'success',
  neutral: 'info',
  negative: 'risk',
}

const numberFmt = new Intl.NumberFormat('en-US')

const formatPlatform = (platform) => {
  const value = String(platform || '').toLowerCase()
  if (value === 'x') return 'X'
  if (value === 'web') return 'Web'
  if (value === 'reddit') return 'Reddit'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const defaultConfig = {
  brandTerms: 'EchoAI, Echo AI',
  keywords: 'social listening, campaign analytics, creator workflow, customer feedback',
  competitors: 'Hootsuite, Sprout Social, Buffer, Later',
  hashtags: '#socialmedia, #marketing, #brandwatch, #creator',
  realtimeAlerts: true,
  alertSensitivity: 'balanced',
  aiVisibilityGoal: 30,
}

export function SocialListeningPanel({ connectedAccounts, aiAgentConfig, onCreateCampaignDraft, onCreateResponseDraft }) {
  const [config, setConfig] = useState(defaultConfig)
  const [windowKey, setWindowKey] = useState('7d')
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [sourceTypeToggles, setSourceTypeToggles] = useState(() =>
    Object.fromEntries(SOURCE_TYPES_ALL.map((type) => [type, true])),
  )
  const [connectors] = useState(() => createDefaultListeningConnectors())
  const [useBuiltinAdapters] = useState(() => !isSupabaseConfigured)
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(2)
  const [scanLoading, setScanLoading] = useState(false)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insights, setInsights] = useState([])
  const [scanWarnings, setScanWarnings] = useState([])
  const [scanNotice, setScanNotice] = useState('Enter your tracking terms, choose sources, then run a live scan.')
  const [lastScanMode, setLastScanMode] = useState('not_started')
  const hasBootstrappedLiveRef = useRef(false)

  const brandTerms = useMemo(() => parseTrackedValues(config.brandTerms), [config.brandTerms])
  const competitorTerms = useMemo(() => parseTrackedValues(config.competitors), [config.competitors])
  const keywordTerms = useMemo(() => parseTrackedValues(config.keywords), [config.keywords])
  const hashtagTerms = useMemo(() => parseTrackedValues(config.hashtags), [config.hashtags])

  const connectedPlatforms = useMemo(
    () => connectedAccounts.map((account) => String(account.platform || '').toLowerCase()),
    [connectedAccounts],
  )

  const enabledSourceTypes = useMemo(
    () => Object.entries(sourceTypeToggles).filter(([, enabled]) => enabled).map(([key]) => key),
    [sourceTypeToggles],
  )

  const [mentions, setMentions] = useState(() =>
    isSupabaseConfigured
      ? []
      : generateListeningMentions({
          brandTerms: parseTrackedValues(defaultConfig.brandTerms),
          competitorTerms: parseTrackedValues(defaultConfig.competitors),
          keywordTerms: parseTrackedValues(defaultConfig.keywords),
          hashtagTerms: parseTrackedValues(defaultConfig.hashtags),
          connectedPlatforms,
          enabledSourceTypes: SOURCE_TYPES_ALL,
          count: 90,
        }),
  )

  const filteredMentions = useMemo(
    () =>
      filterMentions({
        mentions,
        search,
        platform: platformFilter,
        sourceType: sourceFilter,
        sentiment: sentimentFilter,
        windowKey,
      }),
    [mentions, search, platformFilter, sourceFilter, sentimentFilter, windowKey],
  )

  const snapshot = useMemo(
    () =>
      buildListeningSnapshot({
        mentions: filteredMentions,
        brandTerms,
        competitorTerms,
        windowKey,
      }),
    [filteredMentions, brandTerms, competitorTerms, windowKey],
  )

  const platforms = useMemo(
    () => ['all', ...new Set(mentions.map((mention) => mention.platform))],
    [mentions],
  )

  const handleConfigChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  const handleToggleSourceType = (sourceType) => {
    setSourceTypeToggles((prev) => ({ ...prev, [sourceType]: !prev[sourceType] }))
  }

  const refreshMentions = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setScanLoading(true)
      setScanNotice('Refreshing mentions across connected sources...')
    }

    try {
      const [liveResult, builtinResult] = await Promise.all([
        fetchLiveMentions({
          connectors,
          brandTerms,
          competitorTerms,
          keywordTerms,
          hashtagTerms,
          connectedPlatforms,
          enabledSourceTypes,
          windowKey,
          maxPerSource: 120,
        }),
        useBuiltinAdapters
          ? fetchBuiltinMentions({
              brandTerms,
              competitorTerms,
              keywordTerms,
              hashtagTerms,
              enabledSourceTypes,
              maxPerSource: 70,
            })
          : Promise.resolve({ mentions: [], usedBuiltin: false, errors: [] }),
      ])

      const mergedMentions = [...liveResult.mentions, ...builtinResult.mentions]
      const dedupedMentions = mergedMentions.filter((mention, index, list) =>
        list.findIndex((candidate) =>
          candidate.id === mention.id && candidate.timestamp === mention.timestamp && candidate.text === mention.text,
        ) === index,
      )

      let refreshedMentions = dedupedMentions
      let mode = 'hybrid'

      if (!dedupedMentions.length) {
        if (isSupabaseConfigured) {
          mode = 'no_results'
        } else {
          refreshedMentions = generateListeningMentions({
            brandTerms,
            competitorTerms,
            keywordTerms,
            hashtagTerms,
            connectedPlatforms,
            enabledSourceTypes,
            count: 120,
          })
          mode = 'simulated'
        }
      } else if (liveResult.usedLive && builtinResult.usedBuiltin) {
        mode = 'hybrid'
      } else if (liveResult.usedLive) {
        mode = 'live'
      } else if (builtinResult.usedBuiltin) {
        mode = 'builtin'
      }

      const warningCount = liveResult.errors.length + builtinResult.errors.length
      const nextWarnings = [...liveResult.errors, ...builtinResult.errors]

      if (mode === 'no_results') {
        setScanNotice('No live mentions were returned. Check that the selected listening connectors are configured and authorized.')
      } else if (mode === 'simulated') {
        setScanNotice(
          useBuiltinAdapters
            ? `Managed sources returned no usable mentions, showing modeled stream (${numberFmt.format(refreshedMentions.length)} mentions).`
            : `No live mentions were returned for the selected terms. Try broader keywords or a longer window.`,
        )
      } else {
        setScanNotice(`${mode.toUpperCase()} scan complete: ${numberFmt.format(refreshedMentions.length)} mentions indexed${warningCount ? ` (${warningCount} source warning${warningCount === 1 ? '' : 's'})` : ''}.`)
      }

      setScanWarnings(nextWarnings)
      setMentions(refreshedMentions)
      setLastScanMode(mode)
      setInsights(
        summarizeListeningInsights(
          buildListeningSnapshot({
            mentions: refreshedMentions,
            brandTerms,
            competitorTerms,
            windowKey,
          }),
        ),
      )
    } finally {
      if (!silent) {
        setScanLoading(false)
      }
    }
  }, [
    brandTerms,
    competitorTerms,
    connectors,
    connectedPlatforms,
    enabledSourceTypes,
    hashtagTerms,
    keywordTerms,
    useBuiltinAdapters,
    windowKey,
  ])

  useEffect(() => {
    if (hasBootstrappedLiveRef.current) {
      return
    }

    hasBootstrappedLiveRef.current = true
    refreshMentions({ silent: true })
  }, [refreshMentions])

  const runScan = async () => {
    await refreshMentions()
  }

  useEffect(() => {
    if (!config.realtimeAlerts) {
      return undefined
    }

    const intervalMs = Math.max(1, autoRefreshMinutes) * 60 * 1000
    const intervalId = setInterval(() => {
      refreshMentions({ silent: true })
    }, intervalMs)

    return () => {
      clearInterval(intervalId)
    }
  }, [autoRefreshMinutes, config.realtimeAlerts, refreshMentions])

  const runAiInsights = async () => {
    setInsightsLoading(true)
    const nextInsights = await generateAgentListeningInsights({
      agentConfig: aiAgentConfig,
      snapshot,
      brandTerms,
      competitorTerms,
    })
    setInsights(nextInsights)
    setInsightsLoading(false)
  }

  const simulateRealtimeAlert = () => {
    const realtimeMention = generateListeningMentions({
      brandTerms,
      competitorTerms,
      keywordTerms,
      hashtagTerms,
      connectedPlatforms,
      enabledSourceTypes,
      count: 1,
    })[0]

    const forcedAlertMention = {
      ...realtimeMention,
      id: `live_${Date.now()}`,
      sentiment: 'negative',
      reach: 65000,
      engagement: 2200,
      influenceScore: realtimeMention.influenceScore + 900,
      timestamp: new Date().toISOString(),
      text: `${brandTerms[0] || 'Brand'} outage reports are spreading quickly across threads and reviews.`,
      crisis: true,
      aiReferenced: true,
    }

    setMentions((prev) => [forcedAlertMention, ...prev])
    setScanNotice('Real-time alert event received and added to active monitoring stream.')
  }

  const sentimentPositive = snapshot.sentimentCounts.positive || 0
  const sentimentNeutral = snapshot.sentimentCounts.neutral || 0
  const sentimentNegative = snapshot.sentimentCounts.negative || 0

  const toneBadge = (level) => {
    if (level === 'high') return 'badge risk'
    if (level === 'medium') return 'badge pending'
    return 'badge info'
  }

  return (
    <section className="panel panel-listening">
      <h2>Social Listening Intelligence</h2>
      <p className="panel-note">
        Track mentions, competitors, sentiment, and AI visibility across social platforms, news, forums, blogs, reviews, and wider web conversations.
      </p>

      <div className="split listening-layout">
        <article className="sub-panel tone-indigo listening-controls">
          <h3>Tracking setup</h3>
          <label>
            Brand mentions
            <input
              value={config.brandTerms}
              onChange={(event) => handleConfigChange('brandTerms', event.target.value)}
              placeholder="Brand names, product names"
            />
          </label>
          <label>
            Keywords
            <input
              value={config.keywords}
              onChange={(event) => handleConfigChange('keywords', event.target.value)}
              placeholder="product feedback, support issue"
            />
          </label>
          <label>
            Competitors
            <input
              value={config.competitors}
              onChange={(event) => handleConfigChange('competitors', event.target.value)}
              placeholder="Competitor names"
            />
          </label>
          <label>
            Hashtags
            <input
              value={config.hashtags}
              onChange={(event) => handleConfigChange('hashtags', event.target.value)}
              placeholder="#brand, #industry"
            />
          </label>

          <div>
            <p className="small-title">Source coverage</p>
            <div className="chip-row">
              {SOURCE_TYPES_ALL.map((sourceType) => (
                <button
                  key={sourceType}
                  type="button"
                  className={sourceTypeToggles[sourceType] ? 'chip active' : 'chip'}
                  onClick={() => handleToggleSourceType(sourceType)}
                >
                  {SOURCE_LABELS[sourceType]}
                </button>
              ))}
            </div>
          </div>

          <div className="listening-controls-row">
            <label>
              Alert sensitivity
              <select
                value={config.alertSensitivity}
                onChange={(event) => handleConfigChange('alertSensitivity', event.target.value)}
              >
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
                <option value="relaxed">Relaxed</option>
              </select>
            </label>
            <label>
              Auto-refresh (minutes)
              <input
                type="number"
                min="1"
                max="60"
                value={autoRefreshMinutes}
                onChange={(event) => setAutoRefreshMinutes(Number(event.target.value) || 1)}
              />
            </label>
            <label>
              AI visibility goal (%)
              <input
                type="number"
                min="0"
                max="100"
                value={config.aiVisibilityGoal}
                onChange={(event) => handleConfigChange('aiVisibilityGoal', Number(event.target.value) || 0)}
              />
            </label>
          </div>

          <label className="toggle-row">
            <span>Real-time alerts</span>
            <input
              type="checkbox"
              checked={config.realtimeAlerts}
              onChange={(event) => handleConfigChange('realtimeAlerts', event.target.checked)}
            />
          </label>

          <div className="listening-connector-summary">
            <p className="small-title">Managed source coverage</p>
            <p className="muted">
              EchoAI searches managed public sources for every selected category. Last scan mode: {lastScanMode}.
            </p>
            <p className="muted">Premium provider coverage can be added by EchoAI without changing your tracking setup.</p>
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={runScan} disabled={scanLoading}>
              {scanLoading ? 'Scanning...' : 'Run fresh scan'}
            </button>
            <button type="button" className="ghost-button" onClick={simulateRealtimeAlert}>
              Simulate live alert
            </button>
          </div>
          <p className="muted">{scanNotice}</p>
          {scanWarnings.length > 0 && (
            <div className="listening-warning-list" role="status" aria-live="polite">
              <p className="small-title">Source warnings</p>
              {scanWarnings.map((warning, index) => (
                <p key={`${warning}-${index}`} className="listening-warning-item">
                  {warning}
                </p>
              ))}
            </div>
          )}
        </article>

        <article className="sub-panel tone-ocean listening-metrics">
          <h3>Live metrics</h3>
          <div className="listening-kpi-grid">
            <div className="listening-kpi-card">
              <p>Total mentions</p>
              <strong>{numberFmt.format(snapshot.totalMentions)}</strong>
            </div>
            <div className="listening-kpi-card">
              <p>Trend delta</p>
              <strong className={snapshot.trend.deltaPct >= 0 ? 'text-success' : 'text-risk'}>
                {snapshot.trend.deltaPct >= 0 ? '+' : ''}{snapshot.trend.deltaPct}%
              </strong>
            </div>
            <div className="listening-kpi-card">
              <p>AI chatbot visibility</p>
              <strong>{snapshot.aiVisibilityPct}%</strong>
            </div>
            <div className="listening-kpi-card">
              <p>Crisis signals</p>
              <strong className={snapshot.crisisCount > 0 ? 'text-risk' : 'text-success'}>{snapshot.crisisCount}</strong>
            </div>
          </div>

          <div className="listening-sentiment-row">
            {[
              ['positive', sentimentPositive],
              ['neutral', sentimentNeutral],
              ['negative', sentimentNegative],
            ].map(([label, value]) => (
              <div key={label} className="listening-pill">
                <span className={`badge ${SENTIMENT_TONE[label]}`}>{label}</span>
                <strong>{numberFmt.format(value)}</strong>
              </div>
            ))}
          </div>

          <div className="split compact-grid">
            <div>
              <p className="small-title">Share of voice</p>
              <div className="listening-mini-list">
                {snapshot.shareOfVoice.map((item) => (
                  <div key={item.name} className="listening-voice-row">
                    <span>{item.name}</span>
                    <strong>{item.sharePct}%</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="small-title">Source mix</p>
              <div className="listening-mini-list">
                {Object.entries(snapshot.sourceCounts).map(([sourceType, count]) => (
                  <div key={sourceType} className="listening-voice-row">
                    <span>{SOURCE_LABELS[sourceType] || sourceType}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="action-row" style={{ marginTop: '0.8rem' }}>
            <button type="button" className="ghost-button" onClick={runAiInsights} disabled={insightsLoading}>
              {insightsLoading ? 'Analyzing...' : 'Generate AI insights'}
            </button>
          </div>

          <div className="suggestion">
            <p>Recommended actions</p>
            {(insights.length ? insights : summarizeListeningInsights(snapshot)).map((line, index) => (
              <span key={`${line}-${index}`}>• {line}</span>
            ))}
          </div>
        </article>
      </div>

      <div className="split listening-layout-secondary">
        <article className="sub-panel tone-amber listening-feed-panel">
          <h3>Conversation feed</h3>
          <div className="listening-filter-row">
            <label>
              Window
              <select value={windowKey} onChange={(event) => setWindowKey(event.target.value)}>
                {WINDOWS.map((windowOption) => (
                  <option key={windowOption.key} value={windowOption.key}>{windowOption.label}</option>
                ))}
              </select>
            </label>
            <label>
              Platform
              <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                {platforms.map((platform) => (
                  <option key={platform} value={platform}>{platform === 'all' ? 'All platforms' : formatPlatform(platform)}</option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">All sources</option>
                {SOURCE_TYPES_ALL.map((sourceType) => (
                  <option key={sourceType} value={sourceType}>{SOURCE_LABELS[sourceType]}</option>
                ))}
              </select>
            </label>
            <label>
              Sentiment
              <select value={sentimentFilter} onChange={(event) => setSentimentFilter(event.target.value)}>
                <option value="all">All sentiment</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
              </select>
            </label>
          </div>

          <label>
            Search mention text
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="keyword, author, hashtag, competitor"
            />
          </label>

          <div className="listening-feed-list">
            {filteredMentions.slice(0, 24).map((mention) => (
              <div key={mention.id} className="listening-feed-item">
                <div className="listening-feed-head">
                  <span className="small-title">{mention.author}</span>
                  <span>{new Date(mention.timestamp).toLocaleString()}</span>
                </div>
                <p>{mention.text}</p>
                <div className="chip-row">
                  <span className={`badge ${SENTIMENT_TONE[mention.sentiment]}`}>{mention.sentiment}</span>
                  <span className="badge info">{formatPlatform(mention.platform)}</span>
                  <span className="badge info">{SOURCE_LABELS[mention.sourceType]}</span>
                  <span className="badge info">{mention.sourceName}</span>
                  <span className="badge info">reach {numberFmt.format(mention.reach)}</span>
                  <span className="badge info">engagement {numberFmt.format(mention.engagement)}</span>
                  {mention.aiReferenced && <span className="badge pending">AI chatbot mention</span>}
                  {(() => {
                    const signal = classifyListeningSignal(mention)
                    return <span className={`badge ${signal.kind === 'sales' ? 'success' : signal.kind === 'product' ? 'risk' : 'pending'}`}>{signal.label}</span>
                  })()}
                </div>
                <div className="action-row listening-feed-actions">
                  <button type="button" className="ghost-button" onClick={() => onCreateResponseDraft?.(mention)}>
                    Draft response
                  </button>
                  <button type="button" className="ghost-button" onClick={() => onCreateCampaignDraft?.(mention)}>
                    Create campaign
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="sub-panel tone-mint listening-intel-panel">
          <h3>Alerts, influencers, and trends</h3>

          <div className="listening-alert-list">
            {snapshot.alerts.length === 0 && (
              <p className="muted">No urgent alerts in the current view.</p>
            )}
            {snapshot.alerts.map((alert) => (
              <div key={alert.id} className="listening-alert-item">
                <div className="listening-feed-head">
                  <strong>{alert.title}</strong>
                  <span className={toneBadge(alert.level)}>{alert.level}</span>
                </div>
                <p>{alert.message}</p>
                <small>{alert.recommendation}</small>
              </div>
            ))}
          </div>

          <div className="split compact-grid" style={{ marginTop: '0.8rem' }}>
            <div>
              <p className="small-title">Top keywords</p>
              <div className="listening-mini-list">
                {snapshot.topKeywords.map((item) => (
                  <div key={item.token} className="listening-voice-row">
                    <span>{item.token}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="small-title">Top hashtags</p>
              <div className="listening-mini-list">
                {snapshot.topHashtags.map((item) => (
                  <div key={item.token} className="listening-voice-row">
                    <span>{item.token}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="small-title" style={{ marginTop: '0.8rem' }}>Influencer identification</p>
          <div className="listening-mini-list">
            {snapshot.influencers.slice(0, 6).map((influencer) => (
              <div key={`${influencer.author}-${influencer.platform}`} className="listening-influencer-row">
                <div>
                  <strong>{influencer.author}</strong>
                  <span>{formatPlatform(influencer.platform)} • {influencer.sentiment}</span>
                </div>
                <div className="queue-meta">
                  <strong>{numberFmt.format(influencer.followers)} followers</strong>
                  <span>Score {numberFmt.format(influencer.influenceScore)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
