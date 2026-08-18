import { isSupabaseConfigured, supabase } from '../lib/supabase'

const DEMO_KEY = 'echoai-platform-announcements'

export const DEFAULT_ANNOUNCEMENTS = {
  landing: {
    id: 'landing',
    message: 'This application is currently in Beta Testing, if you purchase a subscription please report all bugs and issues to the Support Team as we are actively working through the problems. Expected launch date 9/15/2026 Thanks',
    enabled: true,
    scrolling: true,
    updatedAt: 'default',
  },
  application: {
    id: 'application',
    message: '',
    enabled: false,
    scrolling: true,
    updatedAt: 'default',
  },
}

const normalize = (record) => ({
  id: record.id,
  message: record.message ?? '',
  enabled: Boolean(record.enabled),
  scrolling: Boolean(record.scrolling),
  updatedAt: record.updated_at ?? record.updatedAt ?? 'default',
})

const readDemoAnnouncements = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(DEMO_KEY))
    const legacyLandingMessage = localStorage.getItem('echoai-landing-announcement')
    return Object.values(DEFAULT_ANNOUNCEMENTS).map((notice) => normalize({
      ...notice,
      ...(notice.id === 'landing' && legacyLandingMessage ? { message: legacyLandingMessage } : {}),
      ...stored?.[notice.id],
    }))
  } catch {
    return Object.values(DEFAULT_ANNOUNCEMENTS)
  }
}

export const announcementService = {
  async list() {
    if (!isSupabaseConfigured) return readDemoAnnouncements()

    const { data, error } = await supabase
      .from('platform_announcements')
      .select('id, message, enabled, scrolling, updated_at')

    if (error) throw new Error(error.message)
    return (data ?? []).map(normalize)
  },

  async save({ id, message, enabled, scrolling }) {
    const payload = {
      id,
      message: message.trim(),
      enabled: Boolean(enabled),
      scrolling: Boolean(scrolling),
    }

    if (!isSupabaseConfigured) {
      const notices = Object.fromEntries(readDemoAnnouncements().map((notice) => [notice.id, notice]))
      const saved = { ...payload, updatedAt: new Date().toISOString() }
      localStorage.setItem(DEMO_KEY, JSON.stringify({ ...notices, [id]: saved }))
      return saved
    }

    const { data, error } = await supabase.rpc('save_platform_announcement', {
      p_id: payload.id,
      p_message: payload.message,
      p_enabled: payload.enabled,
      p_scrolling: payload.scrolling,
    })

    if (error) throw new Error(error.message)
    return normalize(data)
  },
}