import { useState } from 'react'

const fmt = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—'

const STATUS_COLOR = { paid: '#22c55e', pending: '#f59e0b', overdue: '#ef4444', approved: '#22c55e', denied: '#ef4444', open: '#3b82f6', done: '#22c55e', exempt: '#64748b', filed: '#3b82f6' }

function Badge({ value, label }) {
  const color = STATUS_COLOR[value] ?? '#64748b'
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: '0.76rem', fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {label ?? value?.replace(/_/g, ' ')}
    </span>
  )
}

function Bar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="fin-bar-row">
      <span className="fin-bar-label">{label}</span>
      <div className="fin-bar-track">
        <div className="fin-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="fin-bar-val">{fmt(value)}</span>
    </div>
  )
}

function Section({ title, action, children }) {
  return (
    <div className="fin-section">
      <div className="fin-section-header">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, color = '#3b82f6' }) {
  return (
    <div className="fin-stat" style={{ borderColor: color }}>
      <span className="fin-stat-val" style={{ color }}>{value}</span>
      <span className="fin-stat-label">{label}</span>
      {sub && <span className="fin-stat-sub">{sub}</span>}
    </div>
  )
}

const EXPENSE_CATEGORIES = ['Hosting', 'Software', 'Marketing', 'Payroll', 'Legal', 'Tax', 'Equipment', 'Other']
const PAYROLL_TYPES = ['employee', 'partner', 'contractor']
const TAX_CATEGORIES = ['Federal Income Tax', 'State Income Tax', 'Self-Employment Tax', 'Sales Tax', 'Payroll Tax', 'Other']

export function FinancePanel({
  purchaseHistory,
  expenses, setExpenses,
  payroll, setPayroll,
  taxRecords, setTaxRecords,
  refunds, setRefunds,
  financialTasks, setFinancialTasks,
}) {
  const [tab, setTab] = useState('dashboard')
  const [expForm, setExpForm] = useState({ category: 'Hosting', vendor: '', description: '', amountUsd: '', date: '', recurring: false, recurringPeriod: 'monthly', status: 'pending' })
  const [prForm, setPrForm] = useState({ name: '', email: '', type: 'employee', jobTitle: '', grossPayUsd: '', taxWithheldUsd: '', payPeriod: 'monthly', notes: '' })
  const [taxForm, setTaxForm] = useState({ category: 'Federal Income Tax', period: '', estimatedUsd: '', paidUsd: '0', dueDate: '', status: 'pending', notes: '' })
  const [taskForm, setTaskForm] = useState({ title: '', category: 'Collections', dueDate: '', priority: 'medium', notes: '' })
  const [showExpForm, setShowExpForm] = useState(false)
  const [showPrForm, setShowPrForm] = useState(false)
  const [showTaxForm, setShowTaxForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingPr, setEditingPr] = useState(null)

  // ── Derived financials ──────────────────────────────────────────────────────
  const confirmedRevenue = purchaseHistory.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amountUsd, 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amountUsd), 0)
  const totalRefunds = refunds.filter((r) => r.status === 'approved' || r.status === 'processed').reduce((s, r) => s + r.amountUsd, 0)
  const totalPayroll = payroll.filter((p) => p.status === 'active').reduce((s, p) => s + Number(p.grossPayUsd), 0)
  const totalTaxPaid = taxRecords.filter((t) => t.status === 'paid').reduce((s, t) => s + Number(t.paidUsd), 0)
  const netProfit = confirmedRevenue - totalExpenses - totalRefunds - totalPayroll
  const openTaxDue = taxRecords.filter((t) => t.status === 'pending').reduce((s, t) => s + Number(t.estimatedUsd), 0)

  // MRR: active monthly × $15 + active annual × $10
  const activeLicenses = purchaseHistory.filter((p) => p.status === 'confirmed')
  const mrr = activeLicenses.filter((p) => p.plan === 'monthly').reduce((s, p) => s + p.amountUsd, 0)
    + activeLicenses.filter((p) => p.plan === 'annual').reduce((s, p) => s + p.amountUsd / 12, 0)

  const addExpense = () => {
    if (!expForm.vendor || !expForm.amountUsd) return
    setExpenses((prev) => [{ id: `exp-${Date.now()}`, ...expForm, amountUsd: Number(expForm.amountUsd) }, ...prev])
    setExpForm({ category: 'Hosting', vendor: '', description: '', amountUsd: '', date: '', recurring: false, recurringPeriod: 'monthly', status: 'pending' })
    setShowExpForm(false)
  }

  const addPayrollEntry = () => {
    if (!prForm.name || !prForm.grossPayUsd) return
    const gross = Number(prForm.grossPayUsd)
    const tax = Number(prForm.taxWithheldUsd) || 0
    setPayroll((prev) => [{ id: `pr-${Date.now()}`, ...prForm, grossPayUsd: gross, taxWithheldUsd: tax, netPayUsd: gross - tax, ytdGrossUsd: gross, ytdTaxUsd: tax, lastPaidDate: null, status: 'active' }, ...prev])
    setPrForm({ name: '', email: '', type: 'employee', jobTitle: '', grossPayUsd: '', taxWithheldUsd: '', payPeriod: 'monthly', notes: '' })
    setShowPrForm(false)
  }

  const savePayrollEdit = () => {
    if (!editingPr) return
    setPayroll((prev) => prev.map((p) => p.id === editingPr.id ? { ...editingPr } : p))
    setEditingPr(null)
  }

  const addTaxRecord = () => {
    if (!taxForm.period || !taxForm.estimatedUsd) return
    setTaxRecords((prev) => [{ id: `tax-${Date.now()}`, ...taxForm, estimatedUsd: Number(taxForm.estimatedUsd), paidUsd: Number(taxForm.paidUsd) || 0, filedDate: null }, ...prev])
    setTaxForm({ category: 'Federal Income Tax', period: '', estimatedUsd: '', paidUsd: '0', dueDate: '', status: 'pending', notes: '' })
    setShowTaxForm(false)
  }

  const markTaxPaid = (id) => {
    setTaxRecords((prev) => prev.map((t) => t.id === id ? { ...t, status: 'paid', paidUsd: t.estimatedUsd, filedDate: new Date().toISOString().slice(0, 10) } : t))
  }

  const processRefund = (id, decision) => {
    setRefunds((prev) => prev.map((r) => r.id === id ? { ...r, status: decision, processedAt: new Date().toISOString() } : r))
  }

  const addTask = () => {
    if (!taskForm.title) return
    setFinancialTasks((prev) => [{ id: `ftask-${Date.now()}`, ...taskForm, status: 'open' }, ...prev])
    setTaskForm({ title: '', category: 'Collections', dueDate: '', priority: 'medium', notes: '' })
    setShowTaskForm(false)
  }

  const toggleTask = (id) => setFinancialTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: t.status === 'done' ? 'open' : 'done' } : t))

  const TABS = [
    { id: 'dashboard', label: '📊 P&L Dashboard' },
    { id: 'revenue', label: '💰 Revenue' },
    { id: 'expenses', label: '💸 Expenses' },
    { id: 'payroll', label: '👥 Payroll' },
    { id: 'taxes', label: '🧾 Taxes' },
    { id: 'refunds', label: '↩️ Refunds' },
    { id: 'tasks', label: `📋 Tasks${financialTasks.filter((t) => t.status === 'open').length > 0 ? ` (${financialTasks.filter((t) => t.status === 'open').length})` : ''}` },
  ]

  const maxBar = Math.max(confirmedRevenue, totalExpenses + totalPayroll, 1)

  return (
    <div className="fin-panel">
      <div className="fin-panel-header">
        <div>
          <h2>Financial Control Center</h2>
          <p className="fin-panel-sub">Admin &amp; Accountant access only</p>
        </div>
      </div>

      <nav className="fin-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`fin-tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="fin-content">

        {tab === 'dashboard' && (
          <div className="fin-dashboard">
            <div className="fin-stat-grid">
              <StatCard label="Total Revenue" value={fmt(confirmedRevenue)} color="#22c55e" />
              <StatCard label="Total Expenses" value={fmt(totalExpenses + totalPayroll)} color="#ef4444" />
              <StatCard label="Net Profit / Loss" value={fmt(netProfit)} color={netProfit >= 0 ? '#22c55e' : '#ef4444'} sub={netProfit >= 0 ? '↑ Profitable' : '↓ Net loss'} />
              <StatCard label="MRR" value={fmt(mrr)} color="#3b82f6" sub="Monthly Recurring Revenue" />
              <StatCard label="Refunds Issued" value={fmt(totalRefunds)} color="#f59e0b" />
              <StatCard label="Tax Paid YTD" value={fmt(totalTaxPaid)} sub={`${fmt(openTaxDue)} upcoming`} color="#a855f7" />
            </div>

            <Section title="Revenue vs Expenses">
              <Bar label="Gross Revenue" value={confirmedRevenue} max={maxBar} color="#22c55e" />
              <Bar label="Operating Expenses" value={totalExpenses} max={maxBar} color="#ef4444" />
              <Bar label="Payroll" value={totalPayroll} max={maxBar} color="#f59e0b" />
              <Bar label="Net Profit" value={Math.max(0, netProfit)} max={maxBar} color="#3b82f6" />
            </Section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <Section title="Upcoming tax due">
                {taxRecords.filter((t) => t.status === 'pending').map((t) => (
                  <div key={t.id} className="fin-row">
                    <div>
                      <p>{t.category}</p>
                      <span>{t.period} • due {fmtDate(t.dueDate)}</span>
                    </div>
                    <strong style={{ color: '#f59e0b' }}>{fmt(t.estimatedUsd)}</strong>
                  </div>
                ))}
                {taxRecords.filter((t) => t.status === 'pending').length === 0 && <p className="fin-muted">No pending taxes.</p>}
              </Section>

              <Section title="Open financial tasks">
                {financialTasks.filter((t) => t.status === 'open').slice(0, 5).map((t) => (
                  <div key={t.id} className="fin-row">
                    <div>
                      <p>{t.title}</p>
                      <span>{t.category}{t.dueDate ? ` • due ${fmtDate(t.dueDate)}` : ''}</span>
                    </div>
                    <Badge value={t.priority} />
                  </div>
                ))}
              </Section>
            </div>

            <Section title="Expense breakdown by category">
              <div className="fin-category-grid">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const total = expenses.filter((e) => e.category === cat).reduce((s, e) => s + Number(e.amountUsd), 0)
                  if (total === 0) return null
                  return (
                    <div key={cat} className="fin-cat-card">
                      <span className="fin-cat-name">{cat}</span>
                      <span className="fin-cat-val">{fmt(total)}</span>
                    </div>
                  )
                })}
              </div>
            </Section>
          </div>
        )}

        {tab === 'revenue' && (
          <div>
            <Section title="Revenue summary">
              <div className="fin-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <StatCard label="Total Confirmed" value={fmt(confirmedRevenue)} color="#22c55e" />
                <StatCard label="MRR" value={fmt(mrr)} color="#3b82f6" />
                <StatCard label="Pending" value={fmt(purchaseHistory.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amountUsd, 0))} color="#f59e0b" />
              </div>
            </Section>
            <Section title="All transactions">
              <div className="fin-table">
                <div className="fin-table-head"><span>User</span><span>Plan</span><span>Amount</span><span>Method</span><span>Date</span><span>Status</span></div>
                {purchaseHistory.map((p) => (
                  <div key={p.id} className="fin-table-row">
                    <div><strong>{p.userFullName}</strong><br /><small>{p.userEmail}</small></div>
                    <span>{p.plan}</span>
                    <span style={{ fontWeight: 700, color: p.status === 'confirmed' ? '#22c55e' : '#f59e0b' }}>{fmt(p.amountUsd)}</span>
                    <span>{p.method}</span>
                    <span>{fmtDate(p.paidAt)}</span>
                    <Badge value={p.status} />
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {tab === 'expenses' && (
          <div>
            <Section
              title="Business expenses"
              action={<button type="button" className="primary-button" style={{ fontSize: '0.85rem', padding: '0.35rem 0.9rem' }} onClick={() => setShowExpForm((v) => !v)}>+ Add expense</button>}
            >
              {showExpForm && (
                <div className="fin-form">
                  <div className="fin-form-grid">
                    <label>Category<select value={expForm.category} onChange={(e) => setExpForm((p) => ({ ...p, category: e.target.value }))}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                    <label>Vendor<input type="text" value={expForm.vendor} onChange={(e) => setExpForm((p) => ({ ...p, vendor: e.target.value }))} placeholder="e.g. DigitalOcean" /></label>
                    <label>Description<input type="text" value={expForm.description} onChange={(e) => setExpForm((p) => ({ ...p, description: e.target.value }))} /></label>
                    <label>Amount ($)<input type="number" min="0" step="0.01" value={expForm.amountUsd} onChange={(e) => setExpForm((p) => ({ ...p, amountUsd: e.target.value }))} /></label>
                    <label>Date<input type="date" value={expForm.date} onChange={(e) => setExpForm((p) => ({ ...p, date: e.target.value }))} /></label>
                    <label>Status<select value={expForm.status} onChange={(e) => setExpForm((p) => ({ ...p, status: e.target.value }))}><option>paid</option><option>pending</option></select></label>
                  </div>
                  <label style={{ flexDirection: 'row', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="checkbox" checked={expForm.recurring} onChange={(e) => setExpForm((p) => ({ ...p, recurring: e.target.checked }))} /> Recurring
                    {expForm.recurring && <select value={expForm.recurringPeriod} onChange={(e) => setExpForm((p) => ({ ...p, recurringPeriod: e.target.value }))}><option>monthly</option><option>annual</option></select>}
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="primary-button" onClick={addExpense}>Save</button>
                    <button type="button" className="ghost-button" onClick={() => setShowExpForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
              <div className="fin-table">
                <div className="fin-table-head"><span>Category</span><span>Vendor</span><span>Description</span><span>Amount</span><span>Date</span><span>Status</span><span>Action</span></div>
                {expenses.map((e) => (
                  <div key={e.id} className="fin-table-row">
                    <span>{e.category}</span>
                    <strong>{e.vendor}</strong>
                    <span>{e.description}{e.recurring ? <em style={{ color: '#64748b', marginLeft: 4 }}>({e.recurringPeriod})</em> : ''}</span>
                    <span style={{ fontWeight: 700 }}>{fmt(e.amountUsd)}</span>
                    <span>{fmtDate(e.date)}</span>
                    <Badge value={e.status} />
                    <button type="button" className="ghost-button" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#ef4444' }} onClick={() => setExpenses((prev) => prev.filter((x) => x.id !== e.id))}>Delete</button>
                  </div>
                ))}
              </div>
              <div className="fin-total-row">
                <span>Total expenses</span>
                <strong>{fmt(totalExpenses)}</strong>
              </div>
            </Section>
          </div>
        )}

        {tab === 'payroll' && (
          <div>
            <Section
              title="Employees, partners &amp; contractors"
              action={<button type="button" className="primary-button" style={{ fontSize: '0.85rem', padding: '0.35rem 0.9rem' }} onClick={() => setShowPrForm((v) => !v)}>+ Add person</button>}
            >
              {showPrForm && (
                <div className="fin-form">
                  <div className="fin-form-grid">
                    <label>Full name<input type="text" value={prForm.name} onChange={(e) => setPrForm((p) => ({ ...p, name: e.target.value }))} /></label>
                    <label>Email<input type="email" value={prForm.email} onChange={(e) => setPrForm((p) => ({ ...p, email: e.target.value }))} /></label>
                    <label>Type<select value={prForm.type} onChange={(e) => setPrForm((p) => ({ ...p, type: e.target.value }))}>{PAYROLL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
                    <label>Job title<input type="text" value={prForm.jobTitle} onChange={(e) => setPrForm((p) => ({ ...p, jobTitle: e.target.value }))} /></label>
                    <label>Gross pay ($)<input type="number" min="0" value={prForm.grossPayUsd} onChange={(e) => setPrForm((p) => ({ ...p, grossPayUsd: e.target.value }))} /></label>
                    <label>Tax withheld ($)<input type="number" min="0" value={prForm.taxWithheldUsd} onChange={(e) => setPrForm((p) => ({ ...p, taxWithheldUsd: e.target.value }))} placeholder="0 for contractors" /></label>
                    <label>Pay period<select value={prForm.payPeriod} onChange={(e) => setPrForm((p) => ({ ...p, payPeriod: e.target.value }))}><option>monthly</option><option>bi-weekly</option><option>weekly</option><option>per-project</option></select></label>
                    <label>Notes<input type="text" value={prForm.notes} onChange={(e) => setPrForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="primary-button" onClick={addPayrollEntry}>Save</button>
                    <button type="button" className="ghost-button" onClick={() => setShowPrForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {editingPr && (
                <div className="fin-form">
                  <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Editing: {editingPr.name}</p>
                  <div className="fin-form-grid">
                    <label>Gross pay ($)<input type="number" min="0" value={editingPr.grossPayUsd} onChange={(e) => setEditingPr((p) => ({ ...p, grossPayUsd: Number(e.target.value), netPayUsd: Number(e.target.value) - p.taxWithheldUsd }))} /></label>
                    <label>Tax withheld ($)<input type="number" min="0" value={editingPr.taxWithheldUsd} onChange={(e) => setEditingPr((p) => ({ ...p, taxWithheldUsd: Number(e.target.value), netPayUsd: p.grossPayUsd - Number(e.target.value) }))} /></label>
                    <label>Job title<input type="text" value={editingPr.jobTitle} onChange={(e) => setEditingPr((p) => ({ ...p, jobTitle: e.target.value }))} /></label>
                    <label>Notes<input type="text" value={editingPr.notes} onChange={(e) => setEditingPr((p) => ({ ...p, notes: e.target.value }))} /></label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="primary-button" onClick={savePayrollEdit}>Save changes</button>
                    <button type="button" className="ghost-button" onClick={() => setEditingPr(null)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="fin-table">
                <div className="fin-table-head"><span>Name / Email</span><span>Type</span><span>Role</span><span>Gross</span><span>Tax Withheld</span><span>Net Pay</span><span>YTD Gross</span><span>Actions</span></div>
                {payroll.map((p) => (
                  <div key={p.id} className="fin-table-row">
                    <div><strong>{p.name}</strong><br /><small>{p.email}</small></div>
                    <Badge value={p.type} />
                    <span>{p.jobTitle}</span>
                    <span style={{ fontWeight: 700 }}>{fmt(p.grossPayUsd)}<small style={{ color: '#64748b', marginLeft: 4 }}>/{p.payPeriod}</small></span>
                    <span style={{ color: '#f59e0b' }}>{fmt(p.taxWithheldUsd)}</span>
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>{fmt(p.netPayUsd)}</span>
                    <span>{fmt(p.ytdGrossUsd)}</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="button" className="ghost-button" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setEditingPr({ ...p })}>Edit</button>
                      <button type="button" className="ghost-button" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#ef4444' }} onClick={() => setPayroll((prev) => prev.filter((x) => x.id !== p.id))}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="fin-total-row">
                <span>Total monthly payroll</span>
                <strong>{fmt(totalPayroll)}</strong>
              </div>
            </Section>
          </div>
        )}

        {tab === 'taxes' && (
          <div>
            <Section
              title="Tax records &amp; estimates"
              action={<button type="button" className="primary-button" style={{ fontSize: '0.85rem', padding: '0.35rem 0.9rem' }} onClick={() => setShowTaxForm((v) => !v)}>+ Add tax record</button>}
            >
              {showTaxForm && (
                <div className="fin-form">
                  <div className="fin-form-grid">
                    <label>Category<select value={taxForm.category} onChange={(e) => setTaxForm((p) => ({ ...p, category: e.target.value }))}>{TAX_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                    <label>Period (e.g. Q3 2026)<input type="text" value={taxForm.period} onChange={(e) => setTaxForm((p) => ({ ...p, period: e.target.value }))} placeholder="Q3 2026" /></label>
                    <label>Estimated amount ($)<input type="number" min="0" value={taxForm.estimatedUsd} onChange={(e) => setTaxForm((p) => ({ ...p, estimatedUsd: e.target.value }))} /></label>
                    <label>Paid amount ($)<input type="number" min="0" value={taxForm.paidUsd} onChange={(e) => setTaxForm((p) => ({ ...p, paidUsd: e.target.value }))} /></label>
                    <label>Due date<input type="date" value={taxForm.dueDate} onChange={(e) => setTaxForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
                    <label>Status<select value={taxForm.status} onChange={(e) => setTaxForm((p) => ({ ...p, status: e.target.value }))}><option>pending</option><option>filed</option><option>paid</option><option>exempt</option></select></label>
                  </div>
                  <label>Notes<input type="text" value={taxForm.notes} onChange={(e) => setTaxForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="primary-button" onClick={addTaxRecord}>Save</button>
                    <button type="button" className="ghost-button" onClick={() => setShowTaxForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
              <div className="fin-table">
                <div className="fin-table-head"><span>Category</span><span>Period</span><span>Estimated</span><span>Paid</span><span>Due Date</span><span>Filed</span><span>Status</span><span>Actions</span></div>
                {taxRecords.map((t) => (
                  <div key={t.id} className="fin-table-row">
                    <span>{t.category}</span>
                    <span>{t.period}</span>
                    <span>{fmt(t.estimatedUsd)}</span>
                    <span style={{ color: t.paidUsd > 0 ? '#22c55e' : '#64748b' }}>{fmt(t.paidUsd)}</span>
                    <span style={{ color: t.dueDate && new Date(t.dueDate) < new Date() && t.status === 'pending' ? '#ef4444' : undefined }}>{fmtDate(t.dueDate)}</span>
                    <span>{fmtDate(t.filedDate)}</span>
                    <Badge value={t.status} />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {t.status === 'pending' && <button type="button" className="primary-button" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={() => markTaxPaid(t.id)}>Mark paid</button>}
                      <button type="button" className="ghost-button" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#ef4444' }} onClick={() => setTaxRecords((prev) => prev.filter((x) => x.id !== t.id))}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="fin-total-row">
                <span>Total upcoming due</span>
                <strong style={{ color: '#f59e0b' }}>{fmt(openTaxDue)}</strong>
              </div>
            </Section>
          </div>
        )}

        {tab === 'refunds' && (
          <div>
            <Section title="Refund requests">
              {refunds.length === 0 && <p className="fin-muted">No refund requests.</p>}
              {refunds.map((r) => (
                <div key={r.id} className="fin-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.6rem', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <div>
                      <strong>{r.userFullName}</strong> <small style={{ color: '#64748b' }}>{r.userEmail}</small>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.88rem', color: '#94a3b8' }}>{r.reason}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '1.1rem', color: '#ef4444' }}>{fmt(r.amountUsd)}</strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>Requested {fmtDate(r.requestedAt)}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Badge value={r.status} />
                    {r.status === 'pending' && (
                      <>
                        <button type="button" className="primary-button" style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem' }} onClick={() => processRefund(r.id, 'approved')}>Approve &amp; process</button>
                        <button type="button" className="ghost-button" style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem', color: '#ef4444' }} onClick={() => processRefund(r.id, 'denied')}>Deny</button>
                      </>
                    )}
                    {r.processedAt && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Processed {fmtDate(r.processedAt)}</span>}
                  </div>
                  {r.notes && <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>{r.notes}</p>}
                </div>
              ))}
              <div className="fin-total-row">
                <span>Total refunds issued</span>
                <strong style={{ color: '#ef4444' }}>{fmt(totalRefunds)}</strong>
              </div>
            </Section>
          </div>
        )}

        {tab === 'tasks' && (
          <div>
            <Section
              title="Financial tasks"
              action={<button type="button" className="primary-button" style={{ fontSize: '0.85rem', padding: '0.35rem 0.9rem' }} onClick={() => setShowTaskForm((v) => !v)}>+ Add task</button>}
            >
              {showTaskForm && (
                <div className="fin-form">
                  <div className="fin-form-grid">
                    <label>Title<input type="text" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. File Q3 taxes" /></label>
                    <label>Category<select value={taskForm.category} onChange={(e) => setTaskForm((p) => ({ ...p, category: e.target.value }))}>{['Collections', 'Taxes', 'Payroll', 'Marketing', 'Hosting', 'Legal', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></label>
                    <label>Due date<input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
                    <label>Priority<select value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))}><option>high</option><option>medium</option><option>low</option></select></label>
                  </div>
                  <label>Notes<input type="text" value={taskForm.notes} onChange={(e) => setTaskForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="primary-button" onClick={addTask}>Save</button>
                    <button type="button" className="ghost-button" onClick={() => setShowTaskForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
              {financialTasks.map((t) => (
                <div key={t.id} className={`fin-task-row ${t.status === 'done' ? 'done' : ''}`}>
                  <button type="button" className="fin-task-check" onClick={() => toggleTask(t.id)}>
                    {t.status === 'done' ? '✓' : '○'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? '#64748b' : '#c9d1d9' }}>{t.title}</p>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{t.category}{t.dueDate ? ` • due ${fmtDate(t.dueDate)}` : ''}{t.notes ? ` • ${t.notes}` : ''}</span>
                  </div>
                  <Badge value={t.priority} label={t.priority} />
                  <button type="button" className="ghost-button" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#ef4444' }} onClick={() => setFinancialTasks((prev) => prev.filter((x) => x.id !== t.id))}>✕</button>
                </div>
              ))}
            </Section>
          </div>
        )}

      </div>
    </div>
  )
}
