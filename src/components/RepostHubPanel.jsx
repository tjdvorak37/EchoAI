import { useState } from 'react'
import './RepostHubPanel.css'

export function RepostHubPanel({
  companySocialAccounts = [],
  companyMainPosts = [],
  repostQueue = [],
  userReposts = [],
  autoApproveCompanyPosts = false,
  onToggleAutoApproval,
  onPublishCompanyPost,
  onAddCompanyAccount,
  onBroadcastCompanyPost,
  onSendToApprovalBoard,
  onRepostDecision,
  onDirectPublishRepost,
  isAdminUser = false,
  broadcastingPostId = '',
  publishLoading = false,
  repostNotice = '',
  repostError = '',
}) {
  const [activeTab, setActiveTab] = useState('stream') // 'stream' | 'approvals' | 'accounts' | 'history' | 'admin-publish'
  const [customizingPost, setCustomizingPost] = useState(null)
  const [customDraft, setCustomDraft] = useState({
    caption: '',
    selectedChannels: ['instagram', 'facebook'],
    customDiscountCode: '',
    customHandle: '',
    includeDisclaimer: false,
  })

  // Admin drafts
  const [newPostDraft, setNewPostDraft] = useState({
    title: '',
    content: '',
    channels: ['instagram', 'facebook'],
  })
  const [newAccountDraft, setNewAccountDraft] = useState({
    platform: 'Instagram',
    accountName: '',
    companyName: '',
  })

  const pendingApprovals = repostQueue.filter((item) => item.status === 'pending')

  const handleOpenCustomizer = (post) => {
    setCustomizingPost(post)
    setCustomDraft({
      caption: post.content || '',
      selectedChannels: post.channels?.length ? [...post.channels] : ['instagram', 'facebook'],
      customDiscountCode: '',
      customHandle: '',
      includeDisclaimer: false,
    })
  }

  const handleQuickSwapDiscount = () => {
    if (!customDraft.customDiscountCode.trim()) return
    const code = customDraft.customDiscountCode.trim()
    let updated = customDraft.caption
    // Replace existing promo code patterns like SAVE20, CODE, etc or append
    const codeRegex = /\b(PROMO|CODE|USE CODE|DISCOUNT|SAVE\d+)\b[:\s]*[A-Z0-9_-]+/gi
    if (codeRegex.test(updated)) {
      updated = updated.replace(codeRegex, `Use code ${code}`)
    } else {
      updated = `${updated}\n\n🎁 Use my personal code: ${code} for a special discount!`
    }
    setCustomDraft((prev) => ({ ...prev, caption: updated }))
  }

  const handleQuickSwapHandle = () => {
    if (!customDraft.customHandle.trim()) return
    const handle = customDraft.customHandle.trim().startsWith('@') ? customDraft.customHandle.trim() : `@${customDraft.customHandle.trim()}`
    let updated = customDraft.caption
    // Replace handles
    const handleRegex = /@[a-zA-Z0-9_.]+/g
    if (handleRegex.test(updated)) {
      updated = updated.replace(handleRegex, handle)
    } else {
      updated = `${updated}\n\nFollow me ${handle} for more!`
    }
    setCustomDraft((prev) => ({ ...prev, caption: updated }))
  }

  const handleRemovePromoCodes = () => {
    const cleaned = customDraft.caption
      .replace(/\b(use code|promo code|coupon|discount code)\s*[:-]?\s*[A-Z0-9_]+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    setCustomDraft((prev) => ({ ...prev, caption: cleaned }))
  }

  const handleAddDisclaimer = () => {
    const disclaimer = '\n\n#Ad #Partner #BrandAmbassador'
    if (!customDraft.caption.includes('#Ad')) {
      setCustomDraft((prev) => ({ ...prev, caption: `${prev.caption}${disclaimer}` }))
    }
  }

  const handleExecuteRepost = async () => {
    if (!customizingPost) return
    const finalCaption = customDraft.caption.trim()
    if (!finalCaption) return

    if (onDirectPublishRepost) {
      await onDirectPublishRepost({
        companyPostId: customizingPost.id,
        caption: finalCaption,
        channels: customDraft.selectedChannels,
      })
    } else if (onSendToApprovalBoard) {
      await onSendToApprovalBoard(customizingPost)
    }
    setCustomizingPost(null)
  }

  const handleAdminPublishSubmit = async (e) => {
    e.preventDefault()
    if (!newPostDraft.title.trim() || !newPostDraft.content.trim()) return
    await onPublishCompanyPost?.(newPostDraft)
    setNewPostDraft({ title: '', content: '', channels: ['instagram', 'facebook'] })
    setActiveTab('stream')
  }

  const handleAdminAddAccountSubmit = async (e) => {
    e.preventDefault()
    if (!newAccountDraft.accountName.trim()) return
    await onAddCompanyAccount?.(newAccountDraft)
    setNewAccountDraft({ platform: 'Instagram', accountName: '', companyName: '' })
    setActiveTab('accounts')
  }

  const toggleChannel = (channel) => {
    setCustomDraft((prev) => ({
      ...prev,
      selectedChannels: prev.selectedChannels.includes(channel)
        ? prev.selectedChannels.filter((c) => c !== channel)
        : [...prev.selectedChannels, channel],
    }))
  }

  const toggleAdminChannel = (channel) => {
    setNewPostDraft((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }))
  }

  const getCompanyPostById = (postId) => companyMainPosts.find((p) => p.id === postId)

  return (
    <section className="panel panel-repost">
      <div className="repost-master-container">
        {/* Hero Header */}
        <div className="repost-hero-bar">
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.45rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>📢</span> Repost Hub &amp; Brand Syndication
            </h2>
            <p className="panel-note" style={{ margin: 0, fontSize: '0.86rem' }}>
              Monitor company content, customize copy with your personal handle/promo code, and rebrand posts directly to your personal channels.
            </p>
          </div>

          <div className="repost-hero-actions">
            <button
              type="button"
              className={autoApproveCompanyPosts ? 'primary-button' : 'ghost-button'}
              onClick={onToggleAutoApproval}
              style={{ fontSize: '0.85rem' }}
            >
              {autoApproveCompanyPosts ? '⚡ Auto-Repost: ON' : '⚙️ Auto-Repost: OFF'}
            </button>
            {isAdminUser && (
              <button
                type="button"
                className="primary-button"
                onClick={() => setActiveTab('admin-publish')}
                style={{ fontSize: '0.85rem' }}
              >
                ➕ Create Company Broadcast
              </button>
            )}
          </div>
        </div>

        {/* Repost KPIs Bar */}
        <div className="repost-kpi-grid">
          <div className="repost-kpi-card">
            <span>Available Company Posts</span>
            <strong>{companyMainPosts.length}</strong>
            <small>Ready to grab &amp; rebrand</small>
          </div>

          <div className="repost-kpi-card" style={{ borderColor: pendingApprovals.length > 0 ? '#f59e0b' : '#e2e8f0' }}>
            <span>Pending Approvals</span>
            <strong style={{ color: pendingApprovals.length > 0 ? '#d97706' : '#0f172a' }}>
              {pendingApprovals.length}
            </strong>
            <small>{pendingApprovals.length > 0 ? 'Awaiting your review' : 'All queues cleared'}</small>
          </div>

          <div className="repost-kpi-card">
            <span>Monitored Company Feeds</span>
            <strong style={{ color: '#2563eb' }}>{companySocialAccounts.length}</strong>
            <small>Active corporate accounts</small>
          </div>

          <div className="repost-kpi-card">
            <span>Your Syndicated Reposts</span>
            <strong style={{ color: '#16a34a' }}>{userReposts.length}</strong>
            <small>Published under your brand</small>
          </div>
        </div>

        {repostNotice && <div className="auth-message tone-positive" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '0.75rem 1rem', borderRadius: 8 }}>{repostNotice}</div>}
        {repostError && <div className="auth-message auth-error" style={{ padding: '0.75rem 1rem', borderRadius: 8 }}>{repostError}</div>}

        {/* Navigation Tabs */}
        <nav className="repost-nav-tabs">
          {[
            ['stream', `📥 Company Content Stream (${companyMainPosts.length})`],
            ['approvals', `🔔 Approvals Queue (${pendingApprovals.length})`],
            ['accounts', `🏢 Monitored Companies (${companySocialAccounts.length})`],
            ['history', `📜 My Repost History (${userReposts.length})`],
            ...(isAdminUser ? [['admin-publish', '📢 Publish Broadcast (Admin)']] : []),
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`repost-tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* ── TAB 1: COMPANY CONTENT STREAM ── */}
        {activeTab === 'stream' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Company Posts Ready for Rebranding</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                  Grab any official company post, modify handles, discount codes, or wording, and repost to your personal accounts.
                </p>
              </div>
            </div>

            {companyMainPosts.length === 0 ? (
              <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📭</span>
                <strong>No Company Posts Available Yet</strong>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>When your company or monitored brand publishes a broadcast, it will appear here for 1-click rebranding.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {companyMainPosts.map((post) => (
                  <div key={post.id} className="repost-post-card">
                    <div className="repost-post-card-header">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '0.74rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                            {post.companyName || 'Company'}
                          </span>
                          <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{post.title}</strong>
                        </div>
                        <small style={{ color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
                          {post.publishedAt ? `Published ${new Date(post.publishedAt).toLocaleDateString()}` : 'Ready for syndication'} • Channels: {post.channels?.join(', ')}
                        </small>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleOpenCustomizer(post)}
                          style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                        >
                          ⚡ Grab &amp; Rebrand
                        </button>
                      </div>
                    </div>

                    <div className="repost-post-content">
                      {post.content}
                    </div>

                    <div className="repost-post-footer">
                      <div className="chip-row">
                        {(post.channels || []).map((ch) => (
                          <span key={ch} className="badge info">{ch}</span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            navigator.clipboard.writeText(post.content)
                          }}
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                        >
                          📋 Copy Original
                        </button>

                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => onSendToApprovalBoard?.(post)}
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                        >
                          {autoApproveCompanyPosts ? '⚡ Instant Repost (As-Is)' : '📥 Send to Queue'}
                        </button>

                        {isAdminUser && (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => onBroadcastCompanyPost?.(post.id)}
                            disabled={broadcastingPostId === post.id}
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                          >
                            {broadcastingPostId === post.id ? 'Broadcasting...' : '📢 Broadcast'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: APPROVALS QUEUE ── */}
        {activeTab === 'approvals' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Your Repost Approval Board</h3>
              <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                Review incoming company posts assigned to your queue. You can approve as-is or customize prior to posting.
              </p>
            </div>

            {repostQueue.length === 0 ? (
              <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>✅</span>
                <strong>Approval Queue is Empty</strong>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>No pending company posts requiring review.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {repostQueue.map((item) => {
                  const post = getCompanyPostById(item.companyPostId)
                  if (!post) return null

                  return (
                    <div key={item.id} className="repost-post-card">
                      <div className="repost-post-card-header">
                        <div>
                          <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{post.title}</strong>
                          <span style={{ fontSize: '0.76rem', color: '#64748b', display: 'block' }}>
                            From: {post.companyName} • Target Channels: {post.channels?.join(', ')}
                          </span>
                        </div>
                        <span className={`badge ${item.status === 'pending' ? 'pending' : item.status === 'approved' || item.status === 'posted' ? 'success' : 'risk'}`}>
                          {item.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="repost-post-content" style={{ fontSize: '0.85rem' }}>
                        {post.content}
                      </div>

                      <div className="repost-post-footer">
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {item.queuedAt ? `Queued ${new Date(item.queuedAt).toLocaleString()}` : 'Queued recently'}
                        </span>

                        {item.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleOpenCustomizer(post)}
                              style={{ fontSize: '0.82rem' }}
                            >
                              ✏️ Customize &amp; Rebrand
                            </button>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => onRepostDecision?.(item.id, 'approved')}
                              style={{ fontSize: '0.82rem' }}
                            >
                              ✓ Approve As-Is
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => onRepostDecision?.(item.id, 'declined')}
                              style={{ color: '#dc2626', fontSize: '0.82rem' }}
                            >
                              ✕ Decline
                            </button>
                          </div>
                        ) : (
                          <small style={{ color: '#64748b' }}>
                            Decision made: {item.decisionAt ? new Date(item.decisionAt).toLocaleString() : 'Completed'}
                          </small>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: MONITORED COMPANIES & SOCIAL ACCOUNTS ── */}
        {activeTab === 'accounts' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Monitored Company Channels &amp; Profiles</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                  Official brand accounts connected to this organization for syndication feeds.
                </p>
              </div>
            </div>

            <div className="monitored-accounts-grid">
              {companySocialAccounts.map((account) => (
                <div key={account.id} className="monitored-account-card">
                  <div className="monitored-account-info">
                    <div className="monitored-account-avatar">
                      {account.platform?.charAt(0).toUpperCase() || 'C'}
                    </div>
                    <div>
                      <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.95rem' }}>{account.accountName}</strong>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{account.companyName} • {account.platform}</span>
                    </div>
                  </div>
                  <span className="badge success">Active Feed</span>
                </div>
              ))}
            </div>

            {isAdminUser && (
              <div style={{ marginTop: '1rem', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Add Monitored Company Channel</h4>
                <form onSubmit={handleAdminAddAccountSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <label>
                    Company Name
                    <input
                      required
                      value={newAccountDraft.companyName}
                      onChange={(e) => setNewAccountDraft((p) => ({ ...p, companyName: e.target.value }))}
                      placeholder="e.g. Nike Corporate"
                    />
                  </label>
                  <label>
                    Platform
                    <select
                      value={newAccountDraft.platform}
                      onChange={(e) => setNewAccountDraft((p) => ({ ...p, platform: e.target.value }))}
                    >
                      {['Instagram', 'Facebook', 'TikTok', 'X', 'LinkedIn', 'YouTube'].map((pl) => (
                        <option key={pl} value={pl}>{pl}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Handle / Page Name
                    <input
                      required
                      value={newAccountDraft.accountName}
                      onChange={(e) => setNewAccountDraft((p) => ({ ...p, accountName: e.target.value }))}
                      placeholder="e.g. @nike"
                    />
                  </label>
                  <button type="submit" className="primary-button" disabled={publishLoading} style={{ height: 42 }}>
                    {publishLoading ? 'Adding...' : '➕ Add Channel'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: REPOST HISTORY ── */}
        {activeTab === 'history' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Your Syndicated Repost History</h3>
              <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                Log of all rebranded company posts published through your personal connected channels.
              </p>
            </div>

            {userReposts.length === 0 ? (
              <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📜</span>
                <strong>No Repost History Yet</strong>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>When you customize and approve posts, they will be archived here with full caption records.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {userReposts.map((repost) => {
                  const post = getCompanyPostById(repost.companyPostId)
                  return (
                    <div key={repost.id} className="repost-post-card">
                      <div className="repost-post-card-header">
                        <div>
                          <strong style={{ fontSize: '0.98rem', color: '#0f172a' }}>{post?.title || 'Rebranded Company Post'}</strong>
                          <span style={{ fontSize: '0.76rem', color: '#64748b', display: 'block' }}>
                            Originally from: {post?.companyName || 'Company'} • {repost.postedAt ? `Posted ${new Date(repost.postedAt).toLocaleString()}` : 'Posted recently'}
                          </span>
                        </div>
                        <span className="badge success">PUBLISHED</span>
                      </div>

                      <div className="repost-post-content" style={{ background: '#f0fdf4', borderColor: '#22c55e' }}>
                        {repost.caption}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 5: ADMIN BROADCAST COMPOSER ── */}
        {activeTab === 'admin-publish' && isAdminUser && (
          <div style={{ maxWidth: 780, margin: '0 auto', width: '100%' }}>
            <div className="repost-post-card" style={{ padding: '1.75rem' }}>
              <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.25rem' }}>📢 Create &amp; Broadcast Company Main Post</h3>
              <p className="muted" style={{ margin: '0 0 1.25rem', fontSize: '0.85rem' }}>
                Publish official brand content that will automatically distribute to all team members&apos; Repost Hub streams.
              </p>

              <form onSubmit={handleAdminPublishSubmit} className="composer" style={{ display: 'grid', gap: '1rem' }}>
                <label>
                  Broadcast Campaign Title
                  <input
                    required
                    value={newPostDraft.title}
                    onChange={(e) => setNewPostDraft((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Labor Day Weekend Special Offer"
                  />
                </label>

                <label>
                  Post Caption &amp; Content
                  <textarea
                    rows="5"
                    required
                    value={newPostDraft.content}
                    onChange={(e) => setNewPostDraft((p) => ({ ...p, content: e.target.value }))}
                    placeholder="Write official company post copy, announcement details, hashtags, and promotional offers..."
                  />
                </label>

                <div>
                  <p className="small-title">Suggested Target Channels</p>
                  <div className="chip-row">
                    {['instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube'].map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        className={`chip ${newPostDraft.channels.includes(ch) ? 'active' : ''}`}
                        onClick={() => toggleAdminChannel(ch)}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="action-row" style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setActiveTab('stream')}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={publishLoading}
                  >
                    {publishLoading ? 'Publishing Broadcast...' : '🚀 Publish & Broadcast to Team'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: REBRAND & CUSTOMIZER STUDIO ── */}
        {customizingPost && (
          <div
            className="modal-overlay"
            role="presentation"
            onClick={() => setCustomizingPost(null)}
          >
            <div
              className="repost-customizer-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Rebrand Company Post"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="section-label">Rebrand Studio</span>
                  <h3 style={{ margin: '0.2rem 0', fontSize: '1.25rem', color: '#0f172a' }}>
                    Rebrand &amp; Personalize Post
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: '0.84rem' }}>
                    Modify handles, discount codes, or add your personal voice before posting to your channels.
                  </p>
                </div>
                <button
                  type="button"
                  className="credit-modal-close"
                  onClick={() => setCustomizingPost(null)}
                >
                  ✕
                </button>
              </div>

              {/* Quick Modifier Tools Bar */}
              <div className="repost-quick-tools">
                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Quick Edits:</span>
                <button type="button" className="repost-quick-btn" onClick={handleRemovePromoCodes}>
                  ✂️ Remove Promo Codes
                </button>
                <button type="button" className="repost-quick-btn" onClick={handleAddDisclaimer}>
                  🏷️ Add #Ad Disclaimer
                </button>
                <button
                  type="button"
                  className="repost-quick-btn"
                  onClick={() => setCustomDraft((p) => ({ ...p, caption: `${p.caption}\n\nLink in bio to learn more!` }))}
                >
                  🔗 Add &ldquo;Link in Bio&rdquo;
                </button>
              </div>

              {/* Side-by-Side Comparison Grid */}
              <div className="repost-compare-grid">
                {/* Left: Original Company Post */}
                <div className="repost-preview-pane">
                  <h4>Original Company Post</h4>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2563eb' }}>
                    {customizingPost.title} ({customizingPost.companyName})
                  </div>
                  <div className="repost-preview-bubble" style={{ background: '#f1f5f9', color: '#475569' }}>
                    {customizingPost.content}
                  </div>
                </div>

                {/* Right: Personalized Draft */}
                <div className="repost-preview-pane" style={{ borderColor: '#93c5fd', background: '#ffffff' }}>
                  <h4>Your Personalized Rebrand</h4>
                  <textarea
                    rows="6"
                    value={customDraft.caption}
                    onChange={(e) => setCustomDraft((p) => ({ ...p, caption: e.target.value }))}
                    style={{ width: '100%', font: 'inherit', fontSize: '0.88rem', padding: '0.75rem', borderRadius: 8, border: '1.5px solid #3b82f6', lineHeight: 1.5, resize: 'vertical' }}
                    placeholder="Edit your personalized caption here..."
                  />
                </div>
              </div>

              {/* Personal Replacement Controls */}
              <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    Swap with Your Personal Promo / Referral Code
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                      <input
                        value={customDraft.customDiscountCode}
                        onChange={(e) => setCustomDraft((p) => ({ ...p, customDiscountCode: e.target.value.toUpperCase() }))}
                        placeholder="e.g. SARAH20"
                        style={{ fontSize: '0.85rem' }}
                      />
                      <button type="button" className="ghost-button" onClick={handleQuickSwapDiscount} style={{ fontSize: '0.8rem' }}>
                        Apply
                      </button>
                    </div>
                  </label>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    Swap Tagged Handles to Your Account
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                      <input
                        value={customDraft.customHandle}
                        onChange={(e) => setCustomDraft((p) => ({ ...p, customHandle: e.target.value }))}
                        placeholder="e.g. @sarah_creator"
                        style={{ fontSize: '0.85rem' }}
                      />
                      <button type="button" className="ghost-button" onClick={handleQuickSwapHandle} style={{ fontSize: '0.8rem' }}>
                        Apply
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              {/* Target Channel Selector */}
              <div>
                <p className="small-title">Publish to Your Personal Connected Channels</p>
                <div className="chip-row">
                  {['instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube'].map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      className={`chip ${customDraft.selectedChannels.includes(ch) ? 'active' : ''}`}
                      onClick={() => toggleChannel(ch)}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="action-row" style={{ marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setCustomizingPost(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleExecuteRepost}
                  style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem' }}
                >
                  🚀 Approve &amp; Post to My Channels
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
