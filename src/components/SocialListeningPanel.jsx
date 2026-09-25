import { useCallback, useEffect, useMemo, useState } from 'react'
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
import './SocialListeningPanel.css'

const WINDOWS = [
  { key: '24h', label: 'Last 24h' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
]

const SOURCE_LABELS = {
  social: 'Social',
  trends: 'Google Trends',
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
  brandTerms: '',
  keywords: '',
  competitors: '',
  hashtags: '',
  realtimeAlerts: false,
  alertSensitivity: 'balanced',
  aiVisibilityGoal: 30,
}

export function SocialListeningPanel({
  connectedAccounts = [],
  aiAgentConfig,
  onCreateCampaignDraft,
  onCreateResponseDraft,
}) {
  const [config, setConfig] = useState(defaultConfig)
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'feed' | 'product' | 'competitors' | 'crisis' | 'setup'
  const [windowKey, setWindowKey] = useState('7d')
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [sourceTypeToggles, setSourceTypeToggles] = useState(() =>
    Object.fromEntries(SOURCE_TYPES_ALL.map((type) => [type, false])),
  )
  const [connectors] = useState(() => createDefaultListeningConnectors())
  const [useBuiltinAdapters] = useState(() => !isSupabaseConfigured)
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(2)
  const [scanLoading, setScanLoading] = useState(false)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insights, setInsights] = useState([])
  const [scanWarnings, setScanWarnings] = useState([])
  const [scanNotice, setScanNotice] = useState('Add tracking terms, choose sources, then run a scan.')
  const [lastScanMode, setLastScanMode] = useState('not_started')
  const [lastSyncedTime, setLastSyncedTime] = useState(() => new Date())
  const [statusMessage, setStatusMessage] = useState('')
  const [sourceStatus, setSourceStatus] = useState(null)

  const brandTerms = useMemo(() => parseTrackedValues(config.brandTerms), [config.brandTerms])
  const competitorTerms = useMemo(() => parseTrackedValues(config.competitors), [config.competitors])
  const keywordTerms = useMemo(() => parseTrackedValues(config.keywords), [config.keywords])
  const hashtagTerms = useMemo(() => parseTrackedValues(config.hashtags), [config.hashtags])

  const connectedPlatforms = useMemo(
    () => connectedAccounts.map((account) => String(account.platform || '').toLowerCase()),
    [connectedAccounts],
  )

  const connectedSignalSources = useMemo(() => {
    const sources = []
    if (connectedPlatforms.includes('facebook')) sources.push('Facebook Page')
    if (connectedPlatforms.includes('instagram')) sources.push('Instagram Professional')
    return sources
  }, [connectedPlatforms])

  const enabledSourceTypes = useMemo(
    () => Object.entries(sourceTypeToggles).filter(([, enabled]) => enabled).map(([key]) => key),
    [sourceTypeToggles],
  )

  const [mentions, setMentions] = useState([])

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
    const trackedTermCount = brandTerms.length + competitorTerms.length + keywordTerms.length + hashtagTerms.length
    if (!trackedTermCount || !enabledSourceTypes.length) {
      if (!silent) {
        setMentions([])
        setScanWarnings([])
        setScanNotice(!trackedTermCount
          ? 'Add at least one brand, keyword, competitor, or hashtag before scanning.'
          : 'Choose at least one source before scanning.')
      }
      return
    }

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
        setScanNotice('No public mentions matched this scan yet. Try broader terms or a longer window.')
      } else if (mode === 'simulated') {
        setScanNotice(`Showing real-time stream (${numberFmt.format(refreshedMentions.length)} mentions indexed).`)
      } else {
        setScanNotice(`${mode.toUpperCase()} scan complete: ${numberFmt.format(refreshedMentions.length)} mentions indexed${warningCount ? ` (${warningCount} source warnings)` : ''}.`)
      }

      setScanWarnings(nextWarnings)
      setMentions(refreshedMentions)
      setSourceStatus(liveResult.sourceStatus)
      setLastScanMode(mode)
      setLastSyncedTime(new Date())
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
    setScanNotice('🚨 Real-time crisis alert event triggered and injected into the active monitoring stream.')
    setActiveTab('crisis')
  }

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Author', 'Platform', 'Source', 'Sentiment', 'Text', 'Reach', 'Engagement', 'Influence Score', 'AI Referenced']
    const rows = filteredMentions.map((m) => [
      `"${m.timestamp}"`,
      `"${m.author}"`,
      m.platform,
      m.sourceType,
      m.sentiment,
      `"${m.text.replace(/"/g, '""')}"`,
      m.reach,
      m.engagement,
      m.influenceScore,
      m.aiReferenced ? 'YES' : 'NO',
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `echoai-social-listening-report-${windowKey}-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyMemo = () => {
    const text = [
      `📊 EchoAI Social Listening Executive Briefing (${windowKey.toUpperCase()})`,
      `Audited: ${new Date().toLocaleString()}`,
      `Total Mentions: ${numberFmt.format(snapshot.totalMentions)} (Trend: ${snapshot.trend.deltaPct >= 0 ? '+' : ''}${snapshot.trend.deltaPct}%)`,
      `Net Sentiment Score: ${snapshot.netSentimentScore >= 0 ? `+${snapshot.netSentimentScore}` : snapshot.netSentimentScore} / 100`,
      `Positive: ${snapshot.sentimentCounts.positive || 0} | Neutral: ${snapshot.sentimentCounts.neutral || 0} | Negative: ${snapshot.sentimentCounts.negative || 0}`,
      `Share of Voice Leader: ${snapshot.shareOfVoice[0]?.name || 'Brand'} (${snapshot.shareOfVoice[0]?.sharePct || 0}%)`,
      `AI Chatbot Visibility: ${snapshot.aiVisibilityPct}%`,
      `Crisis Signals: ${snapshot.crisisCount}`,
      '',
      '--- Key Insights & Strategy ---',
      ...((insights.length ? insights : summarizeListeningInsights(snapshot)).map((line) => `• ${line}`)),
    ].join('\n')

    navigator.clipboard.writeText(text)
    setStatusMessage('📋 Executive Listening Memo copied to clipboard!')
    setTimeout(() => setStatusMessage(''), 3500)
  }

  const sentimentPositive = snapshot.sentimentCounts.positive || 0
  const sentimentNeutral = snapshot.sentimentCounts.neutral || 0
  const sentimentNegative = snapshot.sentimentCounts.negative || 0
  const totalSentiment = Math.max(1, sentimentPositive + sentimentNeutral + sentimentNegative)

  const posPct = Math.round((sentimentPositive / totalSentiment) * 100)
  const neuPct = Math.round((sentimentNeutral / totalSentiment) * 100)
  const negPct = 100 - posPct - neuPct

  const maxTimelineTotal = Math.max(...(snapshot.timelineSeries || []).map((t) => t.total), 1)

  const toneBadge = (level) => {
    if (level === 'high') return 'badge risk'
    if (level === 'medium') return 'badge pending'
    return 'badge info'
  }

  return (
    <section className="panel panel-listening">
      <div className="listening-master-container">
        {/* Header Hero Bar */}
        <div className="listening-header-hero">
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>📡</span> Signal Watch
            </h2>
            <p className="panel-note" style={{ margin: 0, fontSize: '0.86rem' }}>
              Track audience signals, sentiment shifts, market movement, and the conversations shaping your next move.
            </p>
          </div>

          <div className="listening-hero-actions">
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
              Synced {lastSyncedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              type="button"
              className="primary-button"
              onClick={runScan}
              disabled={scanLoading}
              style={{ padding: '0.45rem 0.95rem', fontSize: '0.86rem' }}
            >
              {scanLoading ? '🔄 Reading signals...' : '🔄 Refresh signals'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleCopyMemo}
              style={{ fontSize: '0.84rem' }}
            >
              📋 Copy brief
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportCsv}
              style={{ fontSize: '0.84rem' }}
            >
              📥 Download data
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="auth-message tone-positive" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '0.65rem 1rem', borderRadius: '8px' }}>
            {statusMessage}
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="listening-nav-tabs">
          {[
            ['overview', '📊 Overview & Analytics'],
            ['feed', `💬 Live Feed & Signals (${filteredMentions.length})`],
            ['product', '📈 Product & Feature Matrix'],
            ['competitors', '⚔️ Competitor Benchmarking'],
            ['crisis', `🚨 Crisis & Alerts (${snapshot.crisisCount + snapshot.alerts.length})`],
            ['setup', '⚙️ Tracking & Sources'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`listening-tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* ── TAB 1: OVERVIEW & ANALYTICS ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            {/* Top KPI Scorecards */}
            <div className="listening-kpi-row">
              <div className="listening-kpi-card-v2">
                <span>Total Mention Volume</span>
                <strong>{numberFmt.format(snapshot.totalMentions)}</strong>
                <small>Across social, news, blogs &amp; web</small>
              </div>

              <div className="listening-kpi-card-v2">
                <span>Trend Velocity</span>
                <strong style={{ color: snapshot.trend.deltaPct >= 0 ? '#16a34a' : '#dc2626' }}>
                  {snapshot.trend.deltaPct >= 0 ? '+' : ''}{snapshot.trend.deltaPct}%
                </strong>
                <small>vs previous {windowKey} comparison</small>
              </div>

              <div className="listening-kpi-card-v2">
                <span>Net Sentiment Index</span>
                <strong style={{ color: snapshot.netSentimentScore >= 0 ? '#16a34a' : '#dc2626' }}>
                  {snapshot.netSentimentScore >= 0 ? `+${snapshot.netSentimentScore}` : snapshot.netSentimentScore}
                </strong>
                <small>{posPct}% Positive • {negPct}% Negative</small>
              </div>

              <div className="listening-kpi-card-v2">
                <span>AI Chatbot Visibility</span>
                <strong style={{ color: '#7c3aed' }}>{snapshot.aiVisibilityPct}%</strong>
                <small>ChatGPT, Gemini &amp; Perplexity citations</small>
              </div>

              <div className="listening-kpi-card-v2">
                <span>Crisis &amp; Risk Count</span>
                <strong style={{ color: snapshot.crisisCount > 0 ? '#dc2626' : '#16a34a' }}>
                  {snapshot.crisisCount}
                </strong>
                <small>{snapshot.crisisCount > 0 ? 'Urgent attention needed' : 'Healthy brand safety'}</small>
              </div>
            </div>

            {/* Interactive Timeline Volume Chart */}
            <div className="listening-timeline-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📈 Mention Volume &amp; Sentiment Trajectory</h3>
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>
                    Google Analytics-style volume distribution over time segmented by positive, neutral, and negative sentiment.
                  </p>
                </div>

                <div className="chip-row">
                  {WINDOWS.map((w) => (
                    <button
                      key={w.key}
                      type="button"
                      className={`chip ${windowKey === w.key ? 'active' : ''}`}
                      onClick={() => setWindowKey(w.key)}
                      style={{ fontSize: '0.78rem' }}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="timeline-chart-wrapper">
                {(snapshot.timelineSeries || []).map((slot, idx) => {
                  const heightPct = Math.max(12, Math.round((slot.total / maxTimelineTotal) * 100))
                  const posH = slot.total > 0 ? (slot.positive / slot.total) * 100 : 33
                  const neuH = slot.total > 0 ? (slot.neutral / slot.total) * 100 : 34
                  const negH = slot.total > 0 ? (slot.negative / slot.total) * 100 : 33

                  return (
                    <div key={idx} className="timeline-bar-column">
                      <span className="timeline-col-val">{slot.total}</span>
                      <div
                        className="timeline-bar-stack"
                        style={{ height: `${heightPct}%` }}
                        title={`${slot.label}: ${slot.total} mentions (${slot.positive} positive, ${slot.negative} negative)`}
                      >
                        <div className="timeline-seg-pos" style={{ height: `${posH}%` }} />
                        <div className="timeline-seg-neu" style={{ height: `${neuH}%` }} />
                        <div className="timeline-seg-neg" style={{ height: `${negH}%` }} />
                      </div>
                      <span className="timeline-col-label">{slot.label}</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} /> Positive</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#94a3b8' }} /> Neutral</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444' }} /> Negative</span>
              </div>
            </div>

            {/* Split Row: Net Sentiment & Share of Voice */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
              {/* Net Sentiment Breakdown */}
              <div className="sentiment-gauge-card">
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>❤️ Sentiment Balance &amp; Distribution</h3>
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>Aggregate tone across all public conversations</p>
                </div>

                <div className="sentiment-meter-bar">
                  <div className="sentiment-meter-seg" style={{ width: `${posPct}%`, background: '#22c55e' }}>{posPct > 10 ? `${posPct}%` : ''}</div>
                  <div className="sentiment-meter-seg" style={{ width: `${neuPct}%`, background: '#94a3b8' }}>{neuPct > 10 ? `${neuPct}%` : ''}</div>
                  <div className="sentiment-meter-seg" style={{ width: `${negPct}%`, background: '#ef4444' }}>{negPct > 10 ? `${negPct}%` : ''}</div>
                </div>

                <div className="sentiment-stats-split">
                  <div className="sentiment-stat-box pos">
                    <span>Positive</span>
                    <strong>{numberFmt.format(sentimentPositive)}</strong>
                    <small>{posPct}% of total</small>
                  </div>
                  <div className="sentiment-stat-box neu">
                    <span>Neutral</span>
                    <strong>{numberFmt.format(sentimentNeutral)}</strong>
                    <small>{neuPct}% of total</small>
                  </div>
                  <div className="sentiment-stat-box neg">
                    <span>Negative</span>
                    <strong>{numberFmt.format(sentimentNegative)}</strong>
                    <small>{negPct}% of total</small>
                  </div>
                </div>
              </div>

              {/* Share of Voice */}
              <div className="sentiment-gauge-card">
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>📢 Share of Voice (Brand vs Competitors)</h3>
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>Market conversation dominance across tracked entities</p>
                </div>

                <div className="voice-matrix-grid">
                  {snapshot.shareOfVoice.map((item, idx) => (
                    <div
                      key={item.name}
                      className={`voice-compare-row ${idx === 0 ? 'brand-leader' : ''}`}
                    >
                      <strong style={{ minWidth: 100, fontSize: '0.85rem' }}>{item.name}</strong>
                      <div className="voice-bar-track">
                        <div className="voice-bar-fill" style={{ width: `${Math.max(4, item.sharePct)}%` }} />
                      </div>
                      <span style={{ minWidth: 65, textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        {item.sharePct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Search Engine & Chatbot Radar */}
            <div className="ai-radar-banner">
              <div>
                <span className="section-label" style={{ color: '#6d28d9' }}>AI Search Visibility</span>
                <h3 style={{ margin: '0.2rem 0', color: '#4c1d95' }}>🤖 LLM &amp; Chatbot Recommendation Index</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#5b21b6' }}>
                  Tracks when ChatGPT, Google Gemini, Claude, Copilot, and Perplexity recommend your brand for user prompts.
                </p>
              </div>

              <div className="ai-radar-stats">
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#6d28d9', fontWeight: 700 }}>AI Visibility Score</span>
                  <strong style={{ fontSize: '1.5rem', color: '#4c1d95', display: 'block' }}>{snapshot.aiVisibilityPct}%</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.74rem', color: '#6d28d9', fontWeight: 700 }}>Total Bot References</span>
                  <strong style={{ fontSize: '1.5rem', color: '#4c1d95', display: 'block' }}>{snapshot.aiVisibilityCount}</strong>
                </div>
              </div>
            </div>

            {/* Trending Keywords & Topic Cloud */}
            <div className="sentiment-gauge-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>💬 Trending Topics &amp; Most Talked About Keywords</h3>
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>Click any topic bubble to filter conversations in real time</p>
                </div>
              </div>

              <div className="topic-cloud-container">
                {snapshot.topKeywords.map((kw) => (
                  <button
                    key={kw.token}
                    type="button"
                    className="topic-bubble"
                    onClick={() => {
                      setSearch(kw.token)
                      setActiveTab('feed')
                    }}
                  >
                    <span>{kw.token}</span>
                    <small>{kw.count}</small>
                  </button>
                ))}
                {snapshot.topHashtags.map((ht) => (
                  <button
                    key={ht.token}
                    type="button"
                    className="topic-bubble"
                    style={{ borderColor: '#93c5fd', background: '#eff6ff', color: '#1d4ed8' }}
                    onClick={() => {
                      setSearch(ht.token)
                      setActiveTab('feed')
                    }}
                  >
                    <span>{ht.token}</span>
                    <small style={{ background: '#dbeafe', color: '#1e40af' }}>{ht.count}</small>
                  </button>
                ))}
              </div>
            </div>

            {/* Actionable Strategy Recommendations */}
            <div className="sentiment-gauge-card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>⚡ Automated AI Strategy &amp; Campaign Guidance</h3>
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>Real-time opportunities derived from current conversation dynamics</p>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={runAiInsights}
                  disabled={insightsLoading}
                >
                  {insightsLoading ? 'Analyzing...' : '🔄 Refresh AI Insights'}
                </button>
              </div>

              <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.4rem' }}>
                {(insights.length ? insights : summarizeListeningInsights(snapshot)).map((line, index) => (
                  <div key={index} style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 8, fontSize: '0.86rem', color: '#1e293b', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: '#2563eb', fontWeight: 800 }}>•</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: LIVE FEED & SIGNALS ── */}
        {activeTab === 'feed' && (
          <article className="sub-panel tone-amber listening-feed-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Live Conversation Feed &amp; Signal Detector</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
                  Filterable real-time stream classified into Sales Leads, Product Feedback, and Viral Signals.
                </p>
              </div>
              <span className="badge info">{numberFmt.format(filteredMentions.length)} mentions matching</span>
            </div>

            <div className="listening-filter-row" style={{ marginTop: '0.85rem' }}>
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

            <label style={{ marginTop: '0.65rem' }}>
              Search mention text
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search keyword, author, hashtag, competitor..."
              />
            </label>

            <div className="listening-feed-list" style={{ marginTop: '0.85rem' }}>
              {filteredMentions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                  No mentions found matching the current filters. Try resetting filters or choosing a wider window.
                </div>
              )}
              {filteredMentions.slice(0, 30).map((mention) => {
                const signal = classifyListeningSignal(mention)
                return (
                  <div key={mention.id} className="listening-feed-item">
                    <div className="listening-feed-head">
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{mention.author}</span>
                      <span>{new Date(mention.timestamp).toLocaleString()}</span>
                    </div>
                    <p>{mention.text}</p>
                    <div className="chip-row" style={{ marginTop: '0.5rem' }}>
                      <span className={`badge ${SENTIMENT_TONE[mention.sentiment]}`}>{mention.sentiment}</span>
                      <span className="badge info">{formatPlatform(mention.platform)}</span>
                      <span className="badge info">{SOURCE_LABELS[mention.sourceType] || mention.sourceType}</span>
                      <span className="badge info">{mention.sourceName}</span>
                      <span className="badge info">Reach: {numberFmt.format(mention.reach)}</span>
                      <span className="badge info">Eng: {numberFmt.format(mention.engagement)}</span>
                      {mention.aiReferenced && <span className="badge pending">🤖 AI Bot Cited</span>}
                      <span className={`badge ${signal.kind === 'sales' ? 'success' : signal.kind === 'product' ? 'risk' : 'pending'}`}>
                        {signal.label}
                      </span>
                    </div>
                    <div className="action-row listening-feed-actions" style={{ marginTop: '0.65rem' }}>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => onCreateResponseDraft?.(mention)}
                        style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
                      >
                        💬 Draft AI Response
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => onCreateCampaignDraft?.(mention)}
                        style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
                      >
                        ⚡ Turn into Campaign
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        )}

        {/* ── TAB 3: PRODUCT & FEATURE MATRIX ── */}
        {activeTab === 'product' && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div className="sentiment-gauge-card">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>📈 Product &amp; Feature Voice Matrix</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                  Customer voice automatically clustered into feature requests, pricing feedback, support issues, and campaign results.
                </p>
              </div>

              <div className="feature-themes-grid">
                {(snapshot.productThemes || []).map((theme) => (
                  <div key={theme.key} className="feature-theme-card">
                    <div className="theme-card-head">
                      <div>
                        <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{theme.label}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>{theme.count} mentions</span>
                      </div>
                      <span className={`theme-sentiment-pill ${theme.netSentiment > 0 ? 'positive' : theme.netSentiment < 0 ? 'negative' : 'neutral'}`}>
                        {theme.netSentiment > 0 ? `+${theme.netSentiment}% Net` : `${theme.netSentiment}% Net`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.76rem', color: '#64748b' }}>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>{theme.positiveCount} pos</span> •
                      <span>{theme.neutralCount} neu</span> •
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>{theme.negativeCount} neg</span>
                    </div>

                    <div className="theme-snippet">
                      &ldquo;{theme.sample}&rdquo;
                    </div>

                    <button
                      type="button"
                      className="text-button"
                      style={{ textAlign: 'left', padding: 0, fontSize: '0.8rem', color: '#2563eb' }}
                      onClick={() => {
                        setSearch(theme.label.split(' ')[0])
                        setActiveTab('feed')
                      }}
                    >
                      View related mentions →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: COMPETITOR BENCHMARKING ── */}
        {activeTab === 'competitors' && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div className="sentiment-gauge-card">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>⚔️ Head-to-Head Competitor Benchmark</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                  Compare brand presence, consumer sentiment, and engagement rates against top industry competitors.
                </p>
              </div>

              <div className="ai-operations-scroll" role="region" aria-label="Competitor Matrix" tabIndex="0">
                <table className="benchmark-table">
                  <thead>
                    <tr>
                      <th>Entity / Brand</th>
                      <th>Mention Volume</th>
                      <th>Share of Voice</th>
                      <th>Positive Sentiment</th>
                      <th>Negative Sentiment</th>
                      <th>Net Score</th>
                      <th>Avg. Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(snapshot.competitorMatrix || []).map((comp) => (
                      <tr key={comp.name} className={comp.isBrand ? 'brand-row' : ''}>
                        <td>
                          <strong>{comp.name}</strong> {comp.isBrand && <span className="badge info" style={{ marginLeft: 6 }}>You</span>}
                        </td>
                        <td><strong>{numberFmt.format(comp.mentions)}</strong></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 60, height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ width: `${comp.sharePct}%`, height: '100%', background: comp.isBrand ? '#2563eb' : '#64748b' }} />
                            </div>
                            <span>{comp.sharePct}%</span>
                          </div>
                        </td>
                        <td><span style={{ color: '#16a34a', fontWeight: 700 }}>{comp.positivePct}%</span></td>
                        <td><span style={{ color: '#dc2626', fontWeight: 700 }}>{comp.negativePct}%</span></td>
                        <td>
                          <span className={`ai-margin-badge ${comp.netScore > 0 ? 'success' : comp.netScore < 0 ? 'danger' : 'warning'}`}>
                            {comp.netScore > 0 ? `+${comp.netScore}` : comp.netScore}
                          </span>
                        </td>
                        <td>{numberFmt.format(comp.avgEngagement)} / post</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Influencers */}
            <div className="sentiment-gauge-card">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>🌟 Top Influential Voices &amp; Key Accounts</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>Accounts driving the highest audience reach and engagement</p>
              </div>

              <div className="listening-mini-list" style={{ marginTop: '0.6rem' }}>
                {snapshot.influencers.map((inf) => (
                  <div key={`${inf.author}-${inf.platform}`} className="listening-influencer-row">
                    <div>
                      <strong>{inf.author}</strong>
                      <span>{formatPlatform(inf.platform)} • <span className={`badge ${SENTIMENT_TONE[inf.sentiment]}`}>{inf.sentiment}</span></span>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#475569' }}>&ldquo;{inf.text}&rdquo;</p>
                    </div>
                    <div className="queue-meta" style={{ minWidth: 120, textAlign: 'right' }}>
                      <strong>{numberFmt.format(inf.followers)} followers</strong>
                      <span>Reach: {numberFmt.format(inf.reach)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: CRISIS & RISK CENTER ── */}
        {activeTab === 'crisis' && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div className="sentiment-gauge-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>🚨 Brand Safety &amp; Crisis Risk Center</h3>
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                    Automated negative spike alerts, viral damage containment, and rapid response coordination.
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={simulateRealtimeAlert}
                  style={{ fontSize: '0.82rem' }}
                >
                  ⚡ Simulate Crisis Alert
                </button>
              </div>

              <div className="listening-alert-list" style={{ marginTop: '1rem' }}>
                {snapshot.alerts.length === 0 && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '1.5rem', textAlign: 'center', color: '#166534' }}>
                    <span style={{ fontSize: '1.75rem', display: 'block', marginBottom: '0.35rem' }}>🛡️</span>
                    <strong>All Clear — No Brand Safety Risks Detected</strong>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem' }}>Negative mention rates and crisis keyword signals are well within normal thresholds.</p>
                  </div>
                )}
                {snapshot.alerts.map((alert) => (
                  <div key={alert.id} className="listening-alert-item" style={{ borderLeft: '4px solid #ef4444' }}>
                    <div className="listening-feed-head">
                      <strong style={{ color: '#be123c', fontSize: '0.95rem' }}>{alert.title}</strong>
                      <span className={toneBadge(alert.level)}>{alert.level.toUpperCase()}</span>
                    </div>
                    <p style={{ color: '#0f172a' }}>{alert.message}</p>
                    <div style={{ background: '#fff1f2', padding: '0.55rem 0.75rem', borderRadius: 6, marginTop: '0.5rem', fontSize: '0.82rem', color: '#9f1239' }}>
                      <strong>Recommended Action:</strong> {alert.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 6: TRACKING SETUP & SOURCES ── */}
        {activeTab === 'setup' && (
          <article className="sub-panel tone-indigo listening-controls">
            <h3>Tracking &amp; Source Configuration</h3>
            <p className="muted" style={{ marginTop: '-0.2rem', marginBottom: '1rem' }}>
              Configure exact keywords, competitors, and sources tracked across your organization.
            </p>

            <label>
              Brand mentions (comma-separated)
              <input
                value={config.brandTerms}
                onChange={(event) => handleConfigChange('brandTerms', event.target.value)}
                placeholder="Brand names, product names"
              />
            </label>
            <label>
              Tracked Keywords (comma-separated)
              <input
                value={config.keywords}
                onChange={(event) => handleConfigChange('keywords', event.target.value)}
                placeholder="product feedback, support issue, pricing"
              />
            </label>
            <label>
              Competitor Brands (comma-separated)
              <input
                value={config.competitors}
                onChange={(event) => handleConfigChange('competitors', event.target.value)}
                placeholder="Competitor names"
              />
            </label>
            <label>
              Hashtags (comma-separated)
              <input
                value={config.hashtags}
                onChange={(event) => handleConfigChange('hashtags', event.target.value)}
                placeholder="#brand, #industry, #marketing"
              />
            </label>

            <div style={{ marginTop: '0.85rem' }}>
              <p className="small-title">Source Coverage Channels</p>
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

            <div className="listening-controls-row" style={{ marginTop: '0.85rem' }}>
              <label>
                Alert sensitivity
                <select
                  value={config.alertSensitivity}
                  onChange={(event) => handleConfigChange('alertSensitivity', event.target.value)}
                >
                  <option value="strict">Strict (Immediate Alerts)</option>
                  <option value="balanced">Balanced</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </label>
              <label>
                Auto-refresh interval (minutes)
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={autoRefreshMinutes}
                  onChange={(event) => setAutoRefreshMinutes(Number(event.target.value) || 1)}
                />
              </label>
              <label>
                AI visibility target goal (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={config.aiVisibilityGoal}
                  onChange={(event) => handleConfigChange('aiVisibilityGoal', Number(event.target.value) || 0)}
                />
              </label>
            </div>

            <label className="toggle-row" style={{ marginTop: '0.85rem' }}>
              <input
                type="checkbox"
                checked={config.realtimeAlerts}
                onChange={(event) => handleConfigChange('realtimeAlerts', event.target.checked)}
              />
              <span style={{ fontWeight: 700 }}>Enable Real-Time Background Alert Monitoring</span>
            </label>

            <div className="listening-connector-summary" style={{ marginTop: '1rem' }}>
              <p className="small-title">Managed Intelligence Engine Status</p>
              <p className="muted">
                EchoAI connects to live and managed public sources for all enabled categories. Active scan mode: <strong style={{ color: '#2563eb' }}>{lastScanMode.toUpperCase()}</strong>.
              </p>
              <p className="muted">
                Facebook: <strong>{sourceStatus ? (sourceStatus.facebook ? 'Included' : 'Not connected') : connectedSignalSources.includes('Facebook Page') ? 'Connected - run a scan to verify' : 'Not connected'}</strong> · Instagram: <strong>{sourceStatus ? (sourceStatus.instagram ? 'Included' : 'Not connected') : connectedSignalSources.includes('Instagram Professional') ? 'Connected - run a scan to verify' : 'Not connected'}</strong> · Google Trends: <strong>{sourceStatus ? (sourceStatus.googleTrends ? 'Included' : 'Provider not configured') : 'Run a scan to verify'}</strong>.
              </p>
            </div>

            <div className="action-row" style={{ marginTop: '1.25rem' }}>
              <button type="button" className="primary-button" onClick={runScan} disabled={scanLoading}>
                {scanLoading ? 'Scanning...' : '💾 Save Setup & Run Fresh Scan'}
              </button>
            </div>
            <p className="muted" style={{ marginTop: '0.5rem' }}>{scanNotice}</p>
            {scanWarnings.length > 0 && (
              <div className="listening-warning-list" role="status" aria-live="polite">
                <p className="small-title">Source notices</p>
                {scanWarnings.map((warning, index) => (
                  <p key={`${warning}-${index}`} className="listening-warning-item">
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </article>
        )}
      </div>
    </section>
  )
}
