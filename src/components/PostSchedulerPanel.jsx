import { useRef, useState, useMemo } from 'react'
import { PUBLISHING_PLATFORMS, PUBLISHING_PLATFORM_KEYS, SOCIAL_PLATFORMS } from '../data/socialPlatforms'
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

const EMOJI_GROUPS = [
  { label: 'Smileys', emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🤑 🤠' },
  { label: 'Gestures', emojis: '👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤝 🙏 👏 🙌 👐 🤲 💪 🫶 👀 👁️ 👄 💋' },
  { label: 'People', emojis: '👶 🧒 👦 👧 🧑 👱 👨 🧔 👨‍🦰 👩 👩‍🦰 🧓 👴 👵 🙋 💁 🙆 🙅 🤷 🤦 🧘 🏃 🚶 💃 🕺 👯 🧚 🧜 🧞 🧙 🦸 🦹' },
  { label: 'Hearts', emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💌 💋 💯 💢 💥 💫 💦 💨' },
  { label: 'Celebration', emojis: '🎉 🎊 🎈 🎁 🎂 🥳 🎆 🎇 ✨ 🌟 ⭐ 🌠 🔥 🚀 💫 🪩 🎵 🎶 🏆 🥇 🥈 🥉 🎯 💎 👑' },
  { label: 'Nature', emojis: '🌞 🌝 🌛 🌜 🌚 🌈 ☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 🌊 🌸 🌺 🌻 🌹 🌷 🌼 🍀 🌿 🌱 🌴 🌵 🍁 🍂 🍃' },
  { label: 'Food', emojis: '🍎 🍏 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🍍 🥝 🥑 🍅 🥕 🌽 🍔 🍟 🍕 🌭 🌮 🌯 🍿 🍩 🍪 🎂 🍰 🍫 🍭 ☕ 🧋 🍺 🍷' },
  { label: 'Activities', emojis: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🪀 🏓 🏸 🥊 🏋️ 🏄 🚴 🏊 🎮 🎲 🧩 🎨 🎤 🎧 🎸 🎹 📸' },
  { label: 'Objects', emojis: '✅ ❌ ❗ ❓ ⁉️ ⚠️ 💡 🔔 🔒 🔑 📌 📍 ✏️ 📝 📅 📣 📢 💬 📈 📊 💰 💳 📱 💻 🖥️ 📧 🔗' },
  { label: 'Animals', emojis: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦄 🐝 🦋 🐢 🐳 🐬 🦈 🦋' },
]

const EMOJIS = EMOJI_GROUPS.map((group) => ({
  ...group,
  items: group.emojis.split(' '),
}))

export function PostSchedulerPanel({
  composer,
  setComposer,
  handleComposerChange,
  handleSchedulePost,
  handlePostNow,
  handlePostToNextSlot,
  handleRepostNow,
  handleDeleteScheduledPost,
  handleReschedulePost,
  scheduledPosts = [],
  connectedAccounts = [],
  workspaceAssets = [],
  onUploadAsset,
  getPlatformMeta,
  getStatusBadgeClass,
  schedulerError,
}) {
  const [activeTab, setActiveTab] = useState('composer') // 'composer' | 'calendar' | 'queue' | 'reposts' | 'templates'
  const [previewPlatform, setPreviewPlatform] = useState('instagram')
  const [showPreflightModal, setShowPreflightModal] = useState(false)
  const [queueSearch, setQueueSearch] = useState('')
  const [queueStatusFilter, setQueueStatusFilter] = useState('all')
  const [queuePlatformFilter, setQueuePlatformFilter] = useState('all')
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) })
  const [calendarFilterPlatform, setCalendarFilterPlatform] = useState('all')
  const [calendarFilterAccountId, setCalendarFilterAccountId] = useState('all')
  const [calendarSelectedDay, setCalendarSelectedDay] = useState('')
  const [dragPostId, setDragPostId] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [emojiSearch, setEmojiSearch] = useState('')
  const messageInputRef = useRef(null)
  const messageSelectionRef = useRef({ start: 0, end: 0 })

  const connectedPlatforms = useMemo(
    () => connectedAccounts
      .map((account) => account.platform.toLowerCase())
      .filter((platform) => PUBLISHING_PLATFORM_KEYS.includes(platform)),
    [connectedAccounts]
  )

  // Distinct platforms available for the "Facebook only / TikTok only / all socials" filter.
  const calendarPlatformOptions = useMemo(
    () => [...new Set(connectedPlatforms)],
    [connectedPlatforms]
  )

  // Accounts for the currently selected platform filter, used for the secondary
  // account picker when a platform has more than one connected account.
  const calendarAccountOptions = useMemo(
    () => calendarFilterPlatform === 'all'
      ? []
      : connectedAccounts.filter((account) => account.platform.toLowerCase() === calendarFilterPlatform),
    [connectedAccounts, calendarFilterPlatform]
  )

  const dayKey = (value) => {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  // One occurrence per matching channel so a multi-channel post can show a
  // colored chip for each platform it targets, and so single-platform filters
  // only surface the channel that matches.
  const calendarOccurrences = useMemo(() => {
    const resolvePostAccountId = (post, channel) =>
      post.channelAccounts?.[channel]
      ?? connectedAccounts.find((account) => account.platform.toLowerCase() === channel)?.id
      ?? ''

    const occurrences = []
    scheduledPosts.forEach((post) => {
      if (!post.scheduledAt) return
      const channels = post.channels ?? []
      channels.forEach((channel) => {
        const key = channel.toLowerCase()
        if (calendarFilterPlatform !== 'all' && key !== calendarFilterPlatform) return
        const accountId = resolvePostAccountId(post, key)
        if (calendarFilterPlatform !== 'all' && calendarFilterAccountId !== 'all' && accountId !== calendarFilterAccountId) return
        occurrences.push({ id: `${post.id}-${key}`, post, channel: key, accountId })
      })
    })
    return occurrences
  }, [scheduledPosts, calendarFilterPlatform, calendarFilterAccountId, connectedAccounts])

  const calendarByDay = useMemo(() => {
    const map = new Map()
    calendarOccurrences.forEach((occurrence) => {
      const key = dayKey(occurrence.post.scheduledAt)
      if (!key) return
      map.set(key, [...(map.get(key) ?? []), occurrence])
    })
    return map
  }, [calendarOccurrences])

  const calendarGrid = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const cursor = new Date(first)
    cursor.setDate(cursor.getDate() - cursor.getDay())
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(cursor)
      date.setDate(cursor.getDate() + index)
      return date
    })
  }, [calendarMonth])

  const handleCalendarDrop = (targetDate) => {
    if (!dragPostId) return
    const post = scheduledPosts.find((item) => item.id === dragPostId)
    setDragPostId('')
    if (!post || post.status !== 'scheduled') return
    const original = new Date(post.scheduledAt)
    if (Number.isNaN(original.getTime())) return
    const next = new Date(targetDate)
    next.setHours(original.getHours(), original.getMinutes(), original.getSeconds(), 0)
    handleReschedulePost?.(post, next.toISOString())
  }

  const charLimit = PLATFORM_LIMITS[previewPlatform] || 2200
  const charCount = composer.message.length
  const isOverCharLimit = charCount > charLimit

  const visibleEmojiGroups = useMemo(() => {
    const search = emojiSearch.trim().toLowerCase()
    if (!search) return EMOJIS
    return EMOJIS
      .map((group) => ({ ...group, items: group.label.toLowerCase().includes(search) ? group.items : group.items.filter((emoji) => emoji.includes(search)) }))
      .filter((group) => group.items.length > 0)
  }, [emojiSearch])

  const rememberMessageSelection = () => {
    const input = messageInputRef.current
    if (!input) return
    messageSelectionRef.current = {
      start: input.selectionStart ?? composer.message.length,
      end: input.selectionEnd ?? composer.message.length,
    }
  }

  const insertEmoji = (emoji) => {
    const { start, end } = messageSelectionRef.current
    const message = composer.message
    const nextMessage = `${message.slice(0, start)}${emoji}${message.slice(end)}`
    const nextCursor = start + emoji.length
    handleComposerChange('message', nextMessage)
    setEmojiPickerOpen(false)
    window.requestAnimationFrame(() => {
      const input = messageInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(nextCursor, nextCursor)
      messageSelectionRef.current = { start: nextCursor, end: nextCursor }
    })
  }

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
      channelAccounts: post.channelAccounts || {},
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

  const toggleChannel = (channelKey, accountId) => {
    setComposer((prev) => {
      const exists = prev.channels.includes(channelKey)
      const currentAccountId = prev.channelAccounts?.[channelKey]
      const switchingAccount = accountId && currentAccountId && currentAccountId !== accountId

      // Clicking a different account chip for an already-selected platform
      // switches which connected account that platform targets, rather than
      // turning the platform off.
      if (exists && !switchingAccount) {
        const nextAccounts = { ...(prev.channelAccounts || {}) }
        delete nextAccounts[channelKey]
        return {
          ...prev,
          channels: prev.channels.filter((c) => c !== channelKey),
          channelAccounts: nextAccounts,
        }
      }

      return {
        ...prev,
        channels: exists ? prev.channels : [...prev.channels, channelKey],
        channelAccounts: accountId
          ? { ...(prev.channelAccounts || {}), [channelKey]: accountId }
          : (prev.channelAccounts || {}),
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
      channelAccounts: {},
      mediaAssetIds: [],
    })
  }

  const toggleMediaAsset = (assetId) => {
    setComposer((prev) => {
      const selected = prev.mediaAssetIds || []
      return {
        ...prev,
        mediaAssetIds: selected.includes(assetId)
          ? selected.filter((id) => id !== assetId)
          : [...selected, assetId],
      }
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
              <span>🗓️</span> Queue Studio
            </h2>
            <p className="panel-note" style={{ margin: 0, fontSize: '0.86rem' }}>
              Shape one piece of content, tailor it by channel, and place it on your campaign timeline.
            </p>
          </div>

          <div className="scheduler-hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setActiveTab('composer')}
              style={{ fontSize: '0.85rem' }}
            >
              ✏️ Start a draft
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setActiveTab('templates')}
              style={{ fontSize: '0.85rem' }}
            >
              💡 Draft starters
            </button>
          </div>
        </div>

        {/* KPI Scorecards Bar */}
        <div className="scheduler-kpi-grid">
          <div className="scheduler-kpi-card" style={{ borderColor: pendingQueueCount > 0 ? 'rgba(49, 94, 231, 0.25)' : 'var(--border)' }}>
            <span>Queued Posts</span>
            <strong style={{ color: pendingQueueCount > 0 ? 'var(--primary-strong)' : 'var(--text)' }}>{pendingQueueCount}</strong>
            <small>Pending auto-deployment</small>
          </div>

          <div className="scheduler-kpi-card">
            <span>Published Posts</span>
            <strong style={{ color: 'var(--success)' }}>
              {scheduledPosts.filter((p) => p.status === 'posted' || p.status === 'published').length}
            </strong>
            <small>Delivered to social feeds</small>
          </div>

          <div className="scheduler-kpi-card">
            <span>Connected Social Accounts</span>
            <strong style={{ color: 'var(--primary)' }}>{connectedAccounts.length}</strong>
            <small>Active publishing channels</small>
          </div>

        </div>

        {/* Navigation Tabs */}
        <nav className="scheduler-nav-tabs">
          {[
            ['composer', '✏️ Post Composer & Live Preview'],
            ['calendar', '🗓️ Content Calendar'],
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
                  ref={messageInputRef}
                  rows="4"
                  value={composer.message}
                  onChange={(e) => handleComposerChange('message', e.target.value)}
                  onSelect={rememberMessageSelection}
                  onClick={rememberMessageSelection}
                  onKeyUp={rememberMessageSelection}
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
                <div className="emoji-picker-wrap">
                  <button
                    type="button"
                    className="ghost-button"
                    style={{ fontSize: '0.76rem', padding: '0.25rem 0.55rem' }}
                    aria-expanded={emojiPickerOpen}
                    aria-haspopup="dialog"
                    onMouseDown={rememberMessageSelection}
                    onClick={() => setEmojiPickerOpen((open) => !open)}
                  >
                    😀 Choose Emoji
                  </button>
                  {emojiPickerOpen && (
                    <div className="emoji-picker" role="dialog" aria-label="Choose an emoji">
                      <div className="emoji-picker-header">
                        <strong>Choose an emoji</strong>
                        <button type="button" className="emoji-picker-close" onClick={() => setEmojiPickerOpen(false)} aria-label="Close emoji picker">×</button>
                      </div>
                      <input
                        type="search"
                        value={emojiSearch}
                        onChange={(event) => setEmojiSearch(event.target.value)}
                        placeholder="Search by category"
                        aria-label="Search emoji categories"
                      />
                      <div className="emoji-picker-body">
                        {visibleEmojiGroups.map((group) => (
                          <section key={group.label} className="emoji-group">
                            <p>{group.label}</p>
                            <div className="emoji-grid">
                              {group.items.map((emoji, index) => (
                                <button
                                  key={`${group.label}-${emoji}-${index}`}
                                  type="button"
                                  className="emoji-option"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => insertEmoji(emoji)}
                                  aria-label={`Insert ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </section>
                        ))}
                        {!visibleEmojiGroups.length && <p className="emoji-empty">No emoji category found.</p>}
                      </div>
                    </div>
                  )}
                </div>
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

              <div className="scheduler-media-picker">
                <div className="scheduler-media-picker-header">
                  <div>
                    <p className="small-title" style={{ margin: 0 }}>Post Image / Media</p>
                    <small style={{ color: '#64748b' }}>Choose media from your workspace or upload a new file.</small>
                  </div>
                  <label className="ghost-button scheduler-upload-button">
                    Add image/media
                    <input type="file" accept="image/*,video/*" onChange={onUploadAsset} />
                  </label>
                </div>
                {workspaceAssets.filter((asset) => ['image', 'video'].includes(asset.type)).length > 0 ? (
                  <div className="scheduler-media-grid">
                    {workspaceAssets.filter((asset) => ['image', 'video'].includes(asset.type)).slice(0, 12).map((asset) => {
                      const selected = (composer.mediaAssetIds || []).includes(asset.id)
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          className={`scheduler-media-option ${selected ? 'selected' : ''}`}
                          onClick={() => toggleMediaAsset(asset.id)}
                          aria-pressed={selected}
                          title={asset.name}
                        >
                          {asset.type === 'video' ? <video src={asset.previewUrl} muted /> : <img src={asset.previewUrl} alt={asset.name} />}
                          <span>{selected ? 'Selected' : 'Use media'}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="muted" style={{ margin: '0.6rem 0 0', fontSize: '0.82rem' }}>No images or videos in your workspace yet.</p>
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
                      // When several accounts share a platform (managing more than one
                      // brand/client), only the chip for the currently targeted account
                      // shows as active; clicking another account's chip retargets it.
                      const active = composer.channels.includes(key)
                        && (composer.channelAccounts?.[key] ?? account.id) === account.id
                      return (
                        <button
                          key={account.id}
                          type="button"
                          className={`chip ${active ? 'active' : ''}`}
                          style={active ? { borderColor: meta.color, color: meta.color, background: meta.bg } : {}}
                          onClick={() => toggleChannel(key, account.id)}
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
                  style={{ padding: '0.65rem 1.25rem', fontSize: '0.92rem', background: 'linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)' }}
                >
                  📅 Queue Post
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handlePostToNextSlot}
                  title="Uses your recurring posting schedule from Account > Posting schedule"
                  style={{ padding: '0.65rem 1.25rem', fontSize: '0.92rem' }}
                >
                  ⏭️ Post to Next Available Slot
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
                {SOCIAL_PLATFORMS.map((platform) => (
                  <button
                    key={platform.key}
                    type="button"
                    className={`preview-platform-btn ${previewPlatform === platform.key ? 'active' : ''}`}
                    onClick={() => setPreviewPlatform(platform.key)}
                    title={platform.releaseStatus === 'available' ? `Preview for ${platform.label}` : `${platform.label} is available for preview while publishing is in development.`}
                  >
                    {platform.icon} {platform.label}{platform.releaseStatus !== 'available' ? ' (preview)' : ''}
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

                {composer.imageIdea ? (
                  <div className="mockup-media-container" style={{ background: '#f1f5f9', color: '#64748b', flexDirection: 'column', gap: '0.4rem', padding: '1.5rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '1.5rem' }}>🖼️</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>[Visual Brief: {composer.imageIdea}]</span>
                  </div>
                ) : null}

                {/* Caption Text */}
                <div className="mockup-caption-box">
                  {composer.message ? (
                    composer.message
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

        {/* ── TAB: FULL-SIZE CONTENT CALENDAR ── */}
        {activeTab === 'calendar' && (
          <div className="calendar-tab">
            <div className="calendar-tab-toolbar">
              <div className="calendar-tab-nav">
                <button type="button" className="ghost-button" onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
                <h3>{calendarMonth.toLocaleString(undefined, { month: 'long' })} {calendarMonth.getFullYear()}</h3>
                <button type="button" className="ghost-button" onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month">›</button>
                <button type="button" className="text-button" onClick={() => setCalendarMonth(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) })}>Today</button>
              </div>

              <div className="calendar-tab-filters">
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip ${calendarFilterPlatform === 'all' ? 'active' : ''}`}
                    onClick={() => { setCalendarFilterPlatform('all'); setCalendarFilterAccountId('all') }}
                  >
                    All socials
                  </button>
                  {calendarPlatformOptions.map((platform) => {
                    const meta = getPlatformMeta(platform)
                    const active = calendarFilterPlatform === platform
                    return (
                      <button
                        key={platform}
                        type="button"
                        className={`chip ${active ? 'active' : ''}`}
                        style={active ? { borderColor: meta.color, color: meta.color, background: meta.bg } : {}}
                        onClick={() => { setCalendarFilterPlatform(platform); setCalendarFilterAccountId('all') }}
                      >
                        <span>{meta.icon}</span> {meta.label} only
                      </button>
                    )
                  })}
                </div>

                {calendarAccountOptions.length > 1 && (
                  <label className="calendar-account-filter">
                    Account
                    <select value={calendarFilterAccountId} onChange={(event) => setCalendarFilterAccountId(event.target.value)}>
                      <option value="all">All {getPlatformMeta(calendarFilterPlatform).label} accounts</option>
                      {calendarAccountOptions.map((account) => (
                        <option key={account.id} value={account.id}>{account.accountName}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            <div className="calendar-tab-weekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
            </div>

            <div className="calendar-tab-grid">
              {calendarGrid.map((date) => {
                const key = dayKey(date)
                const occurrences = calendarByDay.get(key) ?? []
                const outside = date.getMonth() !== calendarMonth.getMonth()
                const isToday = key === dayKey(new Date())
                return (
                  <div
                    key={key}
                    className={`calendar-tab-day ${outside ? 'is-outside' : ''} ${isToday ? 'is-today' : ''} ${calendarSelectedDay === key ? 'is-selected' : ''}`}
                    onClick={() => setCalendarSelectedDay(key)}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
                    onDrop={(event) => { event.preventDefault(); handleCalendarDrop(date) }}
                  >
                    <span className="calendar-tab-day-number">{date.getDate()}</span>
                    <div className="calendar-tab-day-events">
                      {occurrences.slice(0, 4).map((occurrence) => {
                        const meta = getPlatformMeta(occurrence.channel)
                        return (
                          <div
                            key={occurrence.id}
                            className="calendar-tab-event"
                            style={{ background: meta.bg, color: meta.color, borderLeftColor: meta.color }}
                            draggable={occurrence.post.status === 'scheduled'}
                            onDragStart={(event) => { event.stopPropagation(); setDragPostId(occurrence.post.id) }}
                            onClick={(event) => event.stopPropagation()}
                            title={`${occurrence.post.campaign || occurrence.post.message || 'Post'} · ${meta.label}`}
                          >
                            <span className="calendar-tab-event-time">
                              {new Date(occurrence.post.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </span>
                            <span className="calendar-tab-event-title">{meta.icon} {occurrence.post.campaign || occurrence.post.message || 'Post'}</span>
                          </div>
                        )
                      })}
                      {occurrences.length > 4 && <span className="calendar-tab-more">+{occurrences.length - 4} more</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {calendarSelectedDay && (
              <div className="calendar-tab-agenda">
                <h4>
                  {new Date(`${calendarSelectedDay}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </h4>
                {(calendarByDay.get(calendarSelectedDay) ?? []).length === 0 ? (
                  <p className="muted">Nothing scheduled. Drag a post here or create one in the composer.</p>
                ) : (
                  (calendarByDay.get(calendarSelectedDay) ?? []).map((occurrence) => {
                    const meta = getPlatformMeta(occurrence.channel)
                    return (
                      <div key={occurrence.id} className="calendar-tab-agenda-row" style={{ borderLeftColor: meta.color }}>
                        <span className="calendar-tab-event-time">
                          {new Date(occurrence.post.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <div>
                          <strong>{occurrence.post.campaign || 'Post'}</strong>
                          <small>{meta.icon} {meta.label}{occurrence.post.channelAccounts?.[occurrence.channel] ? ` · ${connectedAccounts.find((a) => a.id === occurrence.accountId)?.accountName ?? ''}` : ''}</small>
                        </div>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setComposer({
                              campaign: occurrence.post.campaign || '',
                              message: occurrence.post.message || '',
                              imageIdea: occurrence.post.imageIdea || '',
                              scheduledAt: occurrence.post.scheduledAt || '',
                              channels: occurrence.post.channels || [],
                              channelAccounts: occurrence.post.channelAccounts || {},
                              mediaAssetIds: occurrence.post.media ? occurrence.post.media.map((m) => m.id) : [],
                            })
                            setActiveTab('composer')
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            )}
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
                                channelAccounts: post.channelAccounts || {},
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
                <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase' }}>Post Caption / Copy</h4>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.75rem 0.85rem', fontSize: '0.88rem', color: '#0f172a', whiteSpace: 'pre-wrap', minHeight: 80 }}>
                    {composer.message || <em style={{ color: '#64748b' }}>No caption has been added.</em>}
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
                        <strong style={{ fontSize: '1.05rem', color: 'var(--primary)', display: 'block' }}>
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
                  style={{ padding: '0.65rem 1.35rem', fontSize: '0.92rem', background: composer.scheduledAt ? 'var(--primary)' : 'var(--primary)' }}
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
