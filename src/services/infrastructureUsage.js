const GB = 1_000_000_000
export const PLAN_LIMITS = {
  free: { database: 500_000_000, storage: GB, supabase_egress: 5 * GB, supabase_cached_egress: 5 * GB, supabase_functions: 500_000, supabase_mau: 50_000, upload: 50_000_000 },
  pro: { database: 8 * GB, storage: 100 * GB, supabase_egress: 250 * GB, supabase_cached_egress: 250 * GB, supabase_functions: 2_000_000, supabase_mau: 100_000, upload: 2_000_000_000 },
}

export function providerAllowance(metric, settings) {
  if (metric.id.startsWith('aws_')) {
    return settings.aws_plan === 'free' ? metric.allowance : null
  }
  return PLAN_LIMITS[settings.supabase_plan]?.[metric.id] ?? null
}

export const PROVIDER_METRICS = [
  { id: 'supabase_egress', label: 'Supabase uncached transfer', unit: 'GB', multiplier: GB },
  { id: 'supabase_cached_egress', label: 'Supabase cached transfer', unit: 'GB', multiplier: GB },
  { id: 'supabase_functions', label: 'Supabase function invocations', unit: 'calls', multiplier: 1 },
  { id: 'supabase_mau', label: 'Supabase monthly active users', unit: 'users', multiplier: 1 },
  { id: 'aws_transfer', label: 'Amplify data served', unit: 'GB', multiplier: GB, allowance: 15 * GB },
  { id: 'aws_build_minutes', label: 'Amplify standard build minutes', unit: 'minutes', multiplier: 1, allowance: 1000 },
  { id: 'aws_storage', label: 'Amplify CDN storage', unit: 'GB', multiplier: GB, allowance: 5 * GB },
]

export const ACTIVITY_METRICS = [
  ['created_post', 'Posts created'],
  ['published_video', 'Video posts published'],
  ['published_image', 'Image posts published'],
  ['published_text', 'Text-only posts published'],
  ['uploaded_video', 'Videos uploaded'],
  ['uploaded_image', 'Images uploaded'],
  ['uploaded_other', 'Other files uploaded'],
  ['ai_completed_video', 'AI video jobs completed'],
  ['ai_completed_image', 'AI image jobs completed'],
  ['ai_completed_image_edit', 'AI image edits completed'],
  ['ai_completed_message', 'AI text jobs completed'],
  ['ai_completed_campaign', 'AI campaign jobs completed'],
  ['ai_completed_audio', 'AI audio jobs completed'],
  ['ai_completed_vision', 'AI vision jobs completed'],
  ['ai_completed_moderation', 'AI moderation jobs completed'],
  ['ai_failed', 'AI failed / refunded jobs'],
]

export function capacityStatus(used, limit) {
  if (!Number.isFinite(used) || used < 0 || !Number.isFinite(limit) || limit <= 0) {
    return { level: 'unknown', label: 'Not connected', percent: null }
  }
  const percent = used / limit * 100
  if (percent >= 90) return { level: 'danger', label: percent >= 100 ? 'Limit reached / upgrade needed' : 'Very close / upgrade needed', percent }
  if (percent >= 70) return { level: 'warning', label: 'Warning / plan upgrade', percent }
  return { level: 'good', label: 'Good to go', percent }
}

export function formatBytes(value) {
  if (!Number.isFinite(Number(value)) || value === null) return 'Unknown'
  const bytes = Number(value)
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(1)} KB`
  return `${bytes} B`
}

export function readingStatus(reading, now = new Date()) {
  if (!reading) return 'Not connected'
  const measured = new Date(reading.measured_at).getTime()
  if (reading.value === null || !Number.isFinite(Number(reading.value)) || Number(reading.value) < 0
    || !Number.isFinite(measured)) return 'Invalid reading'
  if (measured - now.getTime() > 60_000) return 'Reading timestamp is in the future'
  const today = now.toISOString().slice(0, 10)
  if (reading.period_start > today || reading.period_end < today) return 'Outside current billing period'
  if (now.getTime() - measured > 86400000) return 'Stale reading (over 24 hours)'
  return 'Manual provider reading'
}

export function projectMonthlyUsage(reading, now = new Date()) {
  if (!reading || readingStatus(reading, now) !== 'Manual provider reading') return null
  const start = new Date(`${reading.period_start}T00:00:00Z`).getTime()
  const end = new Date(`${reading.period_end}T00:00:00Z`).getTime() + 86400000
  const measured = new Date(reading.measured_at).getTime()
  if (measured - start < 86400000 || measured > end) return null
  return Number(reading.value) * (end - start) / (measured - start)
}

export function growthForecast(snapshots, field, limit) {
  if (snapshots.length < 2) return null
  const first = snapshots[0]
  const last = snapshots.at(-1)
  const days = (new Date(last.day) - new Date(first.day)) / 86400000
  const rate = (Number(last[field]) - Number(first[field])) / days
  if (days < 1 || !Number.isFinite(rate) || rate <= 0) return null
  return { dailyBytes: rate, daysToWarning: Math.max(0, Math.ceil((limit * 0.7 - Number(last[field])) / rate)), sampleDays: days }
}

export async function callInfrastructureRpc(client, name, args) {
  if (!client) throw new Error('Supabase is not configured. Connect a project to view infrastructure usage.')
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`Infrastructure usage: ${error.message}. Ensure the infrastructure migration is deployed and your account has Administrator or IT access.`)
  return data
}
