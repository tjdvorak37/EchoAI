import { useEffect, useState } from 'react'
import { boardPayoutService } from '../services/boardPayoutService'

const money = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function BoardPayoutsPanel({ company, boardMembers = [], currentUser, adminMode = false }) {
  const [payouts, setPayouts] = useState([])
  const [form, setForm] = useState({ boardMemberId: '', quarterStart: '', quarterEnd: '', profitAfterExpenses: '', activeSubscriptionCount: '' })
  const [status, setStatus] = useState({ error: '', message: '' })
  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    let active = true
    boardPayoutService.list(company, !adminMode).then((records) => {
      if (active) setPayouts(records)
    }).catch((error) => {
      if (active) setStatus({ error: error.message, message: '' })
    })
    return () => { active = false }
  }, [company, adminMode])

  const selectedMember = boardMembers.find((member) => member.id === form.boardMemberId)
  const sharePercent = Number(selectedMember?.profitSharePercent || 0)
  const payoutAmount = Math.max(Number(form.profitAfterExpenses || 0), 0) * sharePercent / 100

  const create = async (event) => {
    event.preventDefault()
    setStatus({ error: '', message: '' })
    try {
      await boardPayoutService.create({ companyKey: company, boardMemberId: form.boardMemberId, quarterStart: form.quarterStart, quarterEnd: form.quarterEnd, profitAfterExpenses: form.profitAfterExpenses, activeSubscriptionCount: form.activeSubscriptionCount, sharePercent, payoutAmount })
      setForm({ boardMemberId: '', quarterStart: '', quarterEnd: '', profitAfterExpenses: '', activeSubscriptionCount: '' })
      setStatus({ error: '', message: 'Quarterly payout created.' })
      setPayouts(await boardPayoutService.list(company, false))
    } catch (error) { setStatus({ error: error.message, message: '' }) }
  }

  return (
    <section className="sub-panel">
      <h3>{adminMode ? 'Board Member Quarterly Payouts' : 'Your Quarterly Payouts'}</h3>
      <p className="muted">Profit share is calculated after expenses. Board Members do not receive salary or payroll wages.</p>
      {adminMode && (
        <form className="auth-form" onSubmit={create}>
          <label>Board Member<select required value={form.boardMemberId} onChange={(event) => setForm((current) => ({ ...current, boardMemberId: event.target.value }))}><option value="">Select member</option>{boardMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName} ({member.profitSharePercent}%)</option>)}</select></label>
          <label>Quarter start<input required type="date" value={form.quarterStart} onChange={(event) => setForm((current) => ({ ...current, quarterStart: event.target.value }))} /></label>
          <label>Quarter end<input required type="date" value={form.quarterEnd} onChange={(event) => setForm((current) => ({ ...current, quarterEnd: event.target.value }))} /></label>
          <label>Profit after expenses<input required type="number" min="0" step="0.01" value={form.profitAfterExpenses} onChange={(event) => setForm((current) => ({ ...current, profitAfterExpenses: event.target.value }))} /></label>
          <label>Active subscriptions<input type="number" min="0" value={form.activeSubscriptionCount} onChange={(event) => setForm((current) => ({ ...current, activeSubscriptionCount: event.target.value }))} /></label>
          <p className="muted">Calculated payout: {money(payoutAmount)} at {sharePercent}%</p>
          <button type="submit" className="primary-button" disabled={!isAdmin && currentUser?.role !== 'accountant'}>Create payout record</button>
        </form>
      )}
      {status.message && <p className="auth-message">{status.message}</p>}
      {status.error && <p className="auth-message auth-error">{status.error}</p>}
      {payouts.map((payout) => (
        <div className="list-row" key={payout.id}><div><strong>{payout.quarter_start} to {payout.quarter_end}</strong><span>{payout.share_percent}% share • {payout.status}</span></div><div><strong>{money(payout.payout_amount)}</strong>{adminMode && payout.status !== 'paid' && <button type="button" className="ghost-button" onClick={async () => { await boardPayoutService.markPaid(payout.id); setPayouts(await boardPayoutService.list(company, false)) }}>Mark paid</button>}</div></div>
      ))}
      {!payouts.length && <p className="muted">No quarterly payout records yet.</p>}
    </section>
  )
}
