import { useState, useMemo } from 'react'
import { PUBLISHING_PLATFORMS, PUBLISHING_PLATFORM_KEYS } from '../data/socialPlatforms'
import './PostSchedulerPanel.css'

const PLATFORM_LIMITS = Object.fromEntries(
  PUBLISHING_PLATFORMS.map((platform) => [platform.key, platform.characterLimit]),
)

const SCHEDULER_TEMPLATES = [
  {
    key: 'launch',
    title: '🚀 Product Launch Announcement',
    campaign: 'Product Launch Q3',
    message: '🚀 IT IS FINALLY HERE! We are thrilled to officially introduce our newest release. Built from customer feedback to help you achieve more in less time.\n\n👉 Click the link in bio to learn more and claim launch pricing!',
    imageIdea: 'High-contrast product hero shot with vibrant gradient background',
    channels: ['instagram', 'facebook', 'linkedin', 'x'],
  },
  {
    key: 'flash_sale',
    title: '⚡ Weekend Flash Sale',
    campaign: 'Flash Sale Weekend',
    message: '⚡ WEEKEND FLASH SALE! For the next 48 hours only, take 25% OFF everything when you use code FLASH25 at checkout.\n\nDon’t wait — stock is limited! 🛍️',
    imageIdea: 'Bold typography poster featuring "25% OFF" in bright brand colors',
    channels: ['instagram', 'facebook', 'tiktok'],
  },
  {
    key: 'spotlight',
    title: '🌟 Customer Spotlight / Success Story',
    campaign: 'Customer Success',
    message: '🌟 "This completely changed how our team operates." See how our latest case study partner scaled their results by 3x in under 30 days.\n\nRead the full story linked in bio!',
    imageIdea: 'Editorial lifestyle photo of a customer using the product',
    channels: ['linkedin', 'facebook', 'x'],
  },
  {
    key: 'tip',
    title: '💡 Educational Tip / How-To',
    campaign: 'Weekly Education',
    message: '💡 QUICK TIP: Did you know you can streamline your daily workflow in just 3 steps?\n\n1️⃣ Step One\n2️⃣ Step Two\n3️⃣ Step Three\n\nSave this post for later!',
    imageIdea: 'Clean 3-step numbered graphic with minimal layout',
    channels: ['instagram', 'linkedin', 'tiktok'],
  },
]

export function PostSchedulerPanel({
  composer,
  setComposer,
  handleComposerChange,
  handleSchedulePost,
  handlePostNow,
  handleRepostNow,
  handleDeleteScheduledPost,
  scheduledPosts = [],
  connectedAccounts = [],
  workspaceAssets = [],
  handleUploadAsset,
  getPlatformMeta,
  getStatusBadgeClass,
  schedulerError,
}) {
  const [activeTab, setActiveTab] = useState('composer') // 'composer' | 'queue' | 'reposts' | 'templates'
  const [previewPlatform, setPreviewPlatform] = useState('instagram')
  const [showPreflightModal, setShowPreflightModal] = useState(false)
  const [queueSearch, setQueueSearch] = useState('')
  const [queueStatusFilter, setQueueStatusFilter] = useState('all')
  const [queuePlatformFilter, setQueuePlatformFilter] = useState('all')

  const connectedPlatforms = useMemo(
    () => connectedAccounts
      .map((account) => account.platform.toLowerCase())
      .filter((platform) => PUBLISHING_PLATFORM_KEYS.includes(platform)),
    [connectedAccounts]
  )

  const charLimit = PLATFORM_LIMITS[previewPlatform] || 2200
  const charCount = composer.message.length
  const isOverCharLimit = charCount > charLimit

  // Filtered workspace photos & videos
  const availableMediaAssets = useMemo(
    () => workspaceAssets.filter((a) => ['image', 'video'].includes(a.type)),
    [workspaceAssets]
  )

  const attachedAssets = useMemo(
    () => workspaceAssets.filter((a) => composer.mediaAssetIds.includes(a.id)),
    [workspaceAssets, composer.mediaAssetIds]
  )

  // Filtered scheduled posts queue
  const filteredQueue = useMemo(() => {
    return scheduledPosts.filter((post) => {
      const term = queueSearch.trim().toLowerCase()
      const matchesSearch =
        !term ||
        post.campaign?.toLowerCase().includes(term) ||
        post.message?.toLowerCase().includes(term)

      const matchesStatus =
        queueStatusFilter === 'all' || post.status === queueStatusFilter

      const matchesPlatform =
        queuePlatformFilter === 'all' ||
        (post.channels && post.channels.includes(queuePlatformFilter))

      return matchesSearch && matchesStatus && matchesPlatform
    })
  }, [scheduledPosts, queueSearch, queueStatusFilter, queuePlatformFilter])

  const pendingQueueCount = scheduledPosts.filter((p) => p.status === 'scheduled' || p.status === 'pending').length
  const repostablePosts = scheduledPosts.filter((post) => post.status === 'posted' || post.status === 'published')

  const handleScheduleRepost = (post) => {
    setComposer({
      campaign: post.campaign ? `Repost: ${post.campaign}` : 'Repost',
      message: post.message || '',
      imageIdea: post.imageIdea || '',
      scheduledAt: '',
      channels: post.channels || [],
      mediaAssetIds: post.media ? post.media.map((mediaItem) => mediaItem.id).filter(Boolean) : [],
    })
    setActiveTab('composer')
  }

  const handleApplyTemplate = (template) => {
    setComposer((prev) => ({
      ...prev,
      campaign: template.campaign,
      message: template.message,
      imageIdea: template.imageIdea,
      channels: template.channels.filter((ch) => connectedPlatforms.includes(ch)),
    }))
    setActiveTab('composer')
  }

  const handleApplyPresetTiming = (hoursFromNow) => {
    const target = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
    // Format to YYYY-MM-THH:mm for datetime-local input
    const tzOffset = target.getTimezoneOffset() * 60000
    const localIso = new Date(target.getTime() - tzOffset).toISOString().slice(0, 16)
    handleComposerChange('scheduledAt', localIso)
  }

  const toggleChannel = (channelKey) => {
    setComposer((prev) => {
      const exists = prev.channels.includes(channelKey)
      return {
        ...prev,
        channels: exists
          ? prev.channels.filter((c) => c !== channelKey)
          : [...prev.channels, channelKey],
      }
    })
  }

  const handleSelectAllChannels = () => {
    setComposer((prev) => ({
      ...prev,
      channels: [...connectedPlatforms],
    }))
  }

  const handleClearDraft = () => {
    setComposer({
      campaign: '',
      message: '',
      imageIdea: '',
      scheduledAt: '',
      channels: [],
      mediaAssetIds: [],
    })
  }

  const formatScheduleTime = (scheduledIso) => {
    if (!scheduledIso) return 'Not scheduled'
    const date = new Date(scheduledIso)
    if (isNaN(date.getTime())) return 'Not scheduled'
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <section className="panel panel-scheduler">
      <div className="scheduler-master-container">
        {/* Hero Header */}
        <div className="scheduler-hero-bar">
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.45rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>🗓️</span> Multi-Channel Post Scheduler
            </h2>
            <p className="panel-note" style={{ margin: 0, fontSize: '0.86rem' }}>
              Compose once, attach workspace media, preview live platform mockups, and schedule across all your connected channels.
            </p>
          </div>

          <div className="scheduler-hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setActiveTab('composer')}
              style={{ fontSize: '0.85rem' }}
            >
              ✏️ New Post Draft
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setActiveTab('templates')}
              style={{ fontSize: '0.85rem' }}
            >
              💡 Quick Templates
            </button>
          </div>
        </div>

        {/* KPI Scorecards Bar */}
        <div className="scheduler-kpi-grid">
          <div className="scheduler-kpi-card" style={{ borderColor: pendingQueueCount > 0 ? '#fdba74' : '#e2e8f0' }}>
            <span>Queued Posts</span>
            <strong style={{ color: pendingQueueCount > 0 ? '#c2410c' : '#0f172a' }}>{pendingQueueCount}</strong>
            <small>Pending auto-deployment</small>
          </div>

          <div className="scheduler-kpi-card">
            <span>Published Posts</span>
            <strong style={{ color: '#16a34a' }}>
              {scheduledPosts.filter((p) => p.status === 'posted' || p.status === 'published').length}
            </strong>
            <small>Delivered to social feeds</small>
          </div>

          <div className="scheduler-kpi-card">
            <span>Connected Social Accounts</span>
            <strong style={{ color: '#2563eb' }}>{connectedAccounts.length}</strong>
            <small>Active publishing channels</small>
          </div>

          <div className="scheduler-kpi-card">
            <span>Workspace Media Assets</span>
            <strong style={{ color: '#7c3aed' }}>{availableMediaAssets.length}</strong>
            <small>Photos &amp; videos available</small>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="scheduler-nav-tabs">
          {[
            ['composer', '✏️ Post Composer & Live Preview'],
            ['queue', `📋 Scheduled Queue (${pendingQueueCount})`],
            ['reposts', `🔁 Published/Repost Queue (${repostablePosts.length})`],
            ['templates', '💡 Quick Post Templates'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`scheduler-tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {schedulerError && <div className="auth-message auth-error" style={{ padding: '0.75rem 1rem', borderRadius: 8 }}>{schedulerError}</div>}

        {/* ── TAB 1: COMPOSER & LIVE PREVIEW ── */}
        {activeTab === 'composer' && (
          <div className="scheduler-composer-layout">
            {/* Left: Interactive Composer Form */}
            <div className="scheduler-composer-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Draft New Campaign Post</h3>
                <button
                  type="button"
                  className="text-button"
                  onClick={handleClearDraft}
                  style={{ fontSize: '0.8rem' }}
                >
                  🧹 Clear Draft
                </button>
              </div>

              {/* Campaign Title */}
              <label>
                Campaign / Reference Title <small style={{ color: '#64748b', fontWeight: 500 }}>(Optional)</small>
                <input
                  type="text"
                  value={composer.campaign}
                  onChange={(e) => handleComposerChange('campaign', e.target.value)}
                  placeholder="e.g. Summer Flyer Promotion"
                />
              </label>

              {/* Caption & Character Count */}
              <label>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Post Caption <small style={{ color: '#64748b', fontWeight: 500 }}>(Optional if Flyer/Video attached)</small></span>
                  <span style={{ fontSize: '0.76rem', color: isOverCharLimit ? '#dc2626' : '#64748b', fontWeight: isOverCharLimit ? 800 : 600 }}>
                    {charCount} / {charLimit} chars ({previewPlatform})
                  </span>
                </span>
                <textarea
                  rows="4"
                  value={composer.message}
                  onChange={(e) => handleComposerChange('message', e.target.value)}
                  placeholder="Type post caption or hashtags (or leave blank if your flyer image already contains all text)..."
                  style={{ borderColor: isOverCharLimit ? '#fca5a5' : undefined }}
                />
              </label>

              {/* Quick Hashtag / Emoji Shortcuts */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '-0.3rem' }}>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ fontSize: '0.76rem', padding: '0.25rem 0.55rem' }}
                  onClick={() => setComposer((p) => ({ ...p, message: `${p.message}\n\n#marketing #growth #socialmedia #contentcreator` }))}
                >
                  #Add Marketing Hashtags
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ fontSize: '0.76rem', padding: '0.25rem 0.55rem' }}
                  onClick={() => setComposer((p) => ({ ...p, message: `${p.message} 🚀✨👇` }))}
                >
                  😀 Add Emojis
                </button>
              </div>

              {/* Visual Prompt / Image Brief */}
              <label>
                Flyer Brief / Visual Direction <small style={{ color: '#64748b', fontWeight: 500 }}>(Optional)</small>
                <input
                  type="text"
                  value={composer.imageIdea}
                  onChange={(e) => handleComposerChange('imageIdea', e.target.value)}
                  placeholder="e.g. Product flyer with bold typography and warm sunset tones"
                />
              </label>

              {/* Workspace Media Selection & Upload */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <p className="small-title" style={{ margin: 0 }}>Attach Workspace Photos &amp; Videos</p>
                  <label htmlFor="scheduler-media-upload" className="primary-button" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem', cursor: 'pointer' }}>
                    📤 Upload New Media
                  </label>
                  <input
                    id="scheduler-media-upload"
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleUploadAsset}
                    style={{ display: 'none' }}
                  />
                </div>

                <div className="chip-row" style={{ marginTop: '0.5rem' }}>
                  {availableMediaAssets.map((asset) => {
                    const isAttached = composer.mediaAssetIds.includes(asset.id)
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={`chip ${isAttached ? 'active' : ''}`}
                        onClick={() =>
                          setComposer((prev) => ({
                            ...prev,
                            mediaAssetIds: isAttached
                              ? prev.mediaAssetIds.filter((id) => id !== asset.id)
                              : [...prev.mediaAssetIds, asset.id],
                          }))
                        }
                      >
                        {isAttached ? '✓ ' : ''}{asset.type === 'video' ? '🎬 Video' : '🖼️ Image'}: {asset.name}
                      </button>
                    )
                  })}
                  {availableMediaAssets.length === 0 && (
                    <span className="muted" style={{ fontSize: '0.82rem' }}>No workspace media uploaded yet. Use Upload above to add photos or videos.</span>
                  )}
                </div>

                {/* Attached Thumbnail Gallery */}
                {attachedAssets.length > 0 && (
                  <div className="attached-media-grid">
                    {attachedAssets.map((asset) => (
                      <div key={asset.id} className="attached-thumb-card">
                        {asset.type === 'video' ? (
                          <video src={asset.previewUrl} />
                        ) : (
                          <img src={asset.previewUrl} alt={asset.name} />
                        )}
                        <span className="attached-thumb-type-tag">{asset.type}</span>
                        <button
                          type="button"
                          className="attached-thumb-remove"
                          onClick={() =>
                            setComposer((prev) => ({
                              ...prev,
                              mediaAssetIds: prev.mediaAssetIds.filter((id) => id !== asset.id),
                            }))
                          }
                          title="Remove media attachment"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Publish Channels Selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <p className="small-title" style={{ margin: 0 }}>Select Publish Channels</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={handleSelectAllChannels}
                    style={{ fontSize: '0.78rem' }}
                  >
                    Select All Connected
                  </button>
                </div>

                {connectedAccounts.length === 0 ? (
                  <p className="muted" style={{ fontSize: '0.84rem' }}>
                    No channels connected. Go to <strong>Integrations</strong> to link your social accounts.
                  </p>
                ) : (
                  <div className="chip-row">
                    {connectedAccounts.map((account) => {
                      const meta = getPlatformMeta(account.platform)
                      const key = account.platform.toLowerCase()
                      const active = composer.channels.includes(key)
                      return (
                        <button
                          key={account.id}
                          type="button"
                          className={`chip ${active ? 'active' : ''}`}
                          style={active ? { borderColor: meta.color, color: meta.color, background: meta.bg } : {}}
                          onClick={() => toggleChannel(key)}
                        >
                          <span>{meta.icon}</span> {meta.label} ({account.accountName})
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Deployment Datetime & Quick Presets */}
              <div>
                <label>
                  Deployment Target Date &amp; Time
                  <input
                    type="datetime-local"
                    value={composer.scheduledAt}
                    onChange={(e) => handleComposerChange('scheduledAt', e.target.value)}
                  />
                </label>

                <div className="timing-presets-grid" style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="timing-preset-btn" onClick={() => handleApplyPresetTiming(3)}>
                    🌆 Tonight (in 3 hrs)
                  </button>
                  <button type="button" className="timing-preset-btn" onClick={() => handleApplyPresetTiming(18)}>
                    ☀️ Tomorrow 9:00 AM
                  </button>
                  <button type="button" className="timing-preset-btn" onClick={() => handleApplyPresetTiming(48)}>
                    🚀 In 2 Days
                  </button>
                  <button type="button" className="timing-preset-btn" onClick={() => handleApplyPresetTiming(120)}>
                    🎯 Next Week
                  </button>
                </div>
              </div>

              {/* Post Action Buttons */}
              <div className="composer-actions" style={{ marginTop: '0.85rem' }}>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowPreflightModal(true)}
                  style={{ padding: '0.65rem 1rem', fontSize: '0.9rem' }}
                >
                  👁️ Full Post Inspection
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handlePostNow}
                  style={{ padding: '0.65rem 1.25rem', fontSize: '0.92rem' }}
                >
                  ⚡ Post Now (Instant)
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSchedulePost}
                  style={{ padding: '0.65rem 1.25rem', fontSize: '0.92rem', background: '#ea580c' }}
                >
                  📅 Queue Post
                </button>
              </div>
            </div>

            {/* Right: Live Social Platform Preview Card */}
            <div className="scheduler-preview-card">
              <div>
                <span className="section-label">Live Platform Mockup</span>
                <h3 style={{ margin: '0.2rem 0', fontSize: '1.1rem' }}>Real-Time Social Preview</h3>
                <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                  Switch channels to preview how your caption, hashtags, and flyer media render.
                </p>
              </div>

              <div className="preview-platform-selector">
                {PUBLISHING_PLATFORMS.map((platform) => (
                  <button
                    key={platform.key}
                    type="button"
                    className={`preview-platform-btn ${previewPlatform === platform.key ? 'active' : ''}`}
                    onClick={() => setPreviewPlatform(platform.key)}
                  >
                    {platform.icon} {platform.label}
                  </button>
                ))}
              </div>

              {/* Social Post Mockup Card */}
              <div className="social-post-mockup">
                <div className="mockup-user-bar">
                  <div className="mockup-avatar">
                    {previewPlatform.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.88rem', display: 'block', color: '#0f172a' }}>
                      {connectedAccounts.find((a) => a.platform.toLowerCase() === previewPlatform)?.accountName || 'Your Brand Account'}
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                      {getPlatformMeta(previewPlatform)?.label} • Sponsored / Organic
                    </span>
                  </div>
                </div>

                {/* Media Preview Box */}
                {attachedAssets.length > 0 ? (
                  <div className="mockup-media-container">
                    {attachedAssets[0].type === 'video' ? (
                      <video src={attachedAssets[0].previewUrl} controls />
                    ) : (
                      <img src={attachedAssets[0].previewUrl} alt="Preview" />
                    )}
                  </div>
                ) : composer.imageIdea ? (
                  <div className="mockup-media-container" style={{ background: '#f1f5f9', color: '#64748b', flexDirection: 'column', gap: '0.4rem', padding: '1.5rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '1.5rem' }}>🖼️</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>[Visual Brief: {composer.imageIdea}]</span>
                  </div>
                ) : null}

                {/* Caption Text */}
                <div className="mockup-caption-box">
                  {composer.message ? (
                    composer.message
                  ) : attachedAssets.length > 0 ? (
                    <em style={{ color: '#64748b', fontStyle: 'italic' }}>🖼️ Image Flyer Post (No caption text attached — flyer contains all info)</em>
                  ) : (
                    <em style={{ color: '#94a3b8' }}>Your post caption will appear here as you type...</em>
                  )}
                </div>

                <div className="mockup-footer-actions">
                  <span>❤️ Like</span>
                  <span>💬 Comment</span>
                  <span>🔄 Repost</span>
                  <span>✈️ Share</span>
                </div>
              </div>

              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowPreflightModal(true)}
                style={{ width: '100%', fontSize: '0.85rem' }}
              >
                🔍 Inspect Pre-Queue Details
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 2: SCHEDULED QUEUE STREAM ── */}
        {activeTab === 'queue' && (
          <div style={{ display: 'grid', gap: '1.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Scheduled Post Queue</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                  Manage upcoming scheduled posts, countdowns, and deployment statuses.
                </p>
              </div>
              <span className="badge info">{filteredQueue.length} posts matching</span>
            </div>

            {/* Queue Filter Controls */}
            <div className="listening-filter-row">
              <label>
                Status
                <select value={queueStatusFilter} onChange={(e) => setQueueStatusFilter(e.target.value)}>
                  <option value="all">All Statuses</option>
                  <option value="scheduled">Scheduled / Pending</option>
                  <option value="posted">Posted / Published</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label>
                Platform
                <select value={queuePlatformFilter} onChange={(e) => setQueuePlatformFilter(e.target.value)}>
                  <option value="all">All Platforms</option>
                  {connectedPlatforms.map((p) => (
                    <option key={p} value={p}>{getPlatformMeta(p)?.label || p}</option>
                  ))}
                </select>
              </label>
              <label>
                Search Queue
                <input
                  type="text"
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  placeholder="Search campaign name or message..."
                />
              </label>
            </div>

            {filteredQueue.length === 0 ? (
              <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📭</span>
                <strong>No Posts Found in Scheduled Queue</strong>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>Use the Post Composer tab to create and queue your first campaign post.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {filteredQueue.map((post) => {
                  const mediaItem = post.media && post.media.length > 0 ? post.media[0] : null
                  const scheduledTimeLabel = formatScheduleTime(post.scheduledAt)
                  const isScheduled = post.status === 'scheduled' || post.status === 'pending'

                  return (
                    <div key={post.id} className="scheduled-card">
                      <div className="scheduled-card-header">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{post.campaign || 'Campaign Post'}</strong>
                            <span className="badge pending" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5' }}>
                              ⏱️ {scheduledTimeLabel}
                            </span>
                          </div>
                          <small style={{ color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
                            Scheduled for: {new Date(post.scheduledAt).toLocaleString()}
                          </small>
                        </div>

                        <span className={getStatusBadgeClass(isScheduled ? 'pending' : post.status)}>
                          {post.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="scheduled-card-body">
                        {mediaItem && (
                          <div className="scheduled-card-media-preview">
                            {mediaItem.type === 'video' ? (
                              <video src={mediaItem.previewUrl} />
                            ) : (
                              <img src={mediaItem.previewUrl} alt="Attached Media" />
                            )}
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {post.message}
                          </p>
                          {post.imageIdea && (
                            <small style={{ color: '#64748b', display: 'block', marginTop: '0.35rem' }}>
                              Visual Brief: {post.imageIdea}
                            </small>
                          )}
                        </div>
                      </div>

                      <div className="scheduled-card-footer">
                        <div className="chip-row">
                          {(post.channels || []).map((ch) => (
                            <span key={ch} className="badge info">{getPlatformMeta(ch)?.label || ch}</span>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
                              setComposer({
                                campaign: post.campaign || '',
                                message: post.message || '',
                                imageIdea: post.imageIdea || '',
                                scheduledAt: post.scheduledAt || '',
                                channels: post.channels || [],
                                mediaAssetIds: post.media ? post.media.map((m) => m.id) : [],
                              })
                              setActiveTab('composer')
                            }}
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                          >
                            ✏️ Edit in Composer
                          </button>

                          {isScheduled && (
                            <button
                              type="button"
                              className="danger-button"
                              onClick={() => handleDeleteScheduledPost(post)}
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reposts' && (
          <div style={{ display: 'grid', gap: '1.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Published Repost Queue</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                  Reuse previous flyers, posts, and published content without rebuilding the campaign from scratch.
                </p>
              </div>
              <span className="badge info">{repostablePosts.length} repost-ready</span>
            </div>

            {repostablePosts.length === 0 ? (
              <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🔁</span>
                <strong>No Published Posts Ready for Repost</strong>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>Posts appear here after they are published from the scheduler.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {repostablePosts.map((post) => {
                  const mediaItem = post.media && post.media.length > 0 ? post.media[0] : null

                  return (
                    <div key={post.id} className="scheduled-card">
                      <div className="scheduled-card-header">
                        <div>
                          <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{post.campaign || 'Published Post'}</strong>
                          <small style={{ color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
                            Published: {formatScheduleTime(post.scheduledAt)}
                          </small>
                        </div>
                        <span className={getStatusBadgeClass(post.status)}>{post.status.toUpperCase()}</span>
                      </div>

                      <div className="scheduled-card-body">
                        {mediaItem && (
                          <div className="scheduled-card-media-preview">
                            {mediaItem.type === 'video' ? (
                              <video src={mediaItem.previewUrl} />
                            ) : (
                              <img src={mediaItem.previewUrl} alt="Repost media" />
                            )}
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {post.message || 'Media-only post'}
                          </p>
                          {post.imageIdea && (
                            <small style={{ color: '#64748b', display: 'block', marginTop: '0.35rem' }}>
                              Visual Brief: {post.imageIdea}
                            </small>
                          )}
                        </div>
                      </div>

                      <div className="scheduled-card-footer">
                        <div className="chip-row">
                          {(post.channels || []).map((ch) => (
                            <span key={ch} className="badge info">{getPlatformMeta(ch)?.label || ch}</span>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => handleRepostNow?.(post)}
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                          >
                            ⚡ Repost now
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleScheduleRepost(post)}
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                          >
                            📅 Schedule repost
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: QUICK POST TEMPLATES ── */}
        {activeTab === 'templates' && (
          <div style={{ display: 'grid', gap: '1.15rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>High-Converting Post Templates</h3>
              <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.84rem' }}>
                Select a template to prefill the composer with proven campaign copy and visual direction.
              </p>
            </div>

            <div className="templates-grid">
              {SCHEDULER_TEMPLATES.map((tmpl) => (
                <div key={tmpl.key} className="template-card">
                  <div>
                    <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', color: '#0f172a' }}>{tmpl.title}</h4>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                      {tmpl.message}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => handleApplyTemplate(tmpl)}
                    style={{ fontSize: '0.84rem', padding: '0.45rem 0.85rem' }}
                  >
                    ⚡ Load Template into Composer
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MODAL: PRE-QUEUE FULL POST INSPECTION ── */}
        {showPreflightModal && (
          <div
            className="modal-overlay"
            role="presentation"
            onClick={() => setShowPreflightModal(false)}
          >
            <div
              className="repost-customizer-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Pre-Queue Post Inspection"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="section-label">Pre-Deployment Verification</span>
                  <h3 style={{ margin: '0.2rem 0', fontSize: '1.25rem', color: '#0f172a' }}>
                    👁️ Full Post Pre-Queue Inspection
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: '0.84rem' }}>
                    Review how your flyer, caption, target accounts, and timing look before confirming.
                  </p>
                </div>
                <button
                  type="button"
                  className="credit-modal-close"
                  onClick={() => setShowPreflightModal(false)}
                >
                  ✕
                </button>
              </div>

              {/* Pre-Flight Inspection Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.15rem' }}>
                {/* Media & Caption Preview */}
                <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase' }}>Flyer / Media Attachment</h4>
                  {attachedAssets.length > 0 ? (
                    <div style={{ width: '100%', maxHeight: 200, borderRadius: 8, overflow: 'hidden', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {attachedAssets[0].type === 'video' ? (
                        <video src={attachedAssets[0].previewUrl} controls style={{ maxHeight: 200 }} />
                      ) : (
                        <img src={attachedAssets[0].previewUrl} alt="Attached Flyer" style={{ maxHeight: 200, objectFit: 'contain' }} />
                      )}
                    </div>
                  ) : (
                    <div style={{ background: '#f1f5f9', border: '1px dashed #cbd5e1', borderRadius: 8, padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                      No media attached. Post will deploy as text-only.
                    </div>
                  )}

                  <h4 style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase' }}>Post Caption / Copy</h4>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.75rem 0.85rem', fontSize: '0.88rem', color: '#0f172a', whiteSpace: 'pre-wrap', minHeight: 80 }}>
                    {composer.message ? composer.message : <em style={{ color: '#64748b' }}>🖼️ Image Flyer Post (No caption text attached — flyer contains all info)</em>}
                  </div>
                </div>

                {/* Target Channels & Timing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase' }}>Target Social Accounts ({composer.channels.length})</h4>
                    {composer.channels.length === 0 ? (
                      <span className="badge risk">⚠️ No publishing channels selected!</span>
                    ) : (
                      <div className="chip-row">
                        {composer.channels.map((ch) => (
                          <span key={ch} className="badge info" style={{ padding: '0.3rem 0.6rem', fontSize: '0.82rem' }}>
                            {getPlatformMeta(ch)?.icon} {getPlatformMeta(ch)?.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase' }}>Deployment Schedule</h4>
                    {composer.scheduledAt ? (
                      <div>
                        <strong style={{ fontSize: '1.05rem', color: '#ea580c', display: 'block' }}>
                          📅 {new Date(composer.scheduledAt).toLocaleString()}
                        </strong>
                        <small style={{ color: '#64748b' }}>Local browser time zone</small>
                      </div>
                    ) : (
                      <div>
                        <strong style={{ fontSize: '1.05rem', color: '#2563eb', display: 'block' }}>
                          ⚡ Instant Post Now
                        </strong>
                        <small style={{ color: '#64748b' }}>Will dispatch immediately upon confirmation</small>
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#1e40af' }}>
                    <strong>✅ Ready to Confirm?</strong>
                    <div>Once confirmed, your campaign post will enter your active publishing queue.</div>
                  </div>
                </div>
              </div>

              {/* Modal Confirmation Actions */}
              <div className="action-row" style={{ marginTop: '0.5rem', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowPreflightModal(false)}
                >
                  Back to Editing
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={(e) => {
                    setShowPreflightModal(false)
                    if (composer.scheduledAt) {
                      handleSchedulePost(e)
                    } else {
                      handlePostNow(e)
                    }
                  }}
                  disabled={!composer.channels.length}
                  style={{ padding: '0.65rem 1.35rem', fontSize: '0.92rem', background: composer.scheduledAt ? '#ea580c' : '#2563eb' }}
                >
                  {composer.scheduledAt ? '📅 Confirm & Queue Post' : '⚡ Confirm & Post Now'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
