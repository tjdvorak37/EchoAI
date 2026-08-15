import { useState } from 'react'
import { FinancePanel } from './FinancePanel'

const STATUS_COLORS = {
  active: '#22c55e',
  pending: '#f59e0b',
  pending_payment: '#f59e0b',
  expired: '#6b7280',
  suspended: '#ef4444',
  confirmed: '#22c55e',
  open: '#3b82f6',
  resolved: '#22c55e',
  closed: '#6b7280',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
}

function StatusBadge({ value }) {
  const color = STATUS_COLORS[value] || '#6b7280'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '999px',
      fontSize: '0.78rem',
      fontWeight: 700,
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
    }}>
      {value?.replace(/_/g, ' ')}
    </span>
  )
}

function Section({ title, children }) {
  return (
    <div className="it-section">
      <h3 className="it-section-title">{title}</h3>
      {children}
    </div>
  )
}

export function AdminPanel({
  teamMembers,
  accessRequests, setAccessRequests,
  alerts, setAlerts,
  licenses, setLicenses,
  tickets, setTickets,
  purchaseHistory, setPurchaseHistory,
  featureFlags, setFeatureFlags,
  billingLive,
  promoCodes, setPromoCodes,
  expenses, setExpenses,
  payroll, setPayroll,
  taxRecords, setTaxRecords,
  refunds, setRefunds,
  financialTasks, setFinancialTasks,
  quotaEditingUserId, setQuotaEditingUserId,
  quotaDraftMb, setQuotaDraftMb,
  handleQuotaUpdate, handleToggleUserAccess, handleUpdateUserRole,
  adminLoading, adminError,
  currentUser,
}) {
  const [itTab, setItTab] = useState('overview')
  const [ticketOpen, setTicketOpen] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [licenseNote, setLicenseNote] = useState({})
  const [userSearch, setUserSearch] = useState('')

  const activeLicenses = licenses.filter((l) => l.status === 'active').length
  const pendingLicenses = licenses.filter((l) => l.status === 'pending_payment').length
  const openTickets = tickets.filter((t) => t.status === 'open').length
  const totalRevenue = purchaseHistory.filter((p) => p.status === 'confirmed').reduce((sum, p) => sum + p.amountUsd, 0)

  const confirmLicense = (licenseId) => {
    setLicenses((prev) => prev.map((l) =>
      l.id === licenseId ? { ...l, status: 'active', paymentConfirmed: true } : l,
    ))
    setPurchaseHistory((prev) => prev.map((p) =>
      p.licenseId === licenseId ? { ...p, status: 'confirmed', paidAt: new Date().toISOString() } : p,
    ))
  }

  const suspendLicense = (licenseId) => {
    setLicenses((prev) => prev.map((l) =>
      l.id === licenseId ? { ...l, status: 'suspended' } : l,
    ))
  }

  const revokeLicense = (licenseId) => {
    setLicenses((prev) => prev.map((l) =>
      l.id === licenseId ? { ...l, status: 'expired' } : l,
    ))
  }

  const restoreLicense = (licenseId) => {
    setLicenses((prev) => prev.map((l) =>
      l.id === licenseId ? { ...l, status: 'active' } : l,
    ))
  }

  const updateLicenseNote = (licenseId, note) => {
    setLicenses((prev) => prev.map((l) =>
      l.id === licenseId ? { ...l, notes: note } : l,
    ))
  }

  const resolveTicket = (ticketId) => {
    setTickets((prev) => prev.map((t) =>
      t.id === ticketId ? { ...t, status: 'resolved', updatedAt: new Date().toISOString() } : t,
    ))
    if (ticketOpen?.id === ticketId) {
      setTicketOpen((prev) => ({ ...prev, status: 'resolved' }))
    }
  }

  const closeTicket = (ticketId) => {
    setTickets((prev) => prev.map((t) =>
      t.id === ticketId ? { ...t, status: 'closed', updatedAt: new Date().toISOString() } : t,
    ))
    setTicketOpen(null)
  }

  const sendReply = (ticketId) => {
    if (!replyDraft.trim()) return
    const msg = {
      id: `msg-${Date.now()}`,
      author: currentUser?.fullName || 'Admin',
      role: 'admin',
      body: replyDraft.trim(),
      sentAt: new Date().toISOString(),
    }
    setTickets((prev) => prev.map((t) =>
      t.id === ticketId ? { ...t, messages: [...t.messages, msg], updatedAt: msg.sentAt } : t,
    ))
    setTicketOpen((prev) => prev ? { ...prev, messages: [...prev.messages, msg] } : prev)
    setReplyDraft('')
  }

  const toggleFeatureFlag = (flagId) => {
    setFeatureFlags((prev) => prev.map((f) =>
      f.id === flagId ? { ...f, enabled: !f.enabled } : f,
    ))
  }

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'licenses', label: '🔑 Licenses' },
    { id: 'tickets', label: `🎫 Tickets${openTickets > 0 ? ` (${openTickets})` : ''}` },
    { id: 'billing', label: '💳 Billing' },
    { id: 'finance', label: '💹 Finance' },
    { id: 'users', label: '👥 Users' },
    { id: 'storage', label: '💾 Storage' },
    { id: 'controls', label: '⚙️ Site Controls' },
  ]

  const filteredUsers = teamMembers.filter((m) =>
    !userSearch || m.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(userSearch.toLowerCase()),
  )

  return (
    <div className="it-panel">
      <div className="it-header">
        <div>
          <h2>IT / Admin Backend</h2>
          <p className="it-header-sub">Restricted to administrators only</p>
        </div>
      </div>

      <nav className="it-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`it-tab-btn ${itTab === tab.id ? 'active' : ''}`}
            onClick={() => setItTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {adminError && <p className="auth-message auth-error">{adminError}</p>}

      <div className="it-content">
        {itTab === 'overview' && (
          <div className="it-overview">
            <div className="it-stat-grid">
              {[
                { label: 'Active licenses', value: activeLicenses, color: '#22c55e' },
                { label: 'Pending payment', value: pendingLicenses, color: '#f59e0b' },
                { label: 'Open tickets', value: openTickets, color: '#3b82f6' },
                { label: 'Total revenue', value: `$${totalRevenue}`, color: '#a855f7' },
                { label: 'Total users', value: teamMembers.length, color: '#06b6d4' },
                { label: 'Access requests', value: accessRequests.filter((r) => r.status === 'pending').length, color: '#f59e0b' },
              ].map((stat) => (
                <div key={stat.label} className="it-stat-card" style={{ borderColor: stat.color }}>
                  <span className="it-stat-val" style={{ color: stat.color }}>{stat.value}</span>
                  <span className="it-stat-label">{stat.label}</span>
                </div>
              ))}
            </div>

            <Section title="Recent license activity">
              {licenses.slice(0, 4).map((l) => (
                <div key={l.id} className="it-row">
                  <div>
                    <p>{l.userFullName}</p>
                    <span>{l.userEmail} • {l.planLabel ?? l.plan} • ${l.priceUsd}</span>
                  </div>
                  <StatusBadge value={l.status} />
                </div>
              ))}
            </Section>

            <Section title="Open support tickets">
              {tickets.filter((t) => t.status === 'open').slice(0, 3).map((t) => (
                <div key={t.id} className="it-row">
                  <div>
                    <p>{t.subject}</p>
                    <span>{t.userFullName} • {t.category}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <StatusBadge value={t.priority} />
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => { setTicketOpen(t); setItTab('tickets') }}
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
              {tickets.filter((t) => t.status === 'open').length === 0 && (
                <p className="muted">No open tickets.</p>
              )}
            </Section>

            <Section title="Payments">
              <div className="it-row">
                <div>
                  <p>Card payments via Stripe</p>
                  <span>
                    Subscriptions activate and revoke automatically. Prices and keys are configured
                    server-side in the edge function secrets, not here.
                  </span>
                </div>
              </div>
            </Section>
          </div>
        )}

        {itTab === 'licenses' && (
          <div>
            <Section title="All licenses">
              <p className="panel-note">
                Activation and revocation are automatic — a successful payment or promo redemption
                turns access on, and a failed or overdue payment turns it off. This list is read
                directly from the billing system; no license here needs your approval.
              </p>
              <div className="it-table">
                <div className="it-table-header">
                  <span>User</span>
                  <span>Plan</span>
                  <span>Purchased</span>
                  <span>Expires</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {licenses.map((l) => (
                  <div key={l.id} className="it-table-row">
                    <div>
                      <strong>{l.userFullName}</strong>
                      <br />
                      <small>{l.userEmail}</small>
                    </div>
                    <span>
                      {l.planLabel ?? l.plan} • {l.storageLimitGb} GB • ${l.priceUsd}
                      {l.billingInterval === 'annual' ? '/yr' : '/mo'}
                    </span>
                    <span>{l.purchasedAt ? new Date(l.purchasedAt).toLocaleDateString() : '—'}</span>
                    <span>{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : '—'}</span>
                    <StatusBadge value={l.status} />
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {billingLive && <span className="muted">Managed automatically</span>}
                      {!billingLive && l.status === 'pending_payment' && (
                        <button type="button" className="primary-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => confirmLicense(l.id)}>
                          Force activate
                        </button>
                      )}
                      {!billingLive && (l.status === 'active') && (
                        <button type="button" className="ghost-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => suspendLicense(l.id)}>
                          Suspend
                        </button>
                      )}
                      {!billingLive && (l.status === 'suspended' || l.status === 'expired') && (
                        <button type="button" className="ghost-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => restoreLicense(l.id)}>
                          Restore
                        </button>
                      )}
                      {!billingLive && l.status === 'active' && (
                        <button type="button" className="ghost-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: '#ef4444' }} onClick={() => revokeLicense(l.id)}>
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {!billingLive && (
            <Section title="License notes">
              {licenses.map((l) => (
                <div key={`note-${l.id}`} className="it-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <strong>{l.userFullName} — {l.id}</strong>
                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                    <input
                      type="text"
                      value={licenseNote[l.id] ?? l.notes}
                      onChange={(e) => setLicenseNote((p) => ({ ...p, [l.id]: e.target.value }))}
                      placeholder="Add internal notes..."
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="ghost-button" onClick={() => updateLicenseNote(l.id, licenseNote[l.id] ?? l.notes)}>
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </Section>
            )}
          </div>
        )}

        {itTab === 'tickets' && (
          <div className="it-tickets-layout">
            <div className="it-ticket-list">
              <Section title="Support tickets">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className={`it-row it-ticket-row ${ticketOpen?.id === t.id ? 'active' : ''}`}
                    onClick={() => setTicketOpen(tickets.find((tk) => tk.id === t.id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>
                      <p style={{ fontWeight: 600 }}>{t.subject}</p>
                      <span>{t.userFullName} • {t.category} • {new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <StatusBadge value={t.priority} />
                      <StatusBadge value={t.status} />
                    </div>
                  </div>
                ))}
                {tickets.length === 0 && <p className="muted">No tickets yet.</p>}
              </Section>
            </div>

            {ticketOpen && (
              <div className="it-ticket-detail">
                <div className="it-ticket-detail-header">
                  <div>
                    <h4>{ticketOpen.subject}</h4>
                    <span>{ticketOpen.userFullName} ({ticketOpen.userEmail}) • {ticketOpen.category}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <StatusBadge value={ticketOpen.priority} />
                    <StatusBadge value={ticketOpen.status} />
                  </div>
                </div>

                <div className="it-ticket-messages">
                  {ticketOpen.messages.map((msg) => (
                    <div key={msg.id} className={`it-ticket-msg ${msg.role === 'admin' ? 'admin' : 'user'}`}>
                      <div className="it-ticket-msg-meta">
                        <strong>{msg.author}</strong>
                        <span>{new Date(msg.sentAt).toLocaleString()}</span>
                      </div>
                      <p>{msg.body}</p>
                    </div>
                  ))}
                </div>

                {ticketOpen.status === 'open' && (
                  <div className="it-ticket-reply">
                    <textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="Type your reply..."
                      rows={3}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" className="primary-button" onClick={() => sendReply(ticketOpen.id)}>
                        Send reply
                      </button>
                      <button type="button" className="ghost-button" onClick={() => resolveTicket(ticketOpen.id)}>
                        Mark resolved
                      </button>
                      <button type="button" className="ghost-button" style={{ color: '#ef4444' }} onClick={() => closeTicket(ticketOpen.id)}>
                        Close ticket
                      </button>
                    </div>
                  </div>
                )}

                {ticketOpen.status !== 'open' && (
                  <div className="it-ticket-closed-notice">
                    This ticket is {ticketOpen.status}.
                    <button type="button" className="text-button" onClick={() => setTickets((prev) => prev.map((t) => t.id === ticketOpen.id ? { ...t, status: 'open' } : t))}>
                      Reopen
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {itTab === 'billing' && (
          <div>
            <Section title="Promo codes">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="primary-button"
                  style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                  onClick={() => {
                    const code = `ECHO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
                    setPromoCodes((prev) => [{
                      id: `promo-${Date.now()}`,
                      code,
                      description: 'Free 30-day trial',
                      createdAt: new Date().toISOString(),
                      expiresAt: null,
                      maxUses: 1,
                      usedCount: 0,
                      usedBy: [],
                      active: true,
                      createdBy: currentUser?.email || 'admin',
                    }, ...prev])
                  }}
                >
                  + Generate single-use code
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                  onClick={() => {
                    const code = `ECHO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
                    setPromoCodes((prev) => [{
                      id: `promo-${Date.now()}`,
                      code,
                      description: 'Free 30-day trial (unlimited uses)',
                      createdAt: new Date().toISOString(),
                      expiresAt: null,
                      maxUses: null,
                      usedCount: 0,
                      usedBy: [],
                      active: true,
                      createdBy: currentUser?.email || 'admin',
                    }, ...prev])
                  }}
                >
                  + Generate unlimited code
                </button>
              </div>
              {promoCodes.map((c) => (
                <div key={c.id} className="it-row">
                  <div>
                    <p style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                      {c.code}
                    </p>
                    <span>
                      {c.description} •
                      {c.maxUses === null ? ' unlimited uses' : ` ${c.usedCount}/${c.maxUses} used`}
                      {c.expiresAt ? ` • expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                      {c.usedBy.length > 0 ? ` • used by: ${c.usedBy.slice(0, 3).join(', ')}${c.usedBy.length > 3 ? '…' : ''}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                    <StatusBadge value={c.active ? 'active' : 'expired'} />
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                      onClick={() => setPromoCodes((prev) => prev.map((p) => p.id === c.id ? { ...p, active: !p.active } : p))}
                    >
                      {c.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: '#ef4444' }}
                      onClick={() => setPromoCodes((prev) => prev.filter((p) => p.id !== c.id))}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {promoCodes.length === 0 && <p className="muted">No promo codes yet. Generate one above.</p>}
            </Section>

            <Section title="Purchase history">
              <div className="it-table">
                <div className="it-table-header">
                  <span>User</span>
                  <span>Plan</span>
                  <span>Amount</span>
                  <span>Venmo TXN</span>
                  <span>Paid at</span>
                  <span>Status</span>
                </div>
                {purchaseHistory.map((p) => (
                  <div key={p.id} className="it-table-row">
                    <div>
                      <strong>{p.userFullName}</strong>
                      <br />
                      <small>{p.userEmail}</small>
                    </div>
                    <span>{p.planLabel ?? p.plan}</span>
                    <span>${p.amountUsd}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {p.venmoTxnId || '—'}
                    </span>
                    <span>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : 'Pending'}</span>
                    <StatusBadge value={p.status} />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Revenue summary">
              <div className="it-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  { label: 'Confirmed revenue', value: `$${totalRevenue}`, color: '#22c55e' },
                  { label: 'Pending payments', value: purchaseHistory.filter((p) => p.status === 'pending').length, color: '#f59e0b' },
                  { label: 'Annual subscriptions', value: licenses.filter((l) => l.billingInterval === 'annual').length, color: '#a855f7' },
                ].map((s) => (
                  <div key={s.label} className="it-stat-card" style={{ borderColor: s.color }}>
                    <span className="it-stat-val" style={{ color: s.color }}>{s.value}</span>
                    <span className="it-stat-label">{s.label}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {itTab === 'users' && (
          <div>
            <Section title="User management">
              <label>
                Search
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                />
              </label>

              {filteredUsers.map((member) => (
                <div key={member.id} className="it-row">
                  <div>
                    <p style={{ fontWeight: 600 }}>{member.fullName} <StatusBadge value={member.role} /></p>
                    <span>{member.email} • {member.company || 'No company'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatusBadge value={member.accessStatus} />
                    {member.role !== 'admin' && (
                      <>
                        <button type="button" className="ghost-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => handleToggleUserAccess(member)} disabled={adminLoading}>
                          {member.accessStatus === 'deactivated' ? 'Reactivate' : 'Deactivate'}
                        </button>
                        <button type="button" className="ghost-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => { setQuotaEditingUserId(member.id); setQuotaDraftMb(String(member.storageQuotaMb ?? 500)) }}>
                          Quota: {member.storageQuotaMb ?? 500} MB
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Role management">
              {filteredUsers.filter((m) => m.role !== 'admin').map((member) => (
                <div key={`role-${member.id}`} className="it-row">
                  <div>
                    <p>{member.fullName}</p>
                    <span>{member.email}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {['admin', 'manager', 'it', 'accountant', 'user'].map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={member.role === role ? 'primary-button' : 'ghost-button'}
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => handleUpdateUserRole(member, role)}
                        disabled={adminLoading || member.role === role}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Access requests">
              {accessRequests.length === 0 && <p className="muted">No pending access requests.</p>}
              {accessRequests.map((req) => (
                <div key={req.id} className="it-row">
                  <div>
                    <p>{req.fullName}</p>
                    <span>{req.email} • {req.company || 'No company'} • {new Date(req.requestedAt).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <StatusBadge value={req.status} />
                    {req.status === 'pending' && (
                      <>
                        <button type="button" className="primary-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => setAccessRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'approved', reviewedAt: new Date().toISOString() } : r))}>
                          Approve
                        </button>
                        <button type="button" className="ghost-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} onClick={() => setAccessRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'denied', reviewedAt: new Date().toISOString() } : r))}>
                          Deny
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </Section>

            {quotaEditingUserId && (
              <Section title="Edit storage quota">
                <label>
                  Quota (MB) for {teamMembers.find((m) => m.id === quotaEditingUserId)?.fullName}
                  <input
                    type="number"
                    min="1"
                    value={quotaDraftMb}
                    onChange={(e) => setQuotaDraftMb(e.target.value)}
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="primary-button" onClick={() => { const m = teamMembers.find((item) => item.id === quotaEditingUserId); if (m) handleQuotaUpdate(m) }}>Save quota</button>
                  <button type="button" className="ghost-button" onClick={() => setQuotaEditingUserId('')}>Cancel</button>
                </div>
              </Section>
            )}
          </div>
        )}

        {itTab === 'storage' && (
          <div>
            <Section title="Storage allocation by user">
              <div className="it-table">
                <div className="it-table-header">
                  <span>User</span>
                  <span>Plan limit</span>
                  <span>Quota (MB)</span>
                  <span>License</span>
                  <span>Actions</span>
                </div>
                {teamMembers.map((member) => {
                  const lic = licenses.find((l) => l.userEmail === member.email)
                  return (
                    <div key={member.id} className="it-table-row">
                      <div>
                        <strong>{member.fullName}</strong>
                        <br />
                        <small>{member.email}</small>
                      </div>
                      <span>{lic ? `${lic.storageLimitGb} GB` : 'No license'}</span>
                      <span>{member.storageQuotaMb ?? 500} MB</span>
                      <StatusBadge value={lic?.status || 'none'} />
                      <button
                        type="button"
                        className="ghost-button"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => { setQuotaEditingUserId(member.id); setQuotaDraftMb(String(member.storageQuotaMb ?? 500)); setItTab('users') }}
                      >
                        Edit quota
                      </button>
                    </div>
                  )
                })}
              </div>
            </Section>
          </div>
        )}

        {itTab === 'finance' && (
          <FinancePanel
            purchaseHistory={purchaseHistory}
            expenses={expenses} setExpenses={setExpenses}
            payroll={payroll} setPayroll={setPayroll}
            taxRecords={taxRecords} setTaxRecords={setTaxRecords}
            refunds={refunds} setRefunds={setRefunds}
            financialTasks={financialTasks} setFinancialTasks={setFinancialTasks}
          />
        )}

        {itTab === 'controls' && (
          <div>
            <Section title="Site feature flags">
              <p className="muted">Enable or disable platform features globally.</p>
              {featureFlags.map((flag) => (
                <div key={flag.id} className="it-row">
                  <div>
                    <p style={{ fontWeight: 600 }}>{flag.label}</p>
                    <span>{flag.description}</span>
                  </div>
                  <button
                    type="button"
                    className={flag.enabled ? 'primary-button' : 'ghost-button'}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', minWidth: '90px' }}
                    onClick={() => toggleFeatureFlag(flag.id)}
                  >
                    {flag.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </Section>

            <Section title="Issue desk">
              {alerts.map((alert) => (
                <div key={alert.id} className="it-row">
                  <div>
                    <p>{alert.title}</p>
                    <span>{alert.owner}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <StatusBadge value={alert.priority} />
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ fontSize: '0.8rem' }}
                      onClick={() => setAlerts((prev) => prev.map((a) => a.id === alert.id ? { ...a, status: 'resolved' } : a))}
                      disabled={alert.status === 'resolved'}
                    >
                      {alert.status === 'resolved' ? 'Resolved' : 'Resolve'}
                    </button>
                  </div>
                </div>
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}
