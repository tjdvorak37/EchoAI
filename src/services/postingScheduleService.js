import { isSupabaseConfigured, supabase } from '../lib/supabase'

export const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const DEFAULT_SCHEDULE = {
  weeklyGoal: 10,
  days: {
    sunday: { enabled: false, times: [] },
    monday: { enabled: true, times: ['09:00', '13:00', '17:00'] },
    tuesday: { enabled: true, times: ['09:00', '13:00', '17:00'] },
    wednesday: { enabled: true, times: ['09:00', '13:00', '17:00'] },
    thursday: { enabled: true, times: ['09:00', '13:00', '17:00'] },
    friday: { enabled: true, times: ['09:00', '13:00', '17:00'] },
    saturday: { enabled: false, times: [] },
  },
}

const cloneDefault = () => JSON.parse(JSON.stringify(DEFAULT_SCHEDULE))

const sortTimes = (times) => [...new Set(times)].sort()

const getCurrentUserId = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign in to manage your posting schedule.')
  return data.user.id
}

export const postingScheduleService = {
  async get() {
    if (!isSupabaseConfigured) return cloneDefault()

    const { data, error } = await supabase
      .from('posting_schedules')
      .select('weekly_goal, days')
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return cloneDefault()

    return { weeklyGoal: data.weekly_goal, days: data.days }
  },

  async save({ weeklyGoal, days }) {
    if (!isSupabaseConfigured) return { weeklyGoal, days }

    const userId = await getCurrentUserId()
    const { data, error } = await supabase
      .from('posting_schedules')
      .upsert({ user_id: userId, weekly_goal: weeklyGoal, days, updated_at: new Date().toISOString() })
      .select('weekly_goal, days')
      .single()

    if (error) throw new Error(error.message)
    return { weeklyGoal: data.weekly_goal, days: data.days }
  },

  // Spreads weeklyGoal slots evenly across the currently enabled days,
  // replacing whatever times those days already had.
  generateSlots({ weeklyGoal, days }) {
    const enabledKeys = WEEKDAY_KEYS.filter((key) => days[key]?.enabled)
    if (!enabledKeys.length) return days

    const perDay = Math.max(1, Math.round(weeklyGoal / enabledKeys.length))
    const startHour = 8
    const endHour = 19
    const span = endHour - startHour

    const nextDays = { ...days }
    enabledKeys.forEach((key) => {
      const times = Array.from({ length: perDay }, (_, index) => {
        const hour = startHour + Math.round((span * index) / Math.max(1, perDay - 1 || 1))
        return `${String(Math.min(endHour, hour)).padStart(2, '0')}:00`
      })
      nextDays[key] = { ...nextDays[key], times: sortTimes(times) }
    })
    return nextDays
  },

  addSlot(days, dayKeys, time) {
    const nextDays = { ...days }
    dayKeys.forEach((key) => {
      const existing = nextDays[key] ?? { enabled: true, times: [] }
      nextDays[key] = { enabled: true, times: sortTimes([...existing.times, time]) }
    })
    return nextDays
  },

  removeSlot(days, dayKey, time) {
    return {
      ...days,
      [dayKey]: { ...days[dayKey], times: (days[dayKey]?.times ?? []).filter((t) => t !== time) },
    }
  },

  clearAll(days) {
    return Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, { ...days[key], times: [] }]))
  },

  // Finds the next enabled day/time slot at or after `from` that isn't
  // already used by an existing scheduled post, so back-to-back clicks of
  // "Post to next available slot" fan out instead of colliding.
  getNextAvailableSlot({ days }, scheduledPosts = [], from = new Date()) {
    const takenIso = new Set(
      scheduledPosts
        .filter((post) => post.status === 'scheduled' && post.scheduledAt)
        .map((post) => new Date(post.scheduledAt).toISOString()),
    )

    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const candidateDate = new Date(from)
      candidateDate.setDate(candidateDate.getDate() + dayOffset)
      const dayKey = WEEKDAY_KEYS[candidateDate.getDay()]
      const dayConfig = days[dayKey]
      if (!dayConfig?.enabled || !dayConfig.times?.length) continue

      for (const time of sortTimes(dayConfig.times)) {
        const [hour, minute] = time.split(':').map(Number)
        const slot = new Date(candidateDate)
        slot.setHours(hour, minute, 0, 0)
        if (slot <= from) continue
        if (takenIso.has(slot.toISOString())) continue
        return slot
      }
    }
    return null
  },
}
