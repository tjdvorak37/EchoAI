import { useState, useEffect } from 'react'
import { authService } from '../services/authService'
import './CompanyEmailPanel.css'

export function CompanyEmailPanel({
  currentUser,
  teamMembers = [],
  onAdminUserAction,
  companySeatPackage,
  companySeats = [],
  handleCreateCompanySeatPackage,
  handleUpdateCompanySeatPackage,
  handleAssignCompanySeat,
  handleRevokeCompanySeat,
}) {
  const [activeSubTab, setActiveSubTab] = useState('credentials')
  const [recoveryLinks, setRecoveryLinks] = useState({})
  const [loadingLinks, setLoadingLinks] = useState({})
  const [copiedLink, setCopiedLink] = useState(null)
  const [linkErrors, setLinkErrors] = useState({})

  // Staff creation form state
  const [newStaff, setNewStaff] = useState({
    fullName: '',
    email: '',
    company: 'EchoAI',
    role: 'it',
    profitSharePercent: '',
  })
  const [staffStatus, setStaffStatus] = useState({
    saving: false,
    message: '',
    error: '',
    createdLink: '',
    createdEmail: '',
  })

  // Seat management state
  const [seatLimitDraft, setSeatLimitDraft] = useState('10')
  const [seatEmailDraft, setSeatEmailDraft] = useState('')
  const [seatError, setSeatError] = useState('')
  const [seatMessage, setSeatMessage] = useState('')

  // Support Ticket Email Notification & Routing State
  const [notifyConfig, setNotifyConfig] = useState({
    enabled: true,
    recipient_email: 'support@echoaipro.com',
    secondary_email: '',
    sender_name: 'EchoAI Support System',
    subject_prefix: '[EchoAI Support]',
    include_full_description: true,
    notify_on_landing_tickets: true,
    notify_on_app_tickets: true,
    notify_on_company_requests: true,
    webhook_url: '',
    webhook_enabled: false,
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_encryption: 'STARTTLS',
    smtp_user: 'support@echoaipro.com',
    smtp_password: '',
    resend_api_key: '',
    sendgrid_api_key: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasExistingPassword, setHasExistingPassword] = useState(false)
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifySaving, setNotifySaving] = useState(false)
  const [notifyStatus, setNotifyStatus] = useState({ message: '', error: '' })
  const [smtpStatus, setSmtpStatus] = useState({ saving: false, message: '', error: '' })
  const [inboundConfig, setInboundConfig] = useState({
    inboundEmail: 'support@echoaipro.com',
    inboundEnabled: false,
    inboundWebhookSecret: '',
    hasInboundWebhookSecret: false,
  })
  const [showInboundKey, setShowInboundKey] = useState(false)
  const [inboundStatus, setInboundStatus] = useState({ saving: false, message: '', error: '' })

  // Test Notification State
  const [testCategory, setTestCategory] = useState('Technical issue')
  const [testDetails, setTestDetails] = useState('Sample ticket description: Customer requesting assistance with login routing and password setup.')
  const [testStatus, setTestStatus] = useState({ running: false, message: '', error: '' })

  const isFullAdmin = currentUser?.role === 'admin'
  const hasGrantedAccess = currentUser?.companyEmailEditAccess === true
  const canEdit = isFullAdmin || hasGrantedAccess
  const staffRoles = ['admin', 'it', 'accountant']
  const staffMembers = teamMembers.filter((member) => staffRoles.includes(member.role))
  const assignedSeatsCount = companySeats.filter((seat) => seat.status !== 'revoked').length

  const loadNotificationConfig = async () => {
    setNotifyLoading(true)
    setNotifyStatus({ message: '', error: '' })
    try {
      const config = await authService.getTicketNotificationConfig()
      if (config) {
        setNotifyConfig((prev) => ({
          ...prev,
          ...config,
          recipient_email: config.recipient_email || 'support@echoaipro.com',
          smtp_host: config.smtp_host || 'smtp.office365.com',
          smtp_port: config.smtp_port || 587,
          smtp_encryption: config.smtp_encryption || 'STARTTLS',
          smtp_user: config.smtp_user || 'support@echoaipro.com',
          smtp_password: config.smtp_password || '',
          resend_api_key: config.resend_api_key || '',
          sendgrid_api_key: config.sendgrid_api_key || '',
        }))
        setHasExistingPassword(Boolean(config.smtp_password))
      }
    } catch (err) {
      setNotifyStatus({ message: '', error: err.message })
    } finally {
      setNotifyLoading(false)
    }
  }

  useEffect(() => {
    loadNotificationConfig()
    authService.getTicketInboundConfig()
      .then((config) => setInboundConfig((current) => ({ ...current, ...config })))
      .catch((error) => setInboundStatus({ saving: false, message: '', error: error.message }))
  }, [])

  const handleSaveInboundConfig = async (event) => {
    event.preventDefault()
    setInboundStatus({ saving: true, message: '', error: '' })
    try {
      const saved = await authService.updateTicketInboundConfig(inboundConfig)
      setInboundConfig((current) => ({ ...current, ...saved, inboundWebhookSecret: '' }))
      setInboundStatus({ saving: false, message: 'Inbound mailbox settings saved.', error: '' })
    } catch (error) {
      setInboundStatus({ saving: false, message: '', error: error.message })
    }
  }

  const handleSaveNotifyConfig = async (e) => {
    if (e) e.preventDefault()
    setNotifySaving(true)
    setNotifyStatus({ message: '', error: '' })
    try {
      const saved = await authService.updateTicketNotificationConfig({
        enabled: notifyConfig.enabled,
        recipientEmail: notifyConfig.recipient_email,
        secondaryEmail: notifyConfig.secondary_email,
        senderName: notifyConfig.sender_name,
        subjectPrefix: notifyConfig.subject_prefix,
        includeFullDescription: notifyConfig.include_full_description,
        notifyOnLandingTickets: notifyConfig.notify_on_landing_tickets,
        notifyOnAppTickets: notifyConfig.notify_on_app_tickets,
        notifyOnCompanyRequests: notifyConfig.notify_on_company_requests,
        webhookUrl: notifyConfig.webhook_url,
        webhookEnabled: notifyConfig.webhook_enabled,
        smtpHost: notifyConfig.smtp_host,
        smtpPort: notifyConfig.smtp_port,
        smtpEncryption: notifyConfig.smtp_encryption,
        smtpUser: notifyConfig.smtp_user,
        smtpPassword: notifyConfig.smtp_password,
        resendApiKey: notifyConfig.resend_api_key,
        sendgridApiKey: notifyConfig.sendgrid_api_key,
      })
      if (saved) {
        setNotifyConfig((prev) => ({ ...prev, ...saved }))
        if (saved.smtp_password) setHasExistingPassword(true)
      }
      setNotifyStatus({ message: 'Ticket email notification parameters saved successfully.', error: '' })
      setTimeout(() => setNotifyStatus((prev) => ({ ...prev, message: '' })), 4000)
    } catch (err) {
      setNotifyStatus({ message: '', error: err.message })
    } finally {
      setNotifySaving(false)
    }
  }

  const handleSaveSmtpCredentials = async (e) => {
    if (e) e.preventDefault()
    setSmtpStatus({ saving: true, message: '', error: '' })
    try {
      const saved = await authService.updateTicketNotificationConfig({
        enabled: notifyConfig.enabled,
        recipientEmail: notifyConfig.recipient_email,
        secondaryEmail: notifyConfig.secondary_email,
        senderName: notifyConfig.sender_name,
        subjectPrefix: notifyConfig.subject_prefix,
        includeFullDescription: notifyConfig.include_full_description,
        notifyOnLandingTickets: notifyConfig.notify_on_landing_tickets,
        notifyOnAppTickets: notifyConfig.notify_on_app_tickets,
        notifyOnCompanyRequests: notifyConfig.notify_on_company_requests,
        webhookUrl: notifyConfig.webhook_url,
        webhookEnabled: notifyConfig.webhook_enabled,
        smtpHost: notifyConfig.smtp_host,
        smtpPort: notifyConfig.smtp_port,
        smtpEncryption: notifyConfig.smtp_encryption,
        smtpUser: notifyConfig.smtp_user,
        smtpPassword: notifyConfig.smtp_password,
        resendApiKey: notifyConfig.resend_api_key,
        sendgridApiKey: notifyConfig.sendgrid_api_key,
      })
      if (saved) {
        setNotifyConfig((prev) => ({ ...prev, ...saved }))
        if (notifyConfig.smtp_password || saved.smtp_password) setHasExistingPassword(true)
      }
      setSmtpStatus({ saving: false, message: 'Email password & SMTP credentials saved successfully.', error: '' })
      setTimeout(() => setSmtpStatus((prev) => ({ ...prev, message: '' })), 4000)
    } catch (err) {
      setSmtpStatus({ saving: false, message: '', error: err.message })
    }
  }

  const handleSendTestNotification = async () => {
    setTestStatus({ running: true, message: '', error: '' })
    try {
      const response = await authService.testTicketNotification({
        category: testCategory,
        details: testDetails,
      })
      setTestStatus({
        running: false,
        message: response?.message || 'Test notification dispatched successfully!',
        error: '',
      })
    } catch (err) {
      setTestStatus({
        running: false,
        message: '',
        error: err.message || 'Failed to send test notification.',
      })
    }
  }

  const handleGenerateLink = async (member) => {
    setLoadingLinks((prev) => ({ ...prev, [member.id]: true }))
    setLinkErrors((prev) => ({ ...prev, [member.id]: '' }))
    try {
      const response = await onAdminUserAction({
        action: 'recovery-link',
        userId: member.id,
        email: member.email,
      })
      if (response?.recoveryLink) {
        setRecoveryLinks((prev) => ({ ...prev, [member.id]: response.recoveryLink }))
      } else {
        throw new Error('No link was generated by the auth service.')
      }
    } catch (err) {
      setLinkErrors((prev) => ({ ...prev, [member.id]: err.message }))
    } finally {
      setLoadingLinks((prev) => ({ ...prev, [member.id]: false }))
    }
  }

  const handleCopyLink = async (key, text) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
      }
      setCopiedLink(key)
      setTimeout(() => setCopiedLink(null), 3000)
    } catch {
      // Fallback
    }
  }

  const handleCreateStaff = async (e) => {
    e.preventDefault()
    setStaffStatus({ saving: true, message: '', error: '', createdLink: '', createdEmail: '' })
    try {
      const response = await onAdminUserAction({
        action: 'create-user',
        ...newStaff,
      })
      const link = response?.recoveryLink || ''
      const email = newStaff.email
      setStaffStatus({
        saving: false,
        message: `Account created for ${email}. An automated invite was sent. You can also copy the direct setup link below:`,
        error: '',
        createdLink: link,
        createdEmail: email,
      })
      setNewStaff({
        fullName: '',
        email: '',
        company: 'EchoAI',
        role: 'it',
        profitSharePercent: '',
      })
    } catch (err) {
      setStaffStatus({
        saving: false,
        message: '',
        error: err.message,
        createdLink: '',
        createdEmail: '',
      })
    }
  }

  const handleAssignSeat = async (e) => {
    e.preventDefault()
    setSeatError('')
    setSeatMessage('')
    try {
      if (handleAssignCompanySeat) {
        await handleAssignCompanySeat(seatEmailDraft)
        setSeatMessage(`Seat assigned to ${seatEmailDraft}`)
        setSeatEmailDraft('')
      }
    } catch (err) {
      setSeatError(err.message)
    }
  }

  const handleCreatePackage = async (e) => {
    e.preventDefault()
    setSeatError('')
    setSeatMessage('')
    try {
      if (handleCreateCompanySeatPackage) {
        await handleCreateCompanySeatPackage(seatLimitDraft)
        setSeatMessage('Company seat package created.')
      }
    } catch (err) {
      setSeatError(err.message)
    }
  }

  const handleUpdatePackage = async (e) => {
    e.preventDefault()
    setSeatError('')
    setSeatMessage('')
    try {
      if (handleUpdateCompanySeatPackage) {
        await handleUpdateCompanySeatPackage(seatLimitDraft)
        setSeatMessage('Company seat package updated.')
      }
    } catch (err) {
      setSeatError(err.message)
    }
  }

  const handleRevokeSeat = async (seatId) => {
    setSeatError('')
    setSeatMessage('')
    try {
      if (handleRevokeCompanySeat) {
        await handleRevokeCompanySeat(seatId)
        setSeatMessage('Seat revoked.')
      }
    } catch (err) {
      setSeatError(err.message)
    }
  }

  return (
    <div className="company-email-panel">
      <div className="company-email-hero">
        <div>
          <div className="company-email-hero-title">
            <span>📧</span> Company Email &amp; Outbound Mail Routing
          </div>
          <p className="company-email-hero-subtitle">
            Manage your Microsoft 365 Essential mailboxes, email passwords, outbound SMTP credentials, and ticket notifications to <strong>support@echoaipro.com</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
          <span className={`company-email-badge ${isFullAdmin ? 'info' : hasGrantedAccess ? 'success' : 'warning'}`}>
            {isFullAdmin ? '🛡️ Super Admin' : hasGrantedAccess ? '✓ Email Editing Granted' : '🔒 View Only (Locked)'}
          </span>
          <span className={`company-email-badge ${hasExistingPassword || notifyConfig.smtp_password ? 'success' : 'warning'}`}>
            {hasExistingPassword || notifyConfig.smtp_password ? '● Password Configured' : '○ Password Needed'}
          </span>
          <span className={`company-email-badge ${notifyConfig.enabled ? 'info' : 'warning'}`}>
            {notifyConfig.enabled ? `● Forwarding: ${notifyConfig.recipient_email}` : '○ Forwarding: Off'}
          </span>
        </div>
      </div>

      <nav className="company-email-tabs" role="tablist">
        <button
          type="button"
          className={`company-email-tab-btn ${activeSubTab === 'credentials' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('credentials')}
        >
          🔐 Mailbox &amp; Email Password
        </button>
        <button
          type="button"
          className={`company-email-tab-btn ${activeSubTab === 'ticket-notifications' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('ticket-notifications')}
        >
          🔔 Ticket Notifications &amp; Alerts
        </button>
        <button
          type="button"
          className={`company-email-tab-btn ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
        >
          📮 Outbound &amp; Mailboxes
        </button>
        <button
          type="button"
          className={`company-email-tab-btn ${activeSubTab === 'smtp-guide' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('smtp-guide')}
        >
          ⚙️ Microsoft 365 Setup Guide
        </button>
        <button
          type="button"
          className={`company-email-tab-btn ${activeSubTab === 'staff-setup' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('staff-setup')}
        >
          🧑‍💼 Technician &amp; Staff Setup Links
        </button>
        <button
          type="button"
          className={`company-email-tab-btn ${activeSubTab === 'seats' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('seats')}
        >
          👥 Company Email Seats
        </button>
      </nav>

      {/* 1. Mailbox & Email Password Tab */}
      {activeSubTab === 'credentials' && (
        <div className="it-section">
          <h3 className="it-section-title">🔐 Mailbox Password &amp; Outbound SMTP Settings</h3>
          <p className="muted">
            Enter your Microsoft 365 Essential mailbox password or App Password below. This allows all outbound support emails, password resets, and ticket replies to be sent directly through <strong>{notifyConfig.smtp_user || 'support@echoaipro.com'}</strong>.
          </p>

          {!canEdit && (
            <div className="company-email-locked-banner">
              <strong>🔒 Editing Access Locked</strong>
              <p>Modifying Microsoft 365 passwords, SMTP server routing, and API credentials requires Super Admin authorization. You can view the current settings, but saving changes is restricted.</p>
            </div>
          )}

          <div className="company-email-guide-box" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.35rem 0', color: '#1e40af', fontSize: '0.95rem' }}>💡 Using Microsoft 365 with 2FA / MFA enabled?</h4>
            <p className="muted" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.55 }}>
              If Two-Factor Authentication (2FA) is turned on for <code>support@echoaipro.com</code>, Microsoft will block normal password sign-ins over SMTP. You have two easy options:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem', marginTop: '0.65rem' }}>
              <div style={{ background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>Option 1: Microsoft 365 App Password (Recommended)</strong>
                <ol style={{ margin: '0.4rem 0 0 1.1rem', padding: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                  <li>Go to <a href="https://mysignins.microsoft.com/security-info" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>Microsoft Security Info</a>.</li>
                  <li>Click <strong>Add sign-in method</strong> → select <strong>App password</strong>.</li>
                  <li>Name it <em>EchoAI Support</em> and copy the generated 16-character code.</li>
                  <li>Paste that code into the <strong>Email Password</strong> field below.</li>
                </ol>
              </div>
              <div style={{ background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>Option 2: Free Resend API Key (Instant Delivery)</strong>
                <ol style={{ margin: '0.4rem 0 0 1.1rem', padding: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                  <li>Sign up for free at <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>resend.com</a> (3,000 free emails/mo).</li>
                  <li>Click <strong>API Keys</strong> → <strong>Create API Key</strong>.</li>
                  <li>Copy your key (starts with <code>re_...</code>).</li>
                  <li>Paste it into the <strong>Resend API Key</strong> field below.</li>
                </ol>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveSmtpCredentials}>
            <div className="company-email-form-grid">
              <label>
                Email Address / Username
                <input
                  type="email"
                  required
                  disabled={!canEdit}
                  value={notifyConfig.smtp_user}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, smtp_user: e.target.value }))}
                  placeholder="support@echoaipro.com"
                />
                <small className="muted">Your Microsoft 365 Essential support mailbox.</small>
              </label>

              <label>
                Email Password / App Password
                <div className="company-email-password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    disabled={!canEdit}
                    value={notifyConfig.smtp_password}
                    onChange={(e) => setNotifyConfig((prev) => ({ ...prev, smtp_password: e.target.value }))}
                    placeholder={hasExistingPassword ? '•••••••••••• (password saved)' : 'Enter mailbox password'}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    disabled={!canEdit}
                    className="company-email-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <small className="muted">
                  {hasExistingPassword && !notifyConfig.smtp_password
                    ? 'Password is saved. Leave blank to keep current, or enter a new one to update.'
                    : 'Microsoft 365 account password or generated App Password.'}
                </small>
              </label>

              <label>
                SMTP Host / Server
                <input
                  type="text"
                  required
                  disabled={!canEdit}
                  value={notifyConfig.smtp_host}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, smtp_host: e.target.value }))}
                  placeholder="smtp.office365.com"
                />
                <small className="muted">Default: smtp.office365.com for Microsoft 365.</small>
              </label>

              <label>
                SMTP Port
                <input
                  type="number"
                  required
                  disabled={!canEdit}
                  value={notifyConfig.smtp_port}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, smtp_port: Number(e.target.value) || 587 }))}
                  placeholder="587"
                />
                <small className="muted">Standard: 587 (or 465 for direct SSL).</small>
              </label>

              <label>
                Encryption Protocol
                <select
                  disabled={!canEdit}
                  value={notifyConfig.smtp_encryption}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, smtp_encryption: e.target.value }))}
                >
                  <option value="STARTTLS">STARTTLS (Port 587)</option>
                  <option value="TLS">TLS / SSL (Port 465)</option>
                </select>
                <small className="muted">STARTTLS recommended for Microsoft 365.</small>
              </label>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Optional Email Relay API Keys (Resend / SendGrid)</h4>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem 0' }}>
                If you use an email delivery API service alongside Microsoft 365 for high-volume delivery, enter your API key below:
              </p>
              <div className="company-email-form-grid">
                <label>
                  Resend API Key (Optional)
                  <div className="company-email-password-input-wrap">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      disabled={!canEdit}
                      value={notifyConfig.resend_api_key}
                      onChange={(e) => setNotifyConfig((prev) => ({ ...prev, resend_api_key: e.target.value }))}
                      placeholder="re_123456789..."
                    />
                    <button
                      type="button"
                      disabled={!canEdit}
                      className="company-email-password-toggle"
                      onClick={() => setShowApiKey((prev) => !prev)}
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <label>
                  SendGrid API Key (Optional)
                  <input
                    type="password"
                    disabled={!canEdit}
                    value={notifyConfig.sendgrid_api_key}
                    onChange={(e) => setNotifyConfig((prev) => ({ ...prev, sendgrid_api_key: e.target.value }))}
                    placeholder="SG.123456789..."
                  />
                </label>
              </div>
            </div>

            <div className="company-email-inbound-settings">
              <div className="company-email-card-header">
                <h4 className="company-email-card-title">Inbound Ticket Replies</h4>
                <span className={`company-email-badge ${inboundConfig.inboundEnabled && inboundConfig.hasInboundWebhookSecret ? 'success' : 'warning'}`}>
                  {inboundConfig.inboundEnabled && inboundConfig.hasInboundWebhookSecret ? 'Ready' : 'Setup required'}
                </span>
              </div>
              <p className="muted">Manage the Microsoft 365 mailbox and rotate the key used by the Power Automate inbound ticket flow.</p>
              <div className="company-email-form-grid">
                <label>
                  Incoming Support Address
                  <input
                    type="email"
                    required
                    disabled={!canEdit}
                    value={inboundConfig.inboundEmail}
                    onChange={(event) => setInboundConfig((current) => ({ ...current, inboundEmail: event.target.value }))}
                  />
                </label>
                <label>
                  Inbound Webhook Key
                  <div className="company-email-password-input-wrap">
                    <input
                      type={showInboundKey ? 'text' : 'password'}
                      disabled={!canEdit}
                      value={inboundConfig.inboundWebhookSecret}
                      onChange={(event) => setInboundConfig((current) => ({ ...current, inboundWebhookSecret: event.target.value }))}
                      placeholder={inboundConfig.hasInboundWebhookSecret ? 'Key configured - enter a new key to rotate' : 'Enter at least 24 characters'}
                      autoComplete="new-password"
                    />
                    <button type="button" disabled={!canEdit} className="company-email-password-toggle" onClick={() => setShowInboundKey((current) => !current)}>
                      {showInboundKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <small className="muted">The saved key is never displayed. Use the same value in Power Automate.</small>
                </label>
              </div>
              <label className="company-email-inbound-toggle">
                <input
                  type="checkbox"
                  disabled={!canEdit || !inboundConfig.hasInboundWebhookSecret && !inboundConfig.inboundWebhookSecret}
                  checked={inboundConfig.inboundEnabled}
                  onChange={(event) => setInboundConfig((current) => ({ ...current, inboundEnabled: event.target.checked }))}
                />
                Accept customer email replies into support tickets
              </label>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Power Automate endpoint</span>
                <span className="company-email-field-value">yxmsqrtoghrazfwweqqf.supabase.co/functions/v1/support-ticket-inbound</span>
              </div>
              <div className="company-email-inbound-actions">
                <button type="button" className="primary-button" disabled={!canEdit || inboundStatus.saving} onClick={handleSaveInboundConfig}>
                  {inboundStatus.saving ? 'Saving...' : inboundConfig.hasInboundWebhookSecret ? 'Save / Rotate Inbound Key' : 'Save Inbound Setup'}
                </button>
                {inboundStatus.message && <span className="company-email-success">{inboundStatus.message}</span>}
                {inboundStatus.error && <span className="auth-message auth-error">{inboundStatus.error}</span>}
              </div>
            </div>

            <div className="company-email-security-note">
              🔒 <strong>Security Guarantee:</strong> Credentials are encrypted and stored with restricted Row-Level Security policies. Only authorized administrators and granted technicians can update these settings.
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="submit" className="primary-button" disabled={!canEdit || smtpStatus.saving || notifyLoading}>
                {smtpStatus.saving ? 'Saving credentials…' : canEdit ? 'Save Email Password & Credentials' : '🔒 Locked (Permission Required)'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleSendTestNotification}
                disabled={testStatus.running}
              >
                {testStatus.running ? 'Testing…' : '⚡ Send Test Email via support@echoaipro.com'}
              </button>
              {smtpStatus.message && <span style={{ color: '#166534', fontWeight: 600 }}>✓ {smtpStatus.message}</span>}
              {smtpStatus.error && <span className="auth-message auth-error" style={{ margin: 0 }}>{smtpStatus.error}</span>}
              {testStatus.message && <span style={{ color: '#0369a1', fontWeight: 600 }}>✓ {testStatus.message}</span>}
              {testStatus.error && <span className="auth-message auth-error" style={{ margin: 0 }}>{testStatus.error}</span>}
            </div>
          </form>
        </div>
      )}

      {/* 2. Ticket Notifications & Alerts Tab */}
      {activeSubTab === 'ticket-notifications' && (
        <div className="it-section">
          <h3 className="it-section-title">🔔 Incoming Ticket Notification Management</h3>
          <p className="muted">
            Configure automatic email notifications and alerts whenever customer support tickets, password help requests, or company package inquiries are submitted.
          </p>

          {!canEdit && (
            <div className="company-email-locked-banner">
              <strong>🔒 Editing Access Locked</strong>
              <p>Modifying notification routing rules, recipient emails, and webhook targets requires Super Admin authorization. You can view the current rules, but saving changes is restricted.</p>
            </div>
          )}

          <form onSubmit={handleSaveNotifyConfig}>
            <div className="company-email-toggle-row">
              <div className="company-email-toggle-info">
                <strong>Ticket Email Notifications Master Switch</strong>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {notifyConfig.enabled
                    ? `Active — New tickets will be emailed immediately to ${notifyConfig.recipient_email}`
                    : 'Disabled — Tickets will only appear in the admin ticket queue without sending emails'}
                </span>
              </div>
              <label className="company-email-switch-label">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={notifyConfig.enabled}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                <span>{notifyConfig.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>

            <div className="company-email-form-grid">
              <label>
                Primary Recipient Email
                <input
                  type="email"
                  required
                  disabled={!canEdit}
                  value={notifyConfig.recipient_email}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, recipient_email: e.target.value }))}
                  placeholder="support@echoaipro.com"
                />
                <small className="muted">Main company inbox where support alerts are routed.</small>
              </label>

              <label>
                Secondary / Technician Email(s)
                <input
                  type="text"
                  disabled={!canEdit}
                  value={notifyConfig.secondary_email}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, secondary_email: e.target.value }))}
                  placeholder="tech@echoaipro.com, it-alerts@echoaipro.com"
                />
                <small className="muted">Optional comma-separated list of technician emails to CC.</small>
              </label>

              <label>
                Sender Display Name
                <input
                  type="text"
                  disabled={!canEdit}
                  value={notifyConfig.sender_name}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, sender_name: e.target.value }))}
                  placeholder="EchoAI Support System"
                />
              </label>

              <label>
                Subject Line Prefix
                <input
                  type="text"
                  disabled={!canEdit}
                  value={notifyConfig.subject_prefix}
                  onChange={(e) => setNotifyConfig((prev) => ({ ...prev, subject_prefix: e.target.value }))}
                  placeholder="[EchoAI Support]"
                />
              </label>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Trigger Events &amp; Notification Rules</h4>
              <div className="company-email-checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={notifyConfig.notify_on_landing_tickets}
                    onChange={(e) => setNotifyConfig((prev) => ({ ...prev, notify_on_landing_tickets: e.target.checked }))}
                  />
                  <span><strong>Public Landing Page Tickets</strong> — Visitors who cannot sign in or need account recovery</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={notifyConfig.notify_on_app_tickets}
                    onChange={(e) => setNotifyConfig((prev) => ({ ...prev, notify_on_app_tickets: e.target.checked }))}
                  />
                  <span><strong>In-App Help Desk Tickets</strong> — Logged-in customers submitting questions, bugs, or technical issues</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={notifyConfig.notify_on_company_requests}
                    onChange={(e) => setNotifyConfig((prev) => ({ ...prev, notify_on_company_requests: e.target.checked }))}
                  />
                  <span><strong>Company Package Requests</strong> — Enterprise and company seat quote inquiries</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={notifyConfig.include_full_description}
                    onChange={(e) => setNotifyConfig((prev) => ({ ...prev, include_full_description: e.target.checked }))}
                  />
                  <span><strong>Include Full Customer Message</strong> — Include the complete issue description in the notification email</span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Optional Webhook Integration (Teams / Slack / Zapier)</h4>
              <div className="company-email-checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={notifyConfig.webhook_enabled}
                    onChange={(e) => setNotifyConfig((prev) => ({ ...prev, webhook_enabled: e.target.checked }))}
                  />
                  <span><strong>Forward to Webhook</strong> (Microsoft Teams channel, Slack webhook, or automation flow)</span>
                </label>
                {notifyConfig.webhook_enabled && (
                  <label style={{ marginTop: '0.5rem', width: '100%' }}>
                    Webhook URL
                    <input
                      type="url"
                      disabled={!canEdit}
                      style={{ width: '100%', marginTop: '0.25rem' }}
                      value={notifyConfig.webhook_url}
                      onChange={(e) => setNotifyConfig((prev) => ({ ...prev, webhook_url: e.target.value }))}
                      placeholder="https://outlook.office.com/webhook/... or https://hooks.slack.com/services/..."
                    />
                  </label>
                )}
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button type="submit" className="primary-button" disabled={!canEdit || notifySaving || notifyLoading}>
                {notifySaving ? 'Saving parameters…' : canEdit ? 'Save notification parameters' : '🔒 Locked (Requires Permission)'}
              </button>
              {notifyStatus.message && <span className="muted" style={{ color: '#166534', fontWeight: 600 }}>✓ {notifyStatus.message}</span>}
              {notifyStatus.error && <span className="auth-message auth-error">{notifyStatus.error}</span>}
            </div>
          </form>

          {/* Test & Diagnostics Panel */}
          <div className="company-email-test-panel">
            <h4 style={{ margin: 0, color: '#0369a1' }}>🧪 Test Outbound Ticket Notification</h4>
            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
              Send a test notification to verify delivery to <strong>{notifyConfig.recipient_email}</strong> and any configured technician mailboxes without waiting for a customer.
            </p>
            <div className="company-email-form-grid" style={{ marginTop: '0.25rem' }}>
              <label>
                Test Category
                <select value={testCategory} onChange={(e) => setTestCategory(e.target.value)}>
                  <option value="Technical issue">Technical issue</option>
                  <option value="Sign-in issue">Sign-in issue</option>
                  <option value="Billing inquiry">Billing inquiry</option>
                  <option value="Company package">Company package inquiry</option>
                </select>
              </label>
              <label>
                Sample Message
                <input
                  type="text"
                  value={testDetails}
                  onChange={(e) => setTestDetails(e.target.value)}
                />
              </label>
            </div>
            <div className="company-email-test-actions">
              <button
                type="button"
                className="primary-button"
                style={{ background: '#0284c7' }}
                disabled={testStatus.running}
                onClick={handleSendTestNotification}
              >
                {testStatus.running ? 'Sending test email…' : '⚡ Send Test Notification Now'}
              </button>
              {testStatus.message && (
                <span style={{ color: '#0369a1', fontWeight: 600, fontSize: '0.88rem' }}>
                  ✓ {testStatus.message}
                </span>
              )}
              {testStatus.error && (
                <span className="auth-message auth-error" style={{ margin: 0 }}>
                  {testStatus.error}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Overview Tab */}
      {activeSubTab === 'overview' && (
        <>
          <div className="company-email-cards">
            <div className="company-email-card">
              <div className="company-email-card-header">
                <h4 className="company-email-card-title">📨 Outbound Support Mailbox</h4>
                <span className="company-email-badge success">Active</span>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                All outbound emails mailed to customers (password resets, activation links, support ticket replies, billing receipts) are branded and sent from this address.
              </p>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Sender Address</span>
                <span className="company-email-field-value">{notifyConfig.smtp_user || 'support@echoaipro.com'}</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Sender Name</span>
                <span className="company-email-field-value">{notifyConfig.sender_name || 'EchoAI Support'}</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Provider</span>
                <span className="company-email-field-value">Microsoft 365 Essential</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Password Status</span>
                <span className="company-email-field-value">
                  {hasExistingPassword ? '✓ Saved' : '⚠️ Password Needed'}
                </span>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  onClick={() => setActiveSubTab('credentials')}
                >
                  Configure Mailbox Password &amp; SMTP →
                </button>
              </div>
            </div>

            <div className="company-email-card">
              <div className="company-email-card-header">
                <h4 className="company-email-card-title">🔔 Incoming Ticket Notifications</h4>
                <span className={`company-email-badge ${notifyConfig.enabled ? 'success' : 'warning'}`}>
                  {notifyConfig.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                Whenever a customer submits a support ticket, a full notification and description are instantly forwarded to your team.
              </p>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Primary Recipient</span>
                <span className="company-email-field-value">{notifyConfig.recipient_email || 'support@echoaipro.com'}</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Secondary / Tech Email</span>
                <span className="company-email-field-value">{notifyConfig.secondary_email || 'None configured'}</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Full Descriptions</span>
                <span className="company-email-field-value">{notifyConfig.include_full_description ? 'Included' : 'Summarized'}</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Webhook Routing</span>
                <span className="company-email-field-value">{notifyConfig.webhook_enabled ? 'Active' : 'Disabled'}</span>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  onClick={() => setActiveSubTab('ticket-notifications')}
                >
                  Manage Notification Rules →
                </button>
              </div>
            </div>

            <div className="company-email-card">
              <div className="company-email-card-header">
                <h4 className="company-email-card-title">🧑‍🔧 Technician Account</h4>
                <span className="company-email-badge info">Assigned</span>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                Dedicated mailbox for your hired technician and IT staff to manage support operations, triage tickets, and administer accounts.
              </p>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Primary Role</span>
                <span className="company-email-field-value">Technician (IT / Admin)</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Staff Count</span>
                <span className="company-email-field-value">{staffMembers.length} active</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Account Provisioning</span>
                <span className="company-email-field-value">Instant Link + Email Invite</span>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  onClick={() => setActiveSubTab('staff-setup')}
                >
                  Manage Staff Setup Links →
                </button>
              </div>
            </div>
          </div>

          <div className="it-section">
            <h3 className="it-section-title">⚡ Quick Diagnostics &amp; Fixes</h3>
            <div className="company-email-guide-box">
              <div className="company-email-guide-step">
                <span className="company-email-step-number">1</span>
                <div>
                  <strong>Where do I put in my support mailbox password?</strong>
                  <p className="muted" style={{ margin: '0.3rem 0 0 0' }}>
                    Click the <strong>🔐 Mailbox &amp; Email Password</strong> tab above to enter your Microsoft 365 password or App Password. It is securely saved so all outbound system emails and notifications send properly.
                  </p>
                </div>
              </div>
              <div className="company-email-guide-step">
                <span className="company-email-step-number">2</span>
                <div>
                  <strong>How do incoming tickets get emailed to support@echoaipro.com?</strong>
                  <p className="muted" style={{ margin: '0.3rem 0 0 0' }}>
                    Open the <strong>🔔 Ticket Notifications &amp; Alerts</strong> tab. You can toggle notifications on/off, adjust the recipient address (default: <code>support@echoaipro.com</code>), add your technician&apos;s email, and test the notification with a live sample ticket.
                  </p>
                </div>
              </div>
              <div className="company-email-guide-step">
                <span className="company-email-step-number">3</span>
                <div>
                  <strong>Can I give my technician a direct link if they didn&apos;t get the email?</strong>
                  <p className="muted" style={{ margin: '0.3rem 0 0 0' }}>
                    Yes! Switch to the <strong>Technician &amp; Staff Setup Links</strong> tab above. You can generate a single-use setup / password reset link for any technician or staff member with one click and send it to them directly via Microsoft Teams, Outlook, or SMS.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 4. Microsoft 365 Setup Guide Tab */}
      {activeSubTab === 'smtp-guide' && (
        <div className="it-section">
          <h3 className="it-section-title">🔧 Microsoft 365 Essential &amp; Supabase SMTP Setup Guide</h3>
          <p className="muted">
            Follow these steps in your Supabase Dashboard and Microsoft 365 Admin Center so all outgoing emails are sent from <strong>support@echoaipro.com</strong> and redirect correctly to your application.
          </p>

          <div className="company-email-guide-box">
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#1e40af' }}>Step A: Configure Custom SMTP in Supabase</h4>
            <p className="muted" style={{ margin: 0 }}>
              Go to <strong>Supabase Dashboard → Project Settings → Authentication → SMTP Settings</strong> (or <strong>Email Settings</strong>) and enter:
            </p>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Enable Custom SMTP</span>
                <span className="company-email-field-value">Enabled (ON)</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Sender Email</span>
                <span className="company-email-field-value">support@echoaipro.com</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Sender Name</span>
                <span className="company-email-field-value">EchoAI Support</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Host</span>
                <span className="company-email-field-value">smtp.office365.com</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Port</span>
                <span className="company-email-field-value">587</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Encryption</span>
                <span className="company-email-field-value">STARTTLS / TLS</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Username</span>
                <span className="company-email-field-value">support@echoaipro.com</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Password</span>
                <span className="company-email-field-value">[Your Microsoft 365 Mailbox or App Password]</span>
              </div>
            </div>
          </div>

          <div className="company-email-guide-box">
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#1e40af' }}>Step B: Enable Authenticated SMTP in Microsoft 365 Admin Center</h4>
            <p className="muted" style={{ margin: 0 }}>
              Microsoft 365 requires SMTP AUTH to be enabled for the mailbox:
            </p>
            <ol style={{ margin: '0.5rem 0 0 1.25rem', padding: 0, lineHeight: 1.6, color: '#334155' }}>
              <li>Open <strong>Microsoft 365 Admin Center</strong> (admin.microsoft.com).</li>
              <li>Go to <strong>Users → Active users</strong> and select <strong>support@echoaipro.com</strong>.</li>
              <li>Click the <strong>Mail</strong> tab, then click <strong>Manage email apps</strong>.</li>
              <li>Check the box for <strong>Authenticated SMTP</strong> and click <strong>Save changes</strong>.</li>
            </ol>
          </div>

          <div className="company-email-guide-box">
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#1e40af' }}>Step C: Update Supabase Auth Redirect URLs (Fixes &quot;This site can&apos;t be reached&quot;)</h4>
            <p className="muted" style={{ margin: 0 }}>
              In <strong>Supabase Dashboard → Authentication → URL Configuration</strong>:
            </p>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Site URL</span>
                <span className="company-email-field-value">https://www.echoaipro.com</span>
              </div>
              <div className="company-email-field-row">
                <span className="company-email-field-label">Additional Redirect URLs</span>
                <span className="company-email-field-value">https://echoaipro.com/**, https://www.echoaipro.com/**, https://www.echoaipro.com/?recovery=1</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Staff Setup Links Tab */}
      {activeSubTab === 'staff-setup' && (
        <div className="it-section">
          <h3 className="it-section-title">🧑‍💼 Technician &amp; Staff Account Management</h3>
          <p className="muted">
            View staff accounts and generate direct single-use setup / password reset links. If a technician did not receive their automated invite, generate a direct link here and message it to them.
          </p>

          {isFullAdmin && (
            <div className="company-email-guide-box" style={{ background: '#ffffff' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Invite New Technician / Staff Member</h4>
              <form className="auth-form" onSubmit={handleCreateStaff}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <label>
                    Full name
                    <input
                      required
                      value={newStaff.fullName}
                      onChange={(e) => setNewStaff((prev) => ({ ...prev, fullName: e.target.value }))}
                      placeholder="Tech Name"
                    />
                  </label>
                  <label>
                    Email address
                    <input
                      required
                      type="email"
                      value={newStaff.email}
                      onChange={(e) => setNewStaff((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="tech@echoaipro.com"
                    />
                  </label>
                  <label>
                    Role
                    <select
                      value={newStaff.role}
                      onChange={(e) => setNewStaff((prev) => ({ ...prev, role: e.target.value }))}
                    >
                      <option value="it">Technician (IT)</option>
                      <option value="accountant">Accounting</option>
                      <option value="user">Standard user</option>
                    </select>
                  </label>
                  <label>
                    Company
                    <input
                      required
                      value={newStaff.company}
                      onChange={(e) => setNewStaff((prev) => ({ ...prev, company: e.target.value }))}
                      placeholder="EchoAI"
                    />
                  </label>
                </div>
                {newStaff.role === 'board_member' && (
                  <label style={{ marginTop: '0.5rem' }}>
                    Profit share percentage (1-50%)
                    <input
                      required
                      type="number"
                      min="1"
                      max="50"
                      step="0.01"
                      value={newStaff.profitSharePercent || ''}
                      onChange={(e) => setNewStaff((prev) => ({ ...prev, profitSharePercent: e.target.value }))}
                    />
                  </label>
                )}
                <div style={{ marginTop: '0.75rem' }}>
                  <button type="submit" className="primary-button" disabled={staffStatus.saving}>
                    {staffStatus.saving ? 'Creating account...' : 'Create staff account & generate link'}
                  </button>
                </div>
                {staffStatus.error && <p className="auth-message auth-error">{staffStatus.error}</p>}
                {staffStatus.message && <p className="auth-message">{staffStatus.message}</p>}
                {staffStatus.createdLink && (
                  <div className="company-email-link-box">
                    <strong>Direct Setup Link for {staffStatus.createdEmail}:</strong>
                    <textarea readOnly rows={2} value={staffStatus.createdLink} onFocus={(e) => e.target.select()} />
                    <button
                      type="button"
                      className="primary-button"
                      style={{ fontSize: '0.82rem', padding: '0.35rem 0.8rem', alignSelf: 'flex-start' }}
                      onClick={() => handleCopyLink('created-link', staffStatus.createdLink)}
                    >
                      {copiedLink === 'created-link' ? '✓ Copied to clipboard!' : 'Copy setup link'}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="company-email-staff-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Email &amp; SMTP Permissions</th>
                  <th>Direct Setup / Reset Action</th>
                </tr>
              </thead>
              <tbody>
                {staffMembers.map((member) => (
                  <tr key={member.id}>
                    <td><strong>{member.fullName || 'Staff User'}</strong></td>
                    <td><code>{member.email}</code></td>
                    <td><span className="company-email-badge info">{member.role}</span></td>
                    <td>
                      <span className={`company-email-badge ${member.accessStatus === 'active' ? 'success' : 'warning'}`}>
                        {member.accessStatus || 'active'}
                      </span>
                    </td>
                    <td>
                      {isFullAdmin ? (
                        <button
                          type="button"
                          className={member.companyEmailEditAccess ? 'primary-button' : 'ghost-button'}
                          style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
                          onClick={async () => {
                            try {
                              await onAdminUserAction({
                                action: 'set-company-email-edit-access',
                                userId: member.id,
                                email: member.email,
                                enabled: !member.companyEmailEditAccess,
                              })
                            } catch (err) {
                              setLinkErrors((prev) => ({ ...prev, [member.id]: err.message }))
                            }
                          }}
                        >
                          {member.companyEmailEditAccess ? '✓ Editing Granted' : 'Grant Editing Access'}
                        </button>
                      ) : (
                        <span className={`company-email-badge ${member.companyEmailEditAccess ? 'success' : 'warning'}`}>
                          {member.companyEmailEditAccess ? 'Granted' : 'Locked'}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                        onClick={() => handleGenerateLink(member)}
                        disabled={loadingLinks[member.id]}
                      >
                        {loadingLinks[member.id] ? 'Generating…' : 'Generate Setup Link'}
                      </button>

                      {linkErrors[member.id] && (
                        <p className="auth-message auth-error" style={{ fontSize: '0.78rem', margin: '0.3rem 0 0 0' }}>
                          {linkErrors[member.id]}
                        </p>
                      )}

                      {recoveryLinks[member.id] && (
                        <div className="company-email-link-box" style={{ marginTop: '0.4rem' }}>
                          <textarea
                            readOnly
                            rows={2}
                            value={recoveryLinks[member.id]}
                            onFocus={(e) => e.target.select()}
                          />
                          <button
                            type="button"
                            className="primary-button"
                            style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', alignSelf: 'flex-start' }}
                            onClick={() => handleCopyLink(member.id, recoveryLinks[member.id])}
                          >
                            {copiedLink === member.id ? '✓ Copied!' : 'Copy Link'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {staffMembers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                      No staff accounts found. Create one above to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Company Email Seats Tab */}
      {activeSubTab === 'seats' && (
        <div className="it-section">
          <h3 className="it-section-title">👥 Company Email Seats</h3>
          <p className="muted">
            Assign company license seats to employee email addresses. When employees sign up with their assigned company email, their access is activated automatically.
          </p>

          {!companySeatPackage ? (
            <form className="composer" onSubmit={handleCreatePackage}>
              <label>
                Seat package size
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={seatLimitDraft}
                  onChange={(event) => setSeatLimitDraft(event.target.value)}
                />
              </label>
              <button type="submit" className="primary-button">
                Create company seat package
              </button>
            </form>
          ) : (
            <>
              <div className="company-email-hero" style={{ padding: '1rem', background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong>{currentUser?.company || companySeatPackage.companyKey}</strong>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {assignedSeatsCount} of {companySeatPackage.seatLimit} seats assigned
                  </div>
                </div>
                <form onSubmit={handleUpdatePackage} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    min={assignedSeatsCount}
                    step="1"
                    value={seatLimitDraft}
                    onChange={(event) => setSeatLimitDraft(event.target.value)}
                    style={{ width: '80px', padding: '0.3rem 0.5rem' }}
                  />
                  <button type="submit" className="ghost-button" style={{ fontSize: '0.82rem' }}>
                    Resize
                  </button>
                </form>
              </div>

              <form className="composer" onSubmit={handleAssignSeat} style={{ marginTop: '1rem' }}>
                <label>
                  Assign employee email
                  <input
                    type="email"
                    required
                    value={seatEmailDraft}
                    onChange={(event) => setSeatEmailDraft(event.target.value)}
                    placeholder="employee@company.com"
                  />
                </label>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={assignedSeatsCount >= companySeatPackage.seatLimit}
                >
                  Assign seat
                </button>
              </form>

              <div style={{ marginTop: '1rem' }}>
                {companySeats.map((seat) => (
                  <div key={seat.id} className="it-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <strong>{seat.employeeEmail}</strong>
                      <br />
                      <small className="muted">{seat.claimedAt ? 'Claimed' : 'Awaiting signup'}</small>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className={`company-email-badge ${seat.status === 'active' ? 'success' : 'warning'}`}>
                        {seat.status}
                      </span>
                      {seat.status !== 'revoked' && (
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
                          onClick={() => handleRevokeSeat(seat.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {seatMessage && <p className="auth-message">{seatMessage}</p>}
          {seatError && <p className="auth-message auth-error">{seatError}</p>}
        </div>
      )}
    </div>
  )
}
