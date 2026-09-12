import { useEffect, useState } from 'react'
import { boardMemberService } from '../services/boardMemberService'
import { BoardPayoutsPanel } from './BoardPayoutsPanel'

const money = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BoardMemberFinancePanel({ company }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    boardMemberService.getSummary(company).then((value) => {
      if (active) setSummary(value)
    }).catch((loadError) => {
      if (active) setError(loadError.message)
    })
    return () => { active = false }
  }, [company])

  return (
    <section className="panel">
      <h2>Board Member Financial Summary</h2>
      <p className="panel-note">Quarterly profit-share reporting. Salary, payroll detail, employee tax records, and individual wages are restricted.</p>
      {error && <p className="auth-message auth-error">{error}</p>}
      {!summary && !error && <p className="muted">Loading financial summary...</p>}
      {summary && (
        <div className="stats-grid">
          <article className="stat-card"><p>Revenue</p><h3>{money(summary.revenue)}</h3></article>
          <article className="stat-card"><p>Operating costs</p><h3>{money(summary.expenses + summary.payrollCost + summary.refunds)}</h3></article>
          <article className="stat-card"><p>Profit after expenses</p><h3>{money(summary.profitAfterExpenses)}</h3></article>
          <article className="stat-card"><p>Active subscriptions</p><h3>{summary.activeSubscriptions}</h3></article>
          <article className="stat-card"><p>Your share</p><h3>{summary.sharePercent}%</h3></article>
          <article className="stat-card"><p>Estimated quarterly payout</p><h3>{money(summary.estimatedPayout)}</h3></article>
        </div>
      )}
      <BoardPayoutsPanel company={company} currentUser={{ role: 'board_member' }} />
    </section>
  )
}
