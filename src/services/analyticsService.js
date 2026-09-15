import { isSupabaseConfigured, supabase } from '../lib/supabase'

const DAYS_MS = 24 * 60 * 60 * 1000

const normalizeEvent = (record) => ({
  id: record.id,
  userId: record.user_id,
  companyKey: record.company_key || '',
  role: record.role || 'user',
  eventType: record.event_type,
  eventName: record.event_name,
  route: record.route || '',
  metadata: record.metadata || {},
  occurredAt: record.occurred_at,
})

const countBy = (items, getKey) => items.reduce((counts, item) => {
  const key = getKey(item) || 'Unknown'
  counts[key] = (counts[key] || 0) + 1
  return counts
}, {})

const topCounts = (counts, limit = 8) => Object.entries(counts)
  .map(([label, count]) => ({ label, count }))
  .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  .slice(0, limit)

const averageDays = (values) => {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export const analyticsService = {
  async trackEvent({ session, eventType, eventName, route = '', metadata = {} }) {
    if (!isSupabaseConfigured || !session?.id || !eventType || !eventName) return

    await supabase.from('app_analytics_events').insert({
      user_id: session.id,
      company_key: session.company || '',
      role: session.role || 'user',
      event_type: eventType,
      event_name: eventName,
      route,
      metadata,
    })
  },

  async getSummary({ days = 90 } = {}) {
    const since = new Date(Date.now() - days * DAYS_MS).toISOString()
    if (!isSupabaseConfigured) {
      return {
        events: [],
        topTools: [],
        navigation: [],
        roles: [],
        retention: { activeCustomers: 0, deactivatedCustomers: 0, averageCustomerAgeDays: 0 },
        exits: [],
      }
    }

    const [{ data: eventRows, error: eventsError }, { data: profiles, error: profilesError }, { data: exits, error: exitsError }] = await Promise.all([
      supabase
        .from('app_analytics_events')
        .select('*')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, role, access_status, created_at')
        .in('role', ['user']),
      supabase
        .from('customer_exit_feedback')
        .select('reason, competitor, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
    ])

    if (eventsError) throw new Error(eventsError.message)
    if (profilesError) throw new Error(profilesError.message)
    if (exitsError) throw new Error(exitsError.message)

    const events = (eventRows || []).map(normalizeEvent)
    const customerProfiles = profiles || []
    const activeCustomers = customerProfiles.filter((profile) => profile.access_status !== 'deactivated')
    const deactivatedCustomers = customerProfiles.filter((profile) => profile.access_status === 'deactivated')
    const customerAges = customerProfiles
      .map((profile) => profile.created_at ? Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / DAYS_MS)) : 0)
      .filter((daysActive) => daysActive > 0)

    return {
      events,
      topTools: topCounts(countBy(events.filter((event) => event.eventType === 'navigation'), (event) => event.eventName)),
      navigation: topCounts(countBy(events, (event) => event.route || event.eventName)),
      roles: topCounts(countBy(events, (event) => event.role)),
      retention: {
        activeCustomers: activeCustomers.length,
        deactivatedCustomers: deactivatedCustomers.length,
        averageCustomerAgeDays: averageDays(customerAges),
      },
      exits: topCounts(countBy(exits || [], (exit) => exit.reason || (exit.competitor ? 'Cheaper competitor' : 'Unknown')), 6),
    }
  },
}