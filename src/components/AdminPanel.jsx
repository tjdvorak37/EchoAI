import { useState } from 'react'
import { FinancePanel } from './FinancePanel'

const USERS_PER_PAGE = 25
const USER_ROLES = ['admin', 'manager', 'it', 'accountant', 'user']
const USER_STATUSES = ['active', 'pending', 'deactivated', 'approved', 'denied']

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : 'Never')

const STATUS_COLORS = {
  active: '#22c55e',
  pending: '#f59e0b',
  pending_payment: '#f59e0b',
  expired: '#6b7280',
  suspended: '#ef4444',
  confirmed: '#22c55e',
  open: '#3b82f6',
  new: '#3b82f6',
  triage: '#a78bfa',
  in_progress: '#f59e0b',
  waiting_customer: '#f97316',
  escalated: '#ef4444',
  resolved: '#22c55e',
  closed: '#6b7280',
  critical: '#ef4444',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
  configured: '#22c55e',
  'needs setup': '#f59e0b',
  'not deployed': '#6b7280',
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
  landingAnnouncement, setLandingAnnouncement,
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
  companySeatPackage, companySeats,
  handleCreateCompanySeatPackage, handleUpdateCompanySeatPackage, handleAssignCompanySeat, handleRevokeCompanySeat,
  handleRespondToSupportTicket,
  handleUpdateSupportTicketStatus,
  socialPlatformReadiness, socialPlatformReadinessLoading, socialPlatformReadinessError, handleRefreshSocialPlatformReadiness,
  adminLoading, adminError,
  currentUser,
  onAdminUserAction,
}) {
  const [itTab, setItTab] = useState('overview')
  const [ticketOpen, setTicketOpen] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [licenseNote, setLicenseNote] = useState({})
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const [userStatusFilter, setUserStatusFilter] = useState('all')
  const [userSort, setUserSort] = useState('name-asc')
  const [userPage, setUserPage] = useState(1)
  const [expandedUserId, setExpandedUserId] = useState(null)
  const [verification, setVerification] = useState({ userId: null, summary: null, loading: false, error: '' })
  const [recoveryLink, setRecoveryLink] = useState({ userId: null, url: '', error: '', loading: false })
  const [profileDraft, setProfileDraft] = useState({ fullName: '', company: '', saving: false, error: '' })

  const openUserDetail = (member) => {
    const nextId = expandedUserId === member.id ? null : member.id
    setExpandedUserId(nextId)
    setVerification({ userId: null, summary: null, loading: false, error: '' })
    setRecoveryLink({ userId: null, url: '', error: '', loading: false })
    setProfileDraft({ fullName: member.fullName || '', company: member.company || '', saving: false, error: '' })
  }

  const loadVerification = async (member) => {
    setVerification({ userId: member.id, summary: null, loading: true, error: '' })
    try {
      const { summary } = await onAdminUserAction({ action: 'verification-summary', userId: member.id })
      setVerification({ userId: member.id, summary, loading: false, error: '' })
    } catch (error) {
      setVerification({ userId: member.id, summary: null, loading: false, error: error.message })
    }
  }

  const generateRecoveryLink = async (member) => {
    setRecoveryLink({ userId: member.id, url: '', error: '', loading: true })
    try {
      const { recoveryLink: url } = await onAdminUserAction({ action: 'recovery-link', userId: member.id })
      setRecoveryLink({ userId: member.id, url, error: '', loading: false })
    } catch (error) {
      setRecoveryLink({ userId: member.id, url: '', error: error.message, loading: false })
    }
  }

  const saveProfileDraft = async (member) => {
    setProfileDraft((prev) => ({ ...prev, saving: true, error: '' }))
    try {
      await onAdminUserAction({
        action: 'update-profile',
        userId: member.id,
        fullName: profileDraft.fullName,
        company: profileDraft.company,
      })
      setProfileDraft((prev) => ({ ...prev, saving: false, error: '' }))
    } catch (error) {
      setProfileDraft((prev) => ({ ...prev, saving: false, error: error.message }))
    }
  }

  const [seatLimitDraft, setSeatLimitDraft] = useState('10')
  const [seatEmailDraft, setSeatEmailDraft] = useState('')
  const [seatError, setSeatError] = useState('')
  const [ticketFilter, setTicketFilter] = useState({
    status: 'all',
    priority: 'all',
    queue: 'all',
    assignee: 'all',
    search: '',
  })
  const [ticketView, setTicketView] = useState('active')
  const [announcementDraft, setAnnouncementDraft] = useState(landingAnnouncement)

  const activeLicenses = licenses.filter((l) => l.status === 'active').length
  const pendingLicenses = licenses.filter((l) => l.status === 'pending_payment').length
  const openTicketStatuses = ['new', 'triage', 'in_progress', 'waiting_customer', 'escalated', 'open']
  const openTickets = tickets.filter((t) => openTicketStatuses.includes(t.status)).length
  const totalRevenue = purchaseHistory.filter((p) => p.status === 'confirmed').reduce((sum, p) => sum + p.amountUsd, 0)
  const assignedSeats = companySeats.filter((seat) => seat.status !== 'revoked').length

  const createSeatPackage = async (event) => {
    event.preventDefault()
    setSeatError('')
    try {
      await handleCreateCompanySeatPackage(seatLimitDraft)
    } catch (error) {
      setSeatError(error.message)
    }
  }

  const assignSeat = async (event) => {
    event.preventDefault()
    setSeatError('')
    try {
      await handleAssignCompanySeat(seatEmailDraft)
      setSeatEmailDraft('')
    } catch (error) {
      setSeatError(error.message)
    }
  }

  const resizeSeatPackage = async (event) => {
    event.preventDefault()
    setSeatError('')
    try {
      await handleUpdateCompanySeatPackage(seatLimitDraft)
    } catch (error) {
      setSeatError(error.message)
    }
  }

  const revokeSeat = async (seatId) => {
    setSeatError('')
    try {
      await handleRevokeCompanySeat(seatId)
    } catch (error) {
      setSeatError(error.message)
    }
  }

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

  const updateTicketStatus = async (ticketId, status) => {
    try {
      const updated = await handleUpdateSupportTicketStatus({ ticketId, status })
      if (ticketOpen?.id === ticketId) {
        setTicketOpen((prev) => ({ ...prev, ...updated }))
      }
      return updated
    } catch (error) {
      setSeatError(error.message)
      return null
    }
  }

  const resolveTicket = async (ticketId) => {
    await updateTicketStatus(ticketId, 'resolved')
  }

  const isTicketActionable = (status) => !['resolved', 'closed'].includes(status || 'open')

  const closeTicket = async (ticketId) => {
    const updated = await updateTicketStatus(ticketId, 'closed')
    if (updated) setTicketOpen(null)
  }

  const sendReply = async (ticketId) => {
    if (!replyDraft.trim()) return
    const response = replyDraft.trim()
    try {
      await handleRespondToSupportTicket({ ticketId, response })
    } catch (error) {
      setSeatError(error.message)
      return
    }
    const msg = {
      id: `msg-${Date.now()}`,
      author: currentUser?.fullName || 'Admin',
      role: 'admin',
      body: response,
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

  const isFullAdmin = currentUser?.role === 'admin'
  const TABS = isFullAdmin ? [
    { id: 'overview', label: '📊 Overview' },
    { id: 'licenses', label: '🔑 Licenses' },
    { id: 'tickets', label: `🎫 Tickets${openTickets > 0 ? ` (${openTickets})` : ''}` },
    { id: 'billing', label: '💳 Billing' },
    { id: 'finance', label: '💹 Finance' },
    { id: 'users', label: '👥 Users' },
    { id: 'storage', label: '💾 Storage' },
    { id: 'integrations', label: '🔌 Integrations' },
    { id: 'controls', label: '⚙️ Site Controls' },
  ] : [
    { id: 'integrations', label: '🔌 Integrations' },
  ]

  const filteredUsers = teamMembers.filter((member) => {
    const term = userSearch.trim().toLowerCase()
    const matchesSearch = !term
      || member.fullName?.toLowerCase().includes(term)
      || member.email?.toLowerCase().includes(term)
      || member.company?.toLowerCase().includes(term)
    const matchesRole = userRoleFilter === 'all' || member.role === userRoleFilter
    const matchesStatus = userStatusFilter === 'all' || member.accessStatus === userStatusFilter
    return matchesSearch && matchesRole && matchesStatus
  })

  const sortedUsers = [...filteredUsers].sort((left, right) => {
    switch (userSort) {
      case 'name-desc':
        return (right.fullName || '').localeCompare(left.fullName || '')
      case 'email-asc':
        return (left.email || '').localeCompare(right.email || '')
      case 'company-asc':
        return (left.company || '').localeCompare(right.company || '')
      case 'quota-desc':
        return (right.storageQuotaMb ?? 0) - (left.storageQuotaMb ?? 0)
      default:
        return (left.fullName || '').localeCompare(right.fullName || '')
    }
  })

  const userPageCount = Math.max(1, Math.ceil(sortedUsers.length / USERS_PER_PAGE))
  // Filters can shrink the list under the current page while userPage still points past the end.
  const safeUserPage = Math.min(userPage, userPageCount)
  const visibleUsers = sortedUsers.slice((safeUserPage - 1) * USERS_PER_PAGE, safeUserPage * USERS_PER_PAGE)

  const resetUserPaging = (apply) => {
    apply()
    setUserPage(1)
  }

  const ticketAssignees = ['Unassigned', ...new Set(tickets.map((ticket) => ticket.assignee).filter(Boolean))]
  const ticketQueues = ['all', ...new Set(tickets.map((ticket) => ticket.queue).filter(Boolean))]
  const filteredTickets = tickets.filter((ticket) => {
    const isHistoryTicket = ticket.status === 'closed'
    if (ticketView === 'active' && isHistoryTicket) return false
    if (ticketView === 'history' && !isHistoryTicket) return false
    const searchTerm = ticketFilter.search.trim().toLowerCase()
    const matchesSearch = !searchTerm || [
      ticket.subject,
      ticket.userFullName,
      ticket.userEmail,
      ticket.category,
      ticket.queue,
      ticket.assignee,
      ticket.tags?.join(' '),
    ].join(' ').toLowerCase().includes(searchTerm)

    const matchesStatus = ticketFilter.status === 'all' || ticket.status === ticketFilter.status
    const matchesPriority = ticketFilter.priority === 'all' || ticket.priority === ticketFilter.priority
    const matchesQueue = ticketFilter.queue === 'all' || ticket.queue === ticketFilter.queue
    const matchesAssignee = ticketFilter.assignee === 'all'
      || (ticketFilter.assignee === 'Unassigned' ? !ticket.assignee : ticket.assignee === ticketFilter.assignee)

    return matchesSearch && matchesStatus && matchesPriority && matchesQueue && matchesAssignee
  })

  const updateTicketField = (ticketId, patch) => {
    setTickets((prev) => prev.map((ticket) =>
      ticket.id === ticketId ? { ...ticket, ...patch, updatedAt: new Date().toISOString() } : ticket,
    ))
  }

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
              {tickets.filter((t) => openTicketStatuses.includes(t.status)).slice(0, 3).map((t) => (
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
              {tickets.filter((t) => openTicketStatuses.includes(t.status)).length === 0 && (
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
            <Section title="Company email seats">
              <p className="panel-note">
                Assign individual seats to employee email addresses. Employees claim access when they sign up with the assigned email.
              </p>
              {!companySeatPackage ? (
                <form className="composer" onSubmit={createSeatPackage}>
                  <label>
                    Seat package size
                    <input type="number" min="1" step="1" value={seatLimitDraft} onChange={(event) => setSeatLimitDraft(event.target.value)} />
                  </label>
                  <button type="submit" className="primary-button" disabled={adminLoading}>Create company seat package</button>
                </form>
              ) : (
                <>
                  <div className="asset-usage-banner">
                    <strong>{currentUser?.company || companySeatPackage.companyKey}</strong>
                    <span>{assignedSeats} of {companySeatPackage.seatLimit} seats assigned</span>
                  </div>
                  <form className="composer" onSubmit={resizeSeatPackage}>
                    <label>
                      Package seats
                      <input type="number" min={assignedSeats} step="1" value={seatLimitDraft} onChange={(event) => setSeatLimitDraft(event.target.value)} />
                    </label>
                    <button type="submit" className="ghost-button" disabled={adminLoading}>Update package size</button>
                    <small className="muted">No partial refunds. Downsizing cannot remove seats already assigned.</small>
                  </form>
                  <form className="composer" onSubmit={assignSeat}>
                    <label>
                      Employee email
                      <input type="email" required value={seatEmailDraft} onChange={(event) => setSeatEmailDraft(event.target.value)} placeholder="employee@company.com" />
                    </label>
                    <button type="submit" className="primary-button" disabled={adminLoading || assignedSeats >= companySeatPackage.seatLimit}>Assign seat</button>
                  </form>
                  {companySeats.map((seat) => (
                    <div key={seat.id} className="it-row">
                      <div>
                        <strong>{seat.employeeEmail}</strong>
                        <br />
                        <small>{seat.claimedAt ? 'Claimed' : 'Awaiting signup'}</small>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <StatusBadge value={seat.status} />
                        {seat.status !== 'revoked' && <button type="button" className="ghost-button" onClick={() => revokeSeat(seat.id)}>Revoke</button>}
                      </div>
                    </div>
                  ))}
                </>
              )}
              {seatError && <p className="auth-message auth-error">{seatError}</p>}
            </Section>
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
                <div className="it-ticket-filters">
                  <div className="it-ticket-view-tabs" role="tablist" aria-label="Ticket views">
                    <button
                      type="button"
                      className={ticketView === 'active' ? 'active' : ''}
                      onClick={() => {
                        setTicketView('active')
                        setTicketFilter((prev) => ({ ...prev, status: 'all' }))
                        setTicketOpen(null)
                      }}
                    >
                      Active queue
                    </button>
                    <button
                      type="button"
                      className={ticketView === 'history' ? 'active' : ''}
                      onClick={() => {
                        setTicketView('history')
                        setTicketFilter((prev) => ({ ...prev, status: 'all' }))
                        setTicketOpen(null)
                      }}
                    >
                      History ({tickets.filter((ticket) => ticket.status === 'closed').length})
                    </button>
                  </div>
                  <input
                    type="text"
                    value={ticketFilter.search}
                    onChange={(event) => setTicketFilter((prev) => ({ ...prev, search: event.target.value }))}
                    placeholder="Search tickets, people, tags..."
                  />
                  <div className="it-ticket-filter-row">
                    <select value={ticketFilter.status} onChange={(event) => setTicketFilter((prev) => ({ ...prev, status: event.target.value }))}>
                      <option value="all">All statuses</option>
                      <option value="new">New</option>
                      <option value="triage">In triage</option>
                      <option value="in_progress">In progress</option>
                      <option value="waiting_customer">Waiting on customer</option>
                      <option value="escalated">Escalated</option>
                      {ticketView === 'active' && <option value="resolved">Resolved</option>}
                      {ticketView === 'history' && <option value="closed">Closed</option>}
                    </select>
                    <select value={ticketFilter.priority} onChange={(event) => setTicketFilter((prev) => ({ ...prev, priority: event.target.value }))}>
                      <option value="all">All priorities</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <select value={ticketFilter.queue} onChange={(event) => setTicketFilter((prev) => ({ ...prev, queue: event.target.value }))}>
                      <option value="all">All queues</option>
                      {ticketQueues.filter((queue) => queue !== 'all').map((queue) => (
                        <option key={queue} value={queue}>{queue}</option>
                      ))}
                    </select>
                    <select value={ticketFilter.assignee} onChange={(event) => setTicketFilter((prev) => ({ ...prev, assignee: event.target.value }))}>
                      <option value="all">All assignees</option>
                      {ticketAssignees.map((assignee) => (
                        <option key={assignee} value={assignee}>{assignee}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="it-ticket-stats">
                  {[
                    { label: 'Open', value: tickets.filter((t) => ['new', 'triage', 'in_progress', 'waiting_customer', 'escalated'].includes(t.status)).length },
                    { label: 'Critical', value: tickets.filter((t) => t.priority === 'critical').length },
                    { label: 'Waiting', value: tickets.filter((t) => t.status === 'waiting_customer').length },
                    { label: 'Resolved', value: tickets.filter((t) => t.status === 'resolved').length },
                  ].map((stat) => (
                    <div key={stat.label} className="it-ticket-stat">
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>

                {filteredTickets.map((t) => (
                  <div
                    key={t.id}
                    className={`it-row it-ticket-row ${ticketOpen?.id === t.id ? 'active' : ''}`}
                    onClick={() => setTicketOpen(tickets.find((tk) => tk.id === t.id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>
                      <p style={{ fontWeight: 600 }}>{t.subject}</p>
                      <span>
                        {t.userFullName} • {t.category} • {t.queue || 'unassigned queue'} • {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                      {t.tags?.length > 0 && (
                        <div className="it-ticket-tags">
                          {t.tags.map((tag) => <span key={`${t.id}-${tag}`} className="it-tag">{tag}</span>)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <StatusBadge value={t.priority} />
                      <StatusBadge value={t.status} />
                    </div>
                  </div>
                ))}
                {filteredTickets.length === 0 && <p className="muted">No tickets match this filter.</p>}
              </Section>
            </div>

            {ticketOpen && (
              <div className="it-ticket-detail">
                <div className="it-ticket-detail-header">
                  <div>
                    <h4>{ticketOpen.subject}</h4>
                    <span>{ticketOpen.userFullName} ({ticketOpen.userEmail}) • {ticketOpen.category} • {ticketOpen.queue || 'unassigned queue'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <StatusBadge value={ticketOpen.priority} />
                    <StatusBadge value={ticketOpen.status} />
                  </div>
                </div>

                <div className="it-ticket-meta-grid">
                  <div><span>Owner</span><strong>{ticketOpen.assignee || 'Unassigned'}</strong></div>
                  <div><span>Customer</span><strong>{ticketOpen.customerTier || 'standard'}</strong></div>
                  <div><span>Due</span><strong>{ticketOpen.dueAt ? new Date(ticketOpen.dueAt).toLocaleDateString() : 'No due date'}</strong></div>
                  <div><span>Updated</span><strong>{new Date(ticketOpen.updatedAt || ticketOpen.createdAt).toLocaleString()}</strong></div>
                </div>

                <div className="it-ticket-actions-inline">
                  <select
                    value={ticketOpen.status}
                    onChange={(event) => updateTicketField(ticketOpen.id, { status: event.target.value })}
                  >
                    <option value="new">New</option>
                    <option value="triage">In triage</option>
                    <option value="in_progress">In progress</option>
                    <option value="waiting_customer">Waiting on customer</option>
                    <option value="escalated">Escalated</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <select
                    value={ticketOpen.priority}
                    onChange={(event) => updateTicketField(ticketOpen.id, { priority: event.target.value })}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={ticketOpen.assignee || 'Unassigned'}
                    onChange={(event) => updateTicketField(ticketOpen.id, { assignee: event.target.value === 'Unassigned' ? '' : event.target.value })}
                  >
                    <option value="Unassigned">Unassigned</option>
                    {ticketAssignees.filter((assignee) => assignee !== 'Unassigned').map((assignee) => (
                      <option key={assignee} value={assignee}>{assignee}</option>
                    ))}
                  </select>
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

                {isTicketActionable(ticketOpen.status) && (
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

                {!isTicketActionable(ticketOpen.status) && (
                  <div className="it-ticket-closed-notice">
                    This ticket is {ticketOpen.status}.
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setTicketView('active')
                        setTicketFilter((prev) => ({ ...prev, status: 'all' }))
                        updateTicketStatus(ticketOpen.id, 'open')
                      }}
                    >
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
              <div className="it-user-filters">
                <label>
                  Search
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => resetUserPaging(() => setUserSearch(e.target.value))}
                    placeholder="Name, email, or company..."
                  />
                </label>
                <label>
                  Role
                  <select value={userRoleFilter} onChange={(e) => resetUserPaging(() => setUserRoleFilter(e.target.value))}>
                    <option value="all">All roles</option>
                    {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </label>
                <label>
                  Status
                  <select value={userStatusFilter} onChange={(e) => resetUserPaging(() => setUserStatusFilter(e.target.value))}>
                    <option value="all">All statuses</option>
                    {USER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label>
                  Sort
                  <select value={userSort} onChange={(e) => setUserSort(e.target.value)}>
                    <option value="name-asc">Name A–Z</option>
                    <option value="name-desc">Name Z–A</option>
                    <option value="email-asc">Email A–Z</option>
                    <option value="company-asc">Company A–Z</option>
                    <option value="quota-desc">Largest quota</option>
                  </select>
                </label>
              </div>

              <p className="muted it-user-count">
                {sortedUsers.length === teamMembers.length
                  ? `${sortedUsers.length} user${sortedUsers.length === 1 ? '' : 's'}`
                  : `${sortedUsers.length} of ${teamMembers.length} users match`}
                {sortedUsers.length > USERS_PER_PAGE && ` • page ${safeUserPage} of ${userPageCount}`}
              </p>

              {sortedUsers.length === 0 && <p className="muted">No users match these filters.</p>}

              {visibleUsers.map((member) => {
                const expanded = expandedUserId === member.id
                return (
                  <div key={member.id} className="it-user-row">
                    <div className="it-row">
                      <div>
                        <p style={{ fontWeight: 600 }}>{member.fullName} <StatusBadge value={member.role} /></p>
                        <span>{member.email} • {member.company || 'No company'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <StatusBadge value={member.accessStatus} />
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => openUserDetail(member)}
                          aria-expanded={expanded}
                        >
                          {expanded ? 'Close' : 'Manage'}
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="it-user-detail">
                        {member.role === 'admin' ? (
                          <p className="muted">Administrator accounts cannot be modified here.</p>
                        ) : (
                          <>
                            <div className="it-user-detail-group">
                              <span className="it-user-detail-label">Access</span>
                              <button type="button" className="ghost-button" onClick={() => handleToggleUserAccess(member)} disabled={adminLoading}>
                                {member.accessStatus === 'deactivated' ? 'Reactivate' : 'Deactivate'}
                              </button>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => { setQuotaEditingUserId(member.id); setQuotaDraftMb(String(member.storageQuotaMb ?? 500)) }}
                              >
                                Quota: {member.storageQuotaMb ?? 500} MB
                              </button>
                            </div>

                            <div className="it-user-detail-group">
                              <span className="it-user-detail-label">Role</span>
                              {USER_ROLES.map((role) => (
                                <button
                                  key={role}
                                  type="button"
                                  className={member.role === role ? 'primary-button' : 'ghost-button'}
                                  onClick={() => handleUpdateUserRole(member, role)}
                                  disabled={adminLoading || member.role === role}
                                >
                                  {role}
                                </button>
                              ))}
                            </div>

                            <div className="it-user-detail-group it-user-detail-stack">
                              <span className="it-user-detail-label">Identity</span>
                              <div className="it-verify-block">
                                <p className="muted it-verify-hint">
                                  Confirm the caller can state these details before you reset anything.
                                </p>
                                <button type="button" className="ghost-button" onClick={() => loadVerification(member)} disabled={verification.loading && verification.userId === member.id}>
                                  {verification.loading && verification.userId === member.id ? 'Loading…' : 'Show verification details'}
                                </button>

                                {verification.userId === member.id && verification.error && (
                                  <p className="auth-message auth-error">{verification.error}</p>
                                )}

                                {verification.userId === member.id && verification.summary && (
                                  <dl className="it-verify-facts">
                                    <div><dt>Signed up</dt><dd>{formatDateTime(verification.summary.signedUpAt)}</dd></div>
                                    <div><dt>Last sign-in</dt><dd>{formatDateTime(verification.summary.lastSignInAt)}</dd></div>
                                    <div><dt>Email confirmed</dt><dd>{verification.summary.emailConfirmedAt ? formatDateTime(verification.summary.emailConfirmedAt) : 'Not confirmed'}</dd></div>
                                    <div><dt>Company</dt><dd>{verification.summary.company || 'None on file'}</dd></div>
                                    <div><dt>Support tickets</dt><dd>{verification.summary.ticketCount}</dd></div>
                                    {verification.summary.recentTickets?.length > 0 && (
                                      <div>
                                        <dt>Recent tickets</dt>
                                        <dd>
                                          {verification.summary.recentTickets.map((ticket) => (
                                            <span key={ticket.id} className="it-verify-ticket">
                                              {ticket.category} • {ticket.status} • {formatDateTime(ticket.created_at)}
                                            </span>
                                          ))}
                                        </dd>
                                      </div>
                                    )}
                                  </dl>
                                )}
                              </div>
                            </div>

                            <div className="it-user-detail-group it-user-detail-stack">
                              <span className="it-user-detail-label">Details</span>
                              <div className="it-verify-block">
                                <div className="it-profile-fields">
                                  <label>
                                    Full name
                                    <input
                                      type="text"
                                      value={profileDraft.fullName}
                                      onChange={(e) => setProfileDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                                    />
                                  </label>
                                  <label>
                                    Company
                                    <input
                                      type="text"
                                      value={profileDraft.company}
                                      onChange={(e) => setProfileDraft((prev) => ({ ...prev, company: e.target.value }))}
                                    />
                                  </label>
                                </div>
                                <button type="button" className="ghost-button" onClick={() => saveProfileDraft(member)} disabled={profileDraft.saving}>
                                  {profileDraft.saving ? 'Saving…' : 'Save details'}
                                </button>
                                {profileDraft.error && <p className="auth-message auth-error">{profileDraft.error}</p>}
                              </div>
                            </div>

                            <div className="it-user-detail-group it-user-detail-stack">
                              <span className="it-user-detail-label">Password</span>
                              <div className="it-verify-block">
                                <p className="muted it-verify-hint">
                                  Generates a single-use link the user opens to set their own password. You never see or choose it.
                                </p>
                                <button type="button" className="ghost-button" onClick={() => generateRecoveryLink(member)} disabled={recoveryLink.loading && recoveryLink.userId === member.id}>
                                  {recoveryLink.loading && recoveryLink.userId === member.id ? 'Generating…' : 'Generate password reset link'}
                                </button>

                                {recoveryLink.userId === member.id && recoveryLink.error && (
                                  <p className="auth-message auth-error">{recoveryLink.error}</p>
                                )}

                                {recoveryLink.userId === member.id && recoveryLink.url && (
                                  <div className="it-recovery-link">
                                    <p className="muted">Send this to the verified user. It expires in 1 hour and works once.</p>
                                    <textarea readOnly rows={3} value={recoveryLink.url} onFocus={(e) => e.target.select()} />
                                    <button type="button" className="ghost-button" onClick={() => navigator.clipboard?.writeText(recoveryLink.url)}>
                                      Copy link
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {userPageCount > 1 && (
                <div className="it-pagination">
                  <button type="button" className="ghost-button" onClick={() => setUserPage(safeUserPage - 1)} disabled={safeUserPage <= 1}>
                    Previous
                  </button>
                  <span className="muted">Page {safeUserPage} of {userPageCount}</span>
                  <button type="button" className="ghost-button" onClick={() => setUserPage(safeUserPage + 1)} disabled={safeUserPage >= userPageCount}>
                    Next
                  </button>
                </div>
              )}
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

        {itTab === 'integrations' && (
          <div>
            <Section title="Social publishing readiness">
              <p className="muted">Platform-level setup only. Customer handles, pages, tokens, and post content are never shown here.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleRefreshSocialPlatformReadiness}
                  disabled={socialPlatformReadinessLoading}
                >
                  {socialPlatformReadinessLoading ? 'Checking...' : 'Refresh setup status'}
                </button>
              </div>
              {socialPlatformReadinessError && <span className="field-error">{socialPlatformReadinessError}</span>}
              {socialPlatformReadiness.length === 0 && !socialPlatformReadinessLoading && !socialPlatformReadinessError && (
                <p className="muted">Select refresh to check the live provider configuration.</p>
              )}
              {socialPlatformReadiness.map((platform) => {
                const status = platform.oauthImplemented
                  ? platform.oauthConfigured ? 'configured' : 'needs setup'
                  : 'not deployed'
                return (
                  <div key={platform.platform} className="it-row">
                    <div>
                      <p>{platform.platform}</p>
                      <span>{platform.publishing}</span>
                    </div>
                    <StatusBadge value={status} />
                  </div>
                )
              })}
            </Section>
          </div>
        )}

        {itTab === 'controls' && (
          <div>
            <Section title="Landing page announcement">
              <p className="muted">Publish a highlighted notice that appears at the top of the public landing page before sign-in.</p>
              <textarea
                rows="5"
                value={announcementDraft}
                onChange={(event) => setAnnouncementDraft(event.target.value)}
                style={{ width: '100%', resize: 'vertical', padding: '0.75rem', borderRadius: '0.8rem', border: '1px solid #dbeafe', font: 'inherit' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setLandingAnnouncement(announcementDraft.trim() || 'This application is currently in Beta Testing...')}
                >
                  Save announcement
                </button>
              </div>
            </Section>

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
