import { useCallback, useEffect, useState } from 'react'
import { BarChart3, CircleAlert, ExternalLink, RefreshCw, Target } from 'lucide-react'
import { adAnalyticsService } from '../services/adAnalyticsService'
import './AdsPanel.css'

const PROVIDERS = [
  { id: 'meta', name: 'Meta Ads', description: 'Facebook and Instagram campaigns' },
  { id: 'google', name: 'Google Ads', description: 'Search, display, YouTube, and Performance Max' },
]

const formatNumber = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0)
const formatCurrency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)
const formatPercent = (value) => `${Number(value || 0).toFixed(2)}%`

export function AdsPanel() {
  const [connections, setConnections] = useState([])
  const [report, setReport] = useState(null)
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connecting, setConnecting] = useState('')
  const [error, setError] = useState('')
  const [serviceUnavailable, setServiceUnavailable] = useState(false)

  const load = useCallback(async ({ refresh = false } = {}) => {
    setError('')
    refresh ? setRefreshing(true) : setLoading(true)
    try {
      const [nextConnections, nextReport] = await Promise.all([
        adAnalyticsService.listConnections(),
        adAnalyticsService.getReport({ days: Number(days) }),
      ])
      setConnections(nextConnections.connections)
      setReport(nextReport.report)
      const unavailable = nextConnections.unavailable || nextReport.unavailable
      setServiceUnavailable(unavailable)
      if (unavailable) setError(nextConnections.message || nextReport.message)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load advertising data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [days])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const connect = async (provider) => {
    setConnecting(provider)
    setError('')
    try {
      await adAnalyticsService.connect(provider)
    } catch (connectError) {
      setError(connectError.message || `Unable to connect ${provider}.`)
      setConnecting('')
    }
  }

  const metrics = report?.totals || {}
  const connectedCount = connections.filter((connection) => connection.status === 'connected').length

  return (
    <section className="ads-panel" aria-labelledby="ads-title">
      <header className="ads-header">
        <div>
          <p className="section-label">Paid media</p>
          <h2 id="ads-title">Ads</h2>
          <p>Connect your advertising accounts, review verified performance, and focus budget on the campaigns producing results.</p>
        </div>
        <div className="ads-header-actions">
          <label>
            Reporting window
            <select value={days} onChange={(event) => setDays(event.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <button type="button" className="icon-button" onClick={() => load({ refresh: true })} disabled={refreshing} title="Refresh advertising data" aria-label="Refresh advertising data">
            <RefreshCw size={18} className={refreshing ? 'ads-spin' : ''} />
          </button>
        </div>
      </header>

      {error && <p className="auth-message auth-error">{error}</p>}

      <div className="ads-provider-grid">
        {PROVIDERS.map((provider) => {
          const connection = connections.find((item) => item.provider === provider.id)
          const isConnected = connection?.status === 'connected'
          return (
            <article key={provider.id} className="ads-provider-card">
              <div>
                <h3>{provider.name}</h3>
                <p>{provider.description}</p>
              </div>
              <span className={isConnected ? 'ads-status connected' : 'ads-status'}>{isConnected ? 'Connected' : serviceUnavailable ? 'Deployment required' : connection?.status === 'needs_setup' ? 'Needs setup' : 'Not connected'}</span>
              <button type="button" className={isConnected ? 'ghost-button' : 'primary-button'} onClick={() => connect(provider.id)} disabled={serviceUnavailable || connecting === provider.id || connection?.status === 'needs_setup'} title={serviceUnavailable ? 'Deploy the ad-analytics Edge Function before connecting accounts.' : undefined}>
                <ExternalLink size={16} aria-hidden="true" />
                {connecting === provider.id ? 'Opening...' : isConnected ? 'Reconnect' : 'Connect'}
              </button>
            </article>
          )
        })}
      </div>

      {connectedCount === 0 && !loading && (
        <div className="ads-empty-state">
          <CircleAlert size={22} aria-hidden="true" />
          <div><strong>No ad accounts connected</strong><p>Connect a provider to show verified spend, delivery, conversion, and return metrics here.</p></div>
        </div>
      )}

      <div className="ads-metric-grid" aria-busy={loading}>
        {[
          ['Spend', formatCurrency(metrics.spend)],
          ['Impressions', formatNumber(metrics.impressions)],
          ['Clicks', formatNumber(metrics.clicks)],
          ['CTR', formatPercent(metrics.ctr)],
          ['Conversions', formatNumber(metrics.conversions)],
          ['Cost / conversion', formatCurrency(metrics.costPerConversion)],
        ].map(([label, value]) => <div className="ads-metric" key={label}><span>{label}</span><strong>{loading ? '...' : value}</strong></div>)}
      </div>

      <div className="ads-insights-grid">
        <section className="ads-section"><h3><BarChart3 size={18} /> Campaign performance</h3>{report?.campaigns?.length ? <div className="ads-table">{report.campaigns.map((campaign) => <div className="ads-table-row" key={`${campaign.provider}-${campaign.id}`}><div><strong>{campaign.name}</strong><span>{campaign.provider}</span></div><span>{formatCurrency(campaign.spend)} spend</span><span>{formatNumber(campaign.conversions)} conversions</span><span>{formatCurrency(campaign.costPerConversion)} CPA</span></div>)}</div> : <p className="muted">Campaign results will appear after data has been synced from a connected provider.</p>}</section>
        <section className="ads-section"><h3><Target size={18} /> Decision signals</h3>{report?.insights?.length ? <ul className="ads-insights">{report.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul> : <p className="muted">Decision signals require verified campaign delivery and conversion data.</p>}</section>
      </div>
    </section>
  )
}