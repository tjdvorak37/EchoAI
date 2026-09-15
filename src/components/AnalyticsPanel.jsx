import { useEffect, useState } from 'react'
import { analyticsService } from '../services/analyticsService'

const topTicketCategories = (tickets) => Object.entries(tickets.reduce((counts, ticket) => {
  const key = ticket.category || 'Uncategorized'
  counts[key] = (counts[key] || 0) + 1
  return counts
}, {}))
  .map(([label, count]) => ({ label, count }))
  .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  .slice(0, 6)

function MetricCard({ label, value, detail }) {
  return (
    <div className="it-stat-card">
      <span className="it-stat-val">{value}</span>
      <span className="it-stat-label">{label}</span>
      {detail && <small className="muted">{detail}</small>}
    </div>
  )
}

function RankedList({ title, items, emptyLabel }) {
  return (
    <div className="it-section">
      <h3 className="it-section-title">{title}</h3>
      {items.length === 0 ? <p className="muted">{emptyLabel}</p> : items.map((item) => (
        <div key={item.label} className="it-row">
          <div>
            <p>{item.label}</p>
            <span>{item.count} event{item.count === 1 ? '' : 's'}</span>
          </div>
          <span className="badge info">{item.count}</span>
        </div>
      ))}
    </div>
  )
}

export function AnalyticsPanel({ tickets = [] }) {
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState({ loading: true, error: '' })

  useEffect(() => {
    let active = true
    analyticsService.getSummary({ days: 90 }).then((result) => {
      if (!active) return
      setSummary(result)
      setStatus({ loading: false, error: '' })
    }).catch((error) => {
      if (active) setStatus({ loading: false, error: error.message })
    })
    return () => { active = false }
  }, [])

  if (status.loading) return <p className="muted">Loading analytics...</p>
  if (status.error) return <p className="auth-message auth-error">{status.error}</p>

  const retention = summary?.retention || { activeCustomers: 0, deactivatedCustomers: 0, averageCustomerAgeDays: 0 }
  const issueCategories = topTicketCategories(tickets)

  return (
    <div className="it-overview">
      <div className="it-stat-grid">
        <MetricCard label="Active customers" value={retention.activeCustomers} detail="Current customer profiles" />
        <MetricCard label="Deactivated customers" value={retention.deactivatedCustomers} detail="Churn watchlist" />
        <MetricCard label="Avg customer age" value={`${retention.averageCustomerAgeDays}d`} detail="Based on profile age" />
        <MetricCard label="Tracked events" value={summary.events.length} detail="Last 90 days" />
      </div>

      <RankedList title="Most-used tools" items={summary.topTools} emptyLabel="No navigation events have been captured yet." />
      <RankedList title="Navigation hot spots" items={summary.navigation} emptyLabel="No navigation paths have been captured yet." />
      <RankedList title="Support friction categories" items={issueCategories} emptyLabel="No support tickets are available for analysis." />
      <RankedList title="Exit reasons" items={summary.exits} emptyLabel="No customer exit feedback has been submitted yet." />
    </div>
  )
}