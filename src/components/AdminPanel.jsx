import { useEffect, useRef, useState } from 'react'
import { FinancePanel } from './FinancePanel'
import { TrademarkPanel } from './TrademarkPanel'
import { DeveloperAppsPanel } from './DeveloperAppsPanel'
import { BoardMemberFinancePanel } from './BoardMemberFinancePanel'
import { AiOperationsPanel } from './AiOperationsPanel'
import { PricingProfitabilityPanel } from './PricingProfitabilityPanel'
import { CompanyEmailPanel } from './CompanyEmailPanel'
import { AnalyticsPanel } from './AnalyticsPanel'
import { InternalForumPanel } from './InternalForumPanel'
import { ProjectBoardPanel } from './ProjectBoardPanel'
import { internalForumService } from '../services/internalForumService'
import { PLAN_ORDER, PLANS, SEAT_VOLUME_DISCOUNTS, getSeatQuote, getPlanCogsPerSeatYear, getPlanTierPrice, formatUsd, parseRequestedSeatsFromDetails, buildQuoteMessage, MINIMUM_HEALTHY_MARGIN_PCT } from '../data/seatPricing'

const USERS_PER_PAGE = 25
const TICKETS_PER_PAGE = 50
const USER_ROLES = ['admin', 'manager', 'it', 'accountant', 'user']
const USER_STATUSES = ['active', 'pending', 'deactivated', 'approved', 'denied']

const PLATFORM_TABS = [
  { id: 'company-email', label: '📧 Company Email & SMTP', hint: 'Manage outbound support email, Microsoft 365, and mail routing', permission: 'companyEmailEditAccess' },
  { id: 'licenses', label: '🔑 Licenses', hint: 'Manage company seat licenses', permission: 'licenseEditAccess' },
  { id: 'trademark', label: '⚖️ Trademark & Legal', hint: 'Trademark filings and legal documents', permission: 'trademarkEditAccess' },
  { id: 'developer-apps', label: '🔐 Developer Apps', hint: 'API keys and developer app configuration', permission: 'developerAppEditAccess' },
  { id: 'integrations', label: '🔌 Integrations', hint: 'Third-party and platform integrations', permission: 'integrationsEditAccess' },
  { id: 'ai-operations', label: '🤖 Echo AI operations', hint: 'AI provider routing, usage, and cost controls', permission: 'aiOperationsEditAccess' },
  { id: 'controls', label: '⚙️ Site Controls', hint: 'Feature flags and site-wide notices', permission: 'siteControlsEditAccess' },
]

const PLATFORM_ACCESS_CONTROLS = [
  { field: 'companyEmailEditAccess', action: 'set-company-email-edit-access', label: 'Company Email & SMTP', roles: ['it', 'manager'] },
  { field: 'licenseEditAccess', action: 'set-license-edit-access', label: 'Licenses', roles: ['it', 'manager', 'accountant'] },
  { field: 'trademarkEditAccess', action: 'set-trademark-edit-access', label: 'Trademark & Legal', roles: ['it', 'manager'] },
  { field: 'developerAppEditAccess', action: 'set-developer-app-edit-access', label: 'Developer Apps', roles: ['it'] },
  { field: 'integrationsEditAccess', action: 'set-integrations-edit-access', label: 'Integrations', roles: ['it', 'manager'] },
  { field: 'aiOperationsEditAccess', action: 'set-ai-operations-edit-access', label: 'Echo AI operations', roles: ['it', 'manager'] },
  { field: 'siteControlsEditAccess', action: 'set-site-controls-edit-access', label: 'Site Controls', roles: ['it', 'manager'] },
]

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

function NoticeEditor({ title, description, notice, onSave }) {
  const [draft, setDraft] = useState(notice)
  const [status, setStatus] = useState({ saving: false, message: '', error: '' })

  const save = async () => {
    setStatus({ saving: true, message: '', error: '' })
    try {
      const message = draft.message.trim()
      await onSave({ ...draft, message, enabled: draft.enabled && Boolean(message) })
      setStatus({ saving: false, message: 'Saved', error: '' })
    } catch (error) {
      setStatus({ saving: false, message: '', error: error.message })
    }
  }

  return (
    <Section title={title}>
      <p className="muted">{description}</p>
      <div className="notice-editor-toggles">
        <label>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
          />
          Display notice
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.scrolling}
            onChange={(event) => setDraft((current) => ({ ...current, scrolling: event.target.checked }))}
          />
          Scroll message
        </label>
      </div>
      <textarea
        rows="5"
        value={draft.message}
        onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
        placeholder="Leave empty to hide this notice."
        className="notice-editor-textarea"
      />
      <div className="notice-editor-actions">
        {status.error && <span className="field-error">{status.error}</span>}
        {status.message && <span className="muted">{status.message}</span>}
        <button type="button" className="primary-button" onClick={save} disabled={status.saving}>
          {status.saving ? 'Saving...' : 'Save notice'}
        </button>
      </div>
    </Section>
  )
}

export function AdminPanel({
  teamMembers,
  accessRequests,
  alerts, setAlerts,
  licenses, setLicenses,
  tickets, setTickets,
  purchaseHistory, setPurchaseHistory,
  featureFlags, setFeatureFlags,
  announcements, onSaveAnnouncement,
  billingLive,
  promoCodes, setPromoCodes,
  expenses, setExpenses,
  payroll, setPayroll,
  taxRecords, setTaxRecords,
  refunds, setRefunds,
  financialTasks, setFinancialTasks,
  quotaEditingUserId, setQuotaEditingUserId,
  quotaDraftMb, setQuotaDraftMb,
  handleQuotaUpdate, handleToggleUserAccess, handleUpdateUserRole, handleReviewAccessRequest,
  companySeatPackage, companySeats,
  handleCreateCompanySeatPackage, handleUpdateCompanySeatPackage, handleAssignCompanySeat, handleRevokeCompanySeat,
  handleProvisionCompanySeatsForCustomer,
  handleRespondToSupportTicket,
  handleUpdateSupportTicketStatus,
  handleUpdateSupportTicket,
  handleRefreshSupportTickets,
  socialPlatformReadiness, socialPlatformReadinessLoading, socialPlatformReadinessError, handleRefreshSocialPlatformReadiness,
  adminLoading, adminError,
  currentUser,
  onAdminUserAction,
}) {
  const [itTab, setItTab] = useState(() => currentUser?.role === 'admin' ? 'overview' : 'integrations')
  const [openTabGroup, setOpenTabGroup] = useState(null)
  const tabNavRef = useRef(null)
  const [ticketOpen, setTicketOpen] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [licenseNote, setLicenseNote] = useState({})
  const [quoteTicketId, setQuoteTicketId] = useState('')
  const [quoteCompanyName, setQuoteCompanyName] = useState('')
  const [quoteCompanyKey, setQuoteCompanyKey] = useState('')
  const [quoteManagerEmail, setQuoteManagerEmail] = useState('')
  const [quoteSeatCount, setQuoteSeatCount] = useState(10)
  const [quotePlanKey, setQuotePlanKey] = useState('standard')
  const [quotePriceOverride, setQuotePriceOverride] = useState('')
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [quoteMessage, setQuoteMessage] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const [userStatusFilter, setUserStatusFilter] = useState('all')
  const [userSort, setUserSort] = useState('name-asc')
  const [userPage, setUserPage] = useState(1)
  const [expandedUserId, setExpandedUserId] = useState(null)
  const [verification, setVerification] = useState({ userId: null, summary: null, loading: false, error: '' })
  const [recoveryLink, setRecoveryLink] = useState({ userId: null, url: '', error: '', loading: false })
  const [temporaryPassword, setTemporaryPassword] = useState({ userId: null, value: '', saving: false, message: '', error: '' })
  const [profileDraft, setProfileDraft] = useState({ fullName: '', company: '', saving: false, error: '' })
  const [newUserDraft, setNewUserDraft] = useState({ fullName: '', email: '', company: '', role: 'it', profitSharePercent: '' })
  const [newUserStatus, setNewUserStatus] = useState({ saving: false, message: '', error: '' })
  const [profitShareDraft, setProfitShareDraft] = useState({ userId: '', value: '', saving: false, error: '' })
  const [betaAiDraft, setBetaAiDraft] = useState({ userId: '', isBetaTester: false, enabled: false, note: '', saving: false, error: '' })
  const [forumUnreadCount, setForumUnreadCount] = useState(0)

  const openUserDetail = (member) => {
    const nextId = expandedUserId === member.id ? null : member.id
    setExpandedUserId(nextId)
    setVerification({ userId: null, summary: null, loading: false, error: '' })
    setRecoveryLink({ userId: null, url: '', error: '', loading: false })
    setTemporaryPassword({ userId: nextId, value: '', saving: false, message: '', error: '' })
    setProfileDraft({ fullName: member.fullName || '', company: member.company || '', saving: false, error: '' })
    setProfitShareDraft({ userId: member.id, value: String(member.profitSharePercent || ''), saving: false, error: '' })
    setBetaAiDraft({ userId: member.id, isBetaTester: member.isBetaTester === true, enabled: member.aiEnabled !== false, note: member.aiAccessNote || '', saving: false, error: '' })
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

  const setUserTemporaryPassword = async (member) => {
    const value = temporaryPassword.userId === member.id ? temporaryPassword.value : ''
    if (value.length < 12) {
      setTemporaryPassword((current) => ({ ...current, error: 'Use at least 12 characters.', message: '' }))
      return
    }
    setTemporaryPassword((current) => ({ ...current, saving: true, error: '', message: '' }))
    try {
      await onAdminUserAction({ action: 'set-temporary-password', userId: member.id, email: member.email, temporaryPassword: value })
      setTemporaryPassword({ userId: member.id, value: '', saving: false, message: 'Temporary password set. The user must replace it immediately after signing in.', error: '' })
    } catch (error) {
      setTemporaryPassword((current) => ({ ...current, saving: false, error: error.message, message: '' }))
    }
  }

  const generateTemporaryPassword = (member) => {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    const generated = `${Array.from(bytes, (byte) => characters[byte % characters.length]).join('')}A7!`
    setTemporaryPassword({ userId: member.id, value: generated, saving: false, message: '', error: '' })
  }

  const saveProfileDraft = async (member) => {
    setProfileDraft((prev) => ({ ...prev, saving: true, error: '' }))
    try {
      await onAdminUserAction({
        action: 'update-profile',
        userId: member.id,
        email: member.email,
        fullName: profileDraft.fullName,
        company: profileDraft.company,
      })
      setProfileDraft((prev) => ({ ...prev, saving: false, error: '' }))
    } catch (error) {
      setProfileDraft((prev) => ({ ...prev, saving: false, error: error.message }))
    }
  }

  const createUser = async (event) => {
    event.preventDefault()
    setNewUserStatus({ saving: true, message: '', error: '', recoveryLink: '' })
    try {
      const response = await onAdminUserAction({ action: 'create-user', ...newUserDraft })
      const recoveryLink = response?.recoveryLink || ''
      const email = newUserDraft.email
      setNewUserDraft({ fullName: '', email: '', company: '', role: 'it', profitSharePercent: '' })
      setNewUserStatus({
        saving: false,
        message: `Account created for ${email}. An automated invite was sent. You can also copy the direct setup link below to give to them immediately:`,
        recoveryLink,
        error: '',
      })
    } catch (error) {
      const message = error.message?.includes('userId')
        ? 'The live admin service is out of date. Deploy the updated admin-user-actions function, then try again. A new technician does not need a user ID.'
        : error.message
      setNewUserStatus({ saving: false, message: '', error: message, recoveryLink: '' })
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
  const [ticketPage, setTicketPage] = useState(1)
  const [ticketRefresh, setTicketRefresh] = useState({ loading: false, error: '' })
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
  const canManageAiAccess = ['admin', 'manager', 'it'].includes(currentUser?.role)
  const forumTabLabel = `💬 Company Forum${forumUnreadCount > 0 ? ` (${forumUnreadCount})` : ''}`
  const visiblePlatformTabs = isFullAdmin
    ? PLATFORM_TABS
    : PLATFORM_TABS.filter((tab) => currentUser?.[tab.permission] === true)
  const TAB_GROUPS = isFullAdmin ? [
    {
      group: 'Support',
      tabs: [
        { id: 'overview', label: '📊 Overview', hint: 'Snapshot of open tickets, plan mix, and system health' },
        { id: 'analytics', label: '📈 Analytics', hint: 'User retention, tool usage, navigation, and churn signals' },
        { id: 'forum', label: forumTabLabel, hint: 'Training documents, company updates, and staff chat' },
        { id: 'projects', label: '🗂️ Project Board', hint: 'Internal projects, tasks, owners, and completion review' },
        { id: 'tickets', label: `🎫 Tickets${openTickets > 0 ? ` (${openTickets})` : ''}`, hint: 'Respond to and manage customer support tickets' },
      ],
    },
    {
      group: 'People',
      tabs: [
        { id: 'employees', label: '🧑‍💼 Employees', hint: 'Manage staff accounts, roles, and access' },
        { id: 'users', label: '👥 Customer users', hint: 'View and manage customer accounts' },
        { id: 'storage', label: '💾 Storage', hint: 'Review and adjust per-user storage quotas' },
      ],
    },
    {
      group: 'Finance',
      tabs: [
        { id: 'billing', label: '💳 Billing', hint: 'Subscriptions, invoices, and payment issues' },
        { id: 'finance', label: '💹 Finance', hint: 'Revenue, payouts, and financial reporting' },
        { id: 'profitability', label: '📈 Pricing & Profit Model', hint: 'Plan pricing, margins, and cost projections' },
        ...(currentUser?.isBoardMember ? [{ id: 'board-summary', label: '📈 My Board Summary', hint: 'Your board member payout summary' }] : []),
      ],
    },
    {
      group: 'Platform',
      tabs: visiblePlatformTabs,
    },
  ] : [
    {
      group: 'Support',
      tabs: [
        { id: 'overview', label: '📊 Service overview', hint: 'Snapshot of open tickets and account health' },
        { id: 'analytics', label: '📈 Analytics', hint: 'User retention, tool usage, navigation, and churn signals' },
        { id: 'forum', label: forumTabLabel, hint: 'Training documents, company updates, and staff chat' },
        { id: 'projects', label: '🗂️ Project Board', hint: 'Internal projects, tasks, owners, and completion review' },
        { id: 'tickets', label: `🎫 Tickets${openTickets > 0 ? ` (${openTickets})` : ''}`, hint: 'Respond to and manage customer support tickets' },
      ],
    },
    {
      group: 'Finance',
      tabs: [
        { id: 'profitability', label: '📈 Pricing & Profit Model', hint: 'Plan pricing, margins, and cost projections' },
      ],
    },
    {
      group: 'People',
      tabs: [
        { id: 'users', label: '👥 User directory', hint: 'View customer accounts' },
        { id: 'storage', label: '💾 Storage', hint: 'Review per-user storage quotas' },
      ],
    },
    {
      group: 'Platform',
      tabs: visiblePlatformTabs,
    },
  ].filter((section) => section.tabs.length > 0)
  const activeTabAllowed = TAB_GROUPS.some((section) => section.tabs.some((tab) => tab.id === itTab))
  const fallbackTabId = TAB_GROUPS[0]?.tabs[0]?.id || 'overview'

  useEffect(() => {
    if (activeTabAllowed) return
    setItTab(fallbackTabId)
    setOpenTabGroup(null)
  }, [activeTabAllowed, fallbackTabId])

  const employeeRoles = ['admin', 'manager', 'it', 'accountant', 'board_member']
  const filteredDirectoryMembers = itTab === 'employees'
    ? teamMembers.filter((member) => employeeRoles.includes(member.role))
    : teamMembers.filter((member) => !employeeRoles.includes(member.role))
  const filteredUsers = filteredDirectoryMembers.filter((member) => {
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
  const myOpenTickets = tickets.filter((ticket) => ticket.assigneeId === currentUser?.id && isTicketActionable(ticket.status)).length
  const newTickets = tickets.filter((ticket) => ticket.status === 'new').length
  const filteredTickets = tickets.filter((ticket) => {
    const isHistoryTicket = ticket.status === 'closed'
    if (ticketView === 'active' && isHistoryTicket) return false
    if (ticketView === 'new' && ticket.status !== 'new') return false
    if (ticketView === 'mine' && (ticket.assigneeId !== currentUser?.id || isHistoryTicket)) return false
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

  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 }
  const sortedTickets = [...filteredTickets].sort((left, right) =>
    (priorityRank[left.priority] ?? 4) - (priorityRank[right.priority] ?? 4)
      || new Date(right.createdAt) - new Date(left.createdAt),
  )
  const ticketPageCount = Math.max(1, Math.ceil(sortedTickets.length / TICKETS_PER_PAGE))
  const safeTicketPage = Math.min(ticketPage, ticketPageCount)
  const visibleTickets = sortedTickets.slice((safeTicketPage - 1) * TICKETS_PER_PAGE, safeTicketPage * TICKETS_PER_PAGE)

  const updateTicketField = async (ticketId, patch) => {
    try {
      const updated = await handleUpdateSupportTicket({ ticketId, ...patch })
      setTicketOpen((current) => current?.id === ticketId ? { ...current, ...updated } : current)
      setSeatError('')
      return updated
    } catch (error) {
      setSeatError(error.message)
      return null
    }
  }

  const takeOverTicket = async (ticket) => {
    if (!currentUser?.id) {
      setSeatError('Your staff profile could not be identified for ticket assignment.')
      return
    }
    const nextStatus = ['new', 'open'].includes(ticket.status) ? 'in_progress' : ticket.status
    const updated = await updateTicketField(ticket.id, { assigneeId: currentUser.id, status: nextStatus })
    if (updated) {
      setTicketView('mine')
      setTicketFilter((prev) => ({ ...prev, assignee: 'all', status: 'all' }))
    }
  }

  const refreshTickets = async () => {
    setTicketRefresh({ loading: true, error: '' })
    try {
      const refreshed = await handleRefreshSupportTickets()
      setTicketOpen((current) => current ? refreshed.find((ticket) => ticket.id === current.id) || null : null)
      setTicketRefresh({ loading: false, error: '' })
    } catch (error) {
      setTicketRefresh({ loading: false, error: error.message })
    }
  }

  useEffect(() => {
    if (itTab !== 'tickets') return undefined
    const intervalId = window.setInterval(() => {
      handleRefreshSupportTickets().catch(() => {})
    }, 30000)
    return () => window.clearInterval(intervalId)
  }, [itTab, handleRefreshSupportTickets])

  useEffect(() => {
    if (!currentUser?.id) return undefined
    const refreshUnread = () => {
      internalForumService.getUnreadMessageCount(currentUser.id)
        .then(setForumUnreadCount)
        .catch(() => {})
    }
    refreshUnread()
    const intervalId = window.setInterval(refreshUnread, 30000)
    return () => window.clearInterval(intervalId)
  }, [currentUser?.id])

  useEffect(() => {
    if (!openTabGroup) return undefined
    const handleClickOutside = (event) => {
      if (tabNavRef.current && !tabNavRef.current.contains(event.target)) {
        setOpenTabGroup(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openTabGroup])

  const activeGroup = TAB_GROUPS.find((section) => section.tabs.some((tab) => tab.id === itTab))
  const activeTabMeta = activeGroup?.tabs.find((tab) => tab.id === itTab)

  const companyPackageTickets = tickets.filter((t) => t.category === 'Company package' && isTicketActionable(t.status))
  const currentQuote = getSeatQuote(quotePlanKey, quoteSeatCount, quotePriceOverride)

  const loadTicketIntoQuote = (ticket) => {
    setQuoteTicketId(ticket.id)
    setQuoteCompanyName(ticket.companyName || '')
    setQuoteCompanyKey((ticket.companyName || '').trim().toLowerCase())
    setQuoteManagerEmail(ticket.requesterEmail || ticket.userEmail || '')
    const parsedSeats = parseRequestedSeatsFromDetails(ticket.details)
    setQuoteSeatCount(parsedSeats || 10)
    setQuotePlanKey('standard')
    setQuotePriceOverride('')
    setQuoteMessage('')
    setQuoteError('')
  }

  const sendQuoteToTicket = () => {
    const ticket = tickets.find((t) => t.id === quoteTicketId)
    const message = buildQuoteMessage({ companyName: quoteCompanyName, quote: currentQuote })
    if (ticket) {
      setTicketOpen(ticket)
      setItTab('tickets')
      setReplyDraft(message)
    } else {
      setQuoteMessage(message)
    }
  }

  const approveAndProvisionSeats = async () => {
    setQuoteError('')
    if (!quoteCompanyKey.trim()) {
      setQuoteError('Enter the customer\u2019s company key (matches their account company field).')
      return
    }
    setQuoteBusy(true)
    try {
      await handleProvisionCompanySeatsForCustomer({
        companyKey: quoteCompanyKey,
        seatLimit: currentQuote.count,
        pricePerSeatYear: currentQuote.pricePerSeatYear,
        notes: `Quoted from ticket ${quoteTicketId || 'manual'} at ${formatUsd(currentQuote.totalAnnualPrice)}/year on the ${currentQuote.plan.label} plan.`,
        managerEmail: quoteManagerEmail,
        planKey: quotePlanKey,
      })
      if (quoteTicketId) {
        await updateTicketStatus(quoteTicketId, 'resolved')
      }
      setQuoteMessage(`${currentQuote.plan.label} seats provisioned for ${quoteCompanyName || quoteCompanyKey}. ${quoteManagerEmail ? `${quoteManagerEmail} can now manage their own team.` : ''}`)
    } catch (provisionError) {
      setQuoteError(provisionError.message)
    } finally {
      setQuoteBusy(false)
    }
  }

  return (
    <div className="it-panel">
      <div className="it-header">
        <div>
          <h2>IT / Admin Backend</h2>
          <p className="it-header-sub">Restricted staff workspace • {currentUser?.role === 'admin' ? 'Super Admin' : 'Technician'}</p>
        </div>
      </div>

      <nav className="it-tabs" ref={tabNavRef}>
        {TAB_GROUPS.map((section) => {
          const isActiveGroup = section.tabs.some((tab) => tab.id === itTab)
          const isOpen = openTabGroup === section.group
          return (
            <div key={section.group} className="it-tab-dropdown">
              <button
                type="button"
                className={`it-tab-group-btn ${isActiveGroup ? 'active' : ''}`}
                onClick={() => setOpenTabGroup(isOpen ? null : section.group)}
                aria-expanded={isOpen}
              >
                {section.group}
                {isActiveGroup && <span className="it-tab-group-current">{activeTabMeta?.label}</span>}
                <span className="it-tab-group-caret" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className="it-tab-dropdown-menu">
                  {section.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`it-tab-btn ${itTab === tab.id ? 'active' : ''}`}
                      title={tab.hint}
                      onClick={() => { setItTab(tab.id); setOpenTabGroup(null) }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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

        {itTab === 'analytics' && <AnalyticsPanel tickets={tickets} />}

  {itTab === 'forum' && <InternalForumPanel currentUser={currentUser} teamMembers={teamMembers} onUnreadChange={setForumUnreadCount} />}

  {itTab === 'projects' && <ProjectBoardPanel currentUser={currentUser} teamMembers={teamMembers} />}

        {itTab === 'licenses' && (
          <div>
            <Section title="Seat package pricing & quotes">
              <p className="panel-note">
                Seat packages are sold by the year only, and every seat is provisioned at one plan level
                (Standard, Storage+, Storage Pro, Storage Max, or Creator Studio) \u2014 the same plans sold
                individually. Pick the plan the customer wants below, then quote by seat count.
              </p>

              <h4 className="section-label">1. Which plan are these seats getting?</h4>
              <div className="chip-row">
                {PLAN_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={quotePlanKey === key ? 'chip active' : 'chip'}
                    title={`${PLANS[key].storageGb} GB storage \u2022 ${PLANS[key].includedAiCredits.toLocaleString('en-US')} AI credits/month`}
                    onClick={() => setQuotePlanKey(key)}
                  >
                    {PLANS[key].label}
                  </button>
                ))}
              </div>
              <p className="muted">
                {currentQuote.plan.label}: {currentQuote.plan.storageGb} GB storage + {currentQuote.plan.includedAiCredits.toLocaleString('en-US')} AI credits/month per seat.
                List price {formatUsd(currentQuote.plan.annualPrice)}/seat/year.
              </p>

              <div className="seat-pricing-chart">
                {SEAT_VOLUME_DISCOUNTS.map((tier) => {
                  const { pricePerSeatYear } = getPlanTierPrice(quotePlanKey, tier.minSeats)
                  const cogs = getPlanCogsPerSeatYear(quotePlanKey)
                  const margin = pricePerSeatYear > 0 ? ((pricePerSeatYear - cogs) / pricePerSeatYear) * 100 : 0
                  return (
                    <div key={tier.id} className="seat-pricing-bar-row">
                      <span className="seat-pricing-bar-label">{tier.label}</span>
                      <div className="seat-pricing-bar-track">
                        <div className="seat-pricing-bar-cogs" style={{ width: `${Math.min(100, (cogs / pricePerSeatYear) * 100)}%` }} />
                      </div>
                      <span className="seat-pricing-bar-value">
                        {formatUsd(pricePerSeatYear)}/seat
                        <small className={margin < MINIMUM_HEALTHY_MARGIN_PCT ? 'seat-margin-warn' : 'seat-margin-ok'}> {margin.toFixed(0)}% margin</small>
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="muted">
                Shaded portion of each bar is our cost of goods per seat/year for the {currentQuote.plan.label} plan ({formatUsd(getPlanCogsPerSeatYear(quotePlanKey))}).
                Do not quote below {MINIMUM_HEALTHY_MARGIN_PCT}% margin without manager approval.
              </p>

              <h4 className="section-label">2. Prepare a quote</h4>
              {companyPackageTickets.length > 0 && (
                <div className="chip-row">
                  {companyPackageTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      className={quoteTicketId === ticket.id ? 'chip active' : 'chip'}
                      onClick={() => loadTicketIntoQuote(ticket)}
                    >
                      {ticket.companyName || ticket.userFullName} ({parseRequestedSeatsFromDetails(ticket.details) || '?'} seats)
                    </button>
                  ))}
                </div>
              )}
              <div className="fin-form-grid" style={{ marginTop: '0.6rem' }}>
                <label>Company name<input type="text" value={quoteCompanyName} onChange={(e) => setQuoteCompanyName(e.target.value)} placeholder="Acme Co" /></label>
                <label>Company key (must match their account)<input type="text" value={quoteCompanyKey} onChange={(e) => setQuoteCompanyKey(e.target.value)} placeholder="acme co" /></label>
                <label>Seat manager email<input type="email" value={quoteManagerEmail} onChange={(e) => setQuoteManagerEmail(e.target.value)} placeholder="owner@acme.com" /></label>
                <label>Seat count<input type="number" min="1" value={quoteSeatCount} onChange={(e) => setQuoteSeatCount(e.target.value)} /></label>
                <label>Price override ($/seat/year, optional)<input type="number" min="0" value={quotePriceOverride} onChange={(e) => setQuotePriceOverride(e.target.value)} placeholder={`Tier default: $${currentQuote.pricePerSeatYear}`} /></label>
              </div>

              <div className="asset-usage-banner" style={currentQuote.belowFloor ? { borderColor: '#ef4444' } : undefined}>
                <strong>{currentQuote.plan.label}: {currentQuote.count} seats × {formatUsd(currentQuote.pricePerSeatYear)}/year = {formatUsd(currentQuote.totalAnnualPrice)}/year</strong>
                <span>
                  Cost of goods: {formatUsd(currentQuote.totalCogs)}/year • Margin: {currentQuote.marginPct.toFixed(1)}%
                  {currentQuote.belowFloor ? ' — below floor, get manager approval before sending' : ''}
                </span>
              </div>

              <div className="action-row">
                <button type="button" className="ghost-button" onClick={sendQuoteToTicket}>Prepare quote reply</button>
                <button type="button" className="primary-button" disabled={quoteBusy} onClick={approveAndProvisionSeats}>
                  {quoteBusy ? 'Provisioning...' : 'Approve & push out seats'}
                </button>
              </div>
              {quoteMessage && <p className="auth-message">{quoteMessage}</p>}
              {quoteError && <p className="auth-message auth-error">{quoteError}</p>}
            </Section>

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
                  <div className="it-ticket-toolbar">
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
                      All active
                    </button>
                    <button
                      type="button"
                      className={ticketView === 'new' ? 'active' : ''}
                      onClick={() => {
                        setTicketView('new')
                        setTicketFilter((prev) => ({ ...prev, status: 'all' }))
                        setTicketOpen(null)
                      }}
                    >
                      New ({newTickets})
                    </button>
                    <button
                      type="button"
                      className={ticketView === 'mine' ? 'active' : ''}
                      onClick={() => {
                        setTicketView('mine')
                        setTicketFilter((prev) => ({ ...prev, assignee: 'all', status: 'all' }))
                        setTicketOpen(null)
                      }}
                    >
                      My queue ({myOpenTickets})
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
                    <button type="button" className="ghost-button" onClick={refreshTickets} disabled={ticketRefresh.loading}>
                      {ticketRefresh.loading ? 'Refreshing...' : 'Refresh tickets'}
                    </button>
                  </div>
                  {ticketRefresh.error && <p className="auth-message auth-error">{ticketRefresh.error}</p>}
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
                    { label: 'Mine', value: myOpenTickets },
                    { label: 'Critical', value: tickets.filter((t) => t.priority === 'critical').length },
                    { label: 'Waiting', value: tickets.filter((t) => t.status === 'waiting_customer').length },
                  ].map((stat) => (
                    <div key={stat.label} className="it-ticket-stat">
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>

                {visibleTickets.map((t) => (
                  <div
                    key={t.id}
                    className={`it-row it-ticket-row ${ticketOpen?.id === t.id ? 'active' : ''}`}
                    onClick={() => setTicketOpen(tickets.find((tk) => tk.id === t.id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>
                      <p style={{ fontWeight: 600 }}>{t.subject}</p>
                      <span>
                        {t.userFullName} • {t.category} • {t.queue || 'unassigned queue'} • {t.assignee || 'Unassigned'} • {new Date(t.createdAt).toLocaleDateString()}
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
                      {isTicketActionable(t.status) && t.assigneeId !== currentUser?.id && (
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                          onClick={(event) => {
                            event.stopPropagation()
                            takeOverTicket(t)
                          }}
                        >
                          Take over
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredTickets.length === 0 && <p className="muted">No tickets match this filter.</p>}
                {filteredTickets.length > TICKETS_PER_PAGE && (
                  <div className="it-ticket-pagination">
                    <span>Showing {(safeTicketPage - 1) * TICKETS_PER_PAGE + 1}-{Math.min(safeTicketPage * TICKETS_PER_PAGE, filteredTickets.length)} of {filteredTickets.length}</span>
                    <div>
                      <button type="button" className="ghost-button" disabled={safeTicketPage === 1} onClick={() => setTicketPage((page) => Math.max(1, page - 1))}>Previous</button>
                      <button type="button" className="ghost-button" disabled={safeTicketPage === ticketPageCount} onClick={() => setTicketPage((page) => Math.min(ticketPageCount, page + 1))}>Next</button>
                    </div>
                  </div>
                )}
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
                  {isTicketActionable(ticketOpen.status) && ticketOpen.assigneeId !== currentUser?.id && (
                    <button type="button" className="primary-button" onClick={() => takeOverTicket(ticketOpen)}>
                      Take over ticket
                    </button>
                  )}
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
                    value={ticketOpen.assigneeId || ''}
                    onChange={(event) => updateTicketField(ticketOpen.id, { assigneeId: event.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.filter((member) => ['admin', 'manager', 'it'].includes(member.role)).map((member) => (
                      <option key={member.id} value={member.id}>{member.fullName || member.email}</option>
                    ))}
                  </select>
                </div>

                <label className="it-ticket-tag-editor">
                  Tags
                  <input
                    value={(ticketOpen.tags || []).join(', ')}
                    onChange={(event) => setTicketOpen((current) => ({ ...current, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }))}
                    onBlur={() => updateTicketField(ticketOpen.id, { tags: ticketOpen.tags || [] })}
                    placeholder="billing, login, security"
                  />
                </label>

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

        {(itTab === 'users' || itTab === 'employees') && (
          <div>
            {isFullAdmin && itTab === 'employees' && (
              <Section title="Add staff account">
                <p className="muted">Invite staff directly without a subscription. They will set their password and MFA from the landing page.</p>
                <form className="auth-form" onSubmit={createUser}>
                  <label>Full name<input required value={newUserDraft.fullName} onChange={(event) => setNewUserDraft((current) => ({ ...current, fullName: event.target.value }))} /></label>
                  <label>Email<input required type="email" value={newUserDraft.email} onChange={(event) => setNewUserDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>Company<input required value={newUserDraft.company} onChange={(event) => setNewUserDraft((current) => ({ ...current, company: event.target.value }))} /></label>
                  <label>Role<select value={newUserDraft.role} onChange={(event) => setNewUserDraft((current) => ({ ...current, role: event.target.value }))}><option value="it">Technician</option><option value="accountant">Accounting</option><option value="board_member">Board Member</option><option value="manager">Manager</option><option value="user">Standard user</option></select></label>
                  {newUserDraft.role === 'board_member' && <label>Profit share percentage (1-50%)<input required type="number" min="1" max="50" step="0.01" value={newUserDraft.profitSharePercent || ''} onChange={(event) => setNewUserDraft((current) => ({ ...current, profitSharePercent: event.target.value }))} /></label>}
                  <div className="action-row"><button type="submit" className="primary-button" disabled={newUserStatus.saving}>{newUserStatus.saving ? 'Sending invitation...' : 'Create and invite user'}</button></div>
                  {newUserStatus.message && <p className="auth-message">{newUserStatus.message}</p>}
                  {newUserStatus.error && <p className="auth-message auth-error">{newUserStatus.error}</p>}
                  {newUserStatus.recoveryLink && (
                    <div className="it-recovery-link" style={{ marginTop: '0.75rem' }}>
                      <p className="muted">Direct setup link (expires in 1 hour):</p>
                      <textarea readOnly rows={2} value={newUserStatus.recoveryLink} onFocus={(e) => e.target.select()} />
                      <button type="button" className="ghost-button" onClick={() => navigator.clipboard?.writeText(newUserStatus.recoveryLink)}>
                        Copy setup link
                      </button>
                    </div>
                  )}
                </form>
              </Section>
            )}
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
                {sortedUsers.length === filteredDirectoryMembers.length
                  ? `${sortedUsers.length} user${sortedUsers.length === 1 ? '' : 's'}`
                  : `${sortedUsers.length} of ${filteredDirectoryMembers.length} users match`}
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
                        {member.role === 'admin' && member.id !== currentUser?.id ? (
                          <p className="muted">Administrator accounts cannot be modified here.</p>
                        ) : (
                          <>
                            {canManageAiAccess && member.id !== currentUser?.id && <div className="it-user-detail-group">
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
                            </div>}

                            {isFullAdmin && member.id !== currentUser?.id && <div className="it-user-detail-group">
                              <span className="it-user-detail-label">Beta AI access</span>
                              <label className="toggle-row">
                                <input type="checkbox" checked={betaAiDraft.userId === member.id ? betaAiDraft.isBetaTester : member.isBetaTester === true} onChange={(event) => setBetaAiDraft((current) => ({ ...current, userId: member.id, isBetaTester: event.target.checked }))} />
                                Beta tester account
                              </label>
                              <small className="muted">Beta accounts are free. Keep AI disabled until you are comfortable with their access.</small>
                              <label className="toggle-row">
                                <input type="checkbox" checked={betaAiDraft.userId === member.id ? betaAiDraft.enabled : member.aiEnabled !== false} onChange={(event) => setBetaAiDraft((current) => ({ ...current, userId: member.id, enabled: event.target.checked }))} />
                                Allow AI generation
                              </label>
                              <textarea rows="2" value={betaAiDraft.userId === member.id ? betaAiDraft.note : member.aiAccessNote || ''} onChange={(event) => setBetaAiDraft((current) => ({ ...current, userId: member.id, note: event.target.value }))} placeholder="Note shown when AI is disabled for this beta tester." />
                              <button type="button" className="primary-button" disabled={betaAiDraft.saving} onClick={async () => {
                                setBetaAiDraft((current) => ({ ...current, saving: true, error: '' }))
                                try {
                                  await onAdminUserAction({ action: 'set-beta-ai-access', userId: member.id, email: member.email, isBetaTester: betaAiDraft.isBetaTester, enabled: betaAiDraft.enabled, note: betaAiDraft.note })
                                  setBetaAiDraft((current) => ({ ...current, saving: false }))
                                } catch (error) {
                                  setBetaAiDraft((current) => ({ ...current, saving: false, error: error.message }))
                                }
                              }}>{betaAiDraft.saving ? 'Saving...' : 'Save beta AI access'}</button>
                              {betaAiDraft.error && <small className="field-error">{betaAiDraft.error}</small>}
                            </div>}

                            {isFullAdmin && member.id !== currentUser?.id && <div className="it-user-detail-group it-user-detail-stack">
                              <span className="it-user-detail-label">Platform category permissions</span>
                              <div className="chip-row">
                                {PLATFORM_ACCESS_CONTROLS.filter((control) => control.roles.includes(member.role)).map((control) => (
                                  <button
                                    key={control.field}
                                    type="button"
                                    className={member[control.field] ? 'primary-button' : 'ghost-button'}
                                    onClick={async () => {
                                      try {
                                        await onAdminUserAction({ action: control.action, userId: member.id, email: member.email, enabled: !member[control.field] })
                                      } catch (error) {
                                        setNewUserStatus({ saving: false, message: '', error: error.message })
                                      }
                                    }}
                                  >
                                    {member[control.field] ? `${control.label} granted` : `Grant ${control.label}`}
                                  </button>
                                ))}
                              </div>
                              <small className="muted">Grant only the Platform categories this staff member needs for their work. They must sign out and back in after a permission change.</small>
                            </div>}

                            {isFullAdmin && (member.isBoardMember || member.role === 'board_member' || member.id === currentUser?.id) && <div className="it-user-detail-group">
                              <span className="it-user-detail-label">Quarterly profit share</span>
                              <input
                                type="number"
                                min="1"
                                max="50"
                                step="0.01"
                                value={profitShareDraft.userId === member.id ? profitShareDraft.value : String(member.profitSharePercent || '')}
                                onChange={(event) => setProfitShareDraft({ userId: member.id, value: event.target.value, saving: false, error: '' })}
                              />
                              <button
                                type="button"
                                className="primary-button"
                                disabled={profitShareDraft.saving}
                                onClick={async () => {
                                  const value = Number(profitShareDraft.value)
                                  if (!Number.isFinite(value) || value < 1 || value > 50) {
                                    setProfitShareDraft((current) => ({ ...current, error: 'Enter a percentage from 1 to 50.' }))
                                    return
                                  }
                                  setProfitShareDraft((current) => ({ ...current, saving: true, error: '' }))
                                  try {
                                    await onAdminUserAction({ action: 'set-board-member-profit-share', userId: member.id, email: member.email, profitSharePercent: value })
                                    setProfitShareDraft((current) => ({ ...current, saving: false }))
                                  } catch (error) {
                                    setProfitShareDraft((current) => ({ ...current, saving: false, error: error.message }))
                                  }
                                }}
                              >
                                {profitShareDraft.saving ? 'Saving...' : 'Save percentage'}
                              </button>
                              {profitShareDraft.error && <small className="field-error">{profitShareDraft.error}</small>}
                            </div>}

                            {isFullAdmin && <div className="it-user-detail-group">
                              <span className="it-user-detail-label">Board Membership</span>
                              <button
                                type="button"
                                className={member.isBoardMember ? 'primary-button' : 'ghost-button'}
                                onClick={async () => {
                                  const enabled = !member.isBoardMember
                                  const share = Number(member.profitSharePercent || 1)
                                  try {
                                    await onAdminUserAction({ action: 'set-board-membership', userId: member.id, email: member.email, enabled, profitSharePercent: share })
                                  } catch (error) {
                                    setNewUserStatus({ saving: false, message: '', error: error.message })
                                  }
                                }}
                              >
                                {member.isBoardMember ? 'Board Member enabled' : 'Add Board Member role'}
                              </button>
                              <small className="muted">Board Membership can coexist with Admin and payroll. Set the percentage above after enabling.</small>
                            </div>}

                            {isFullAdmin && <div className="it-user-detail-group">
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
                            </div>}

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

                                {isFullAdmin && member.id !== currentUser?.id && (
                                  <div className="it-temp-password">
                                    <p className="muted it-verify-hint">Set a temporary password after verifying the user. They will be required to replace it before entering the app.</p>
                                    <label>
                                      Temporary password
                                      <input
                                        type="text"
                                        minLength={12}
                                        autoComplete="new-password"
                                        value={temporaryPassword.userId === member.id ? temporaryPassword.value : ''}
                                        onChange={(event) => setTemporaryPassword({ userId: member.id, value: event.target.value, saving: false, message: '', error: '' })}
                                        placeholder="At least 12 characters"
                                      />
                                    </label>
                                    <div className="action-row">
                                      <button type="button" className="ghost-button" onClick={() => generateTemporaryPassword(member)}>Generate</button>
                                      <button type="button" className="primary-button" disabled={temporaryPassword.saving} onClick={() => setUserTemporaryPassword(member)}>
                                        {temporaryPassword.saving ? 'Setting...' : 'Set temporary password'}
                                      </button>
                                    </div>
                                    {temporaryPassword.userId === member.id && temporaryPassword.error && <p className="auth-message auth-error">{temporaryPassword.error}</p>}
                                    {temporaryPassword.userId === member.id && temporaryPassword.message && <p className="auth-message">{temporaryPassword.message}</p>}
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

            {itTab === 'users' && <Section title="Access requests">
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
                        <button type="button" className="primary-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} disabled={adminLoading} onClick={() => handleReviewAccessRequest(req, 'approved')}>
                          Approve
                        </button>
                        <button type="button" className="ghost-button" style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }} disabled={adminLoading} onClick={() => handleReviewAccessRequest(req, 'denied')}>
                          Deny
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </Section>}

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
            boardMembers={teamMembers.filter((member) => member.role === 'board_member')}
            company={currentUser?.company}
            currentUser={currentUser}
          />
        )}

        {itTab === 'profitability' && <PricingProfitabilityPanel />}

        {itTab === 'board-summary' && currentUser?.isBoardMember && (
          <BoardMemberFinancePanel company={currentUser.company} />
        )}

        {itTab === 'trademark' && <TrademarkPanel currentUser={currentUser} />}

        {itTab === 'company-email' && (
          <CompanyEmailPanel
            currentUser={currentUser}
            teamMembers={teamMembers}
            onAdminUserAction={onAdminUserAction}
            companySeatPackage={companySeatPackage}
            companySeats={companySeats}
            handleCreateCompanySeatPackage={handleCreateCompanySeatPackage}
            handleUpdateCompanySeatPackage={handleUpdateCompanySeatPackage}
            handleAssignCompanySeat={handleAssignCompanySeat}
            handleRevokeCompanySeat={handleRevokeCompanySeat}
          />
        )}

        {itTab === 'developer-apps' && <DeveloperAppsPanel currentUser={currentUser} />}

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

        {itTab === 'ai-operations' && <AiOperationsPanel />}

        {itTab === 'controls' && (
          <div>
            <NoticeEditor
              key={`landing-${announcements.landing.updatedAt}`}
              title="Landing page note"
              description="Shown publicly above the landing page. An empty message is never displayed."
              notice={announcements.landing}
              onSave={onSaveAnnouncement}
            />

            <NoticeEditor
              key={`application-${announcements.application.updatedAt}`}
              title="Application note"
              description="Shown only inside the signed-in application for account holders."
              notice={announcements.application}
              onSave={onSaveAnnouncement}
            />

            {isFullAdmin && <Section title="Site feature flags">
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
            </Section>}

            {isFullAdmin && <Section title="Issue desk">
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
            </Section>}
          </div>
        )}
      </div>
    </div>
  )
}
