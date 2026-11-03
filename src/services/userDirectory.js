const DAY_MS = 24 * 60 * 60 * 1000

export const USER_GROUPS = [
  { id: 'all', label: 'All users' },
  { id: 'new', label: 'New (under 7 days)' },
  { id: 'returning', label: 'Returning (repeat sign-ins)' },
  { id: 'long_term', label: 'Long-term (90+ days)' },
  { id: 'existing', label: 'Established (7-89 days)' },
  { id: 'unknown', label: 'Signup date unknown' },
]

const timestamp = (value) => value ? Date.parse(value) : NaN

export function getUserTenure(member, now = Date.now()) {
  const created = timestamp(member.createdAt)
  if (!Number.isFinite(created) || created > now) return 'unknown'
  const age = now - created
  if (age < 7 * DAY_MS) return 'new'
  return age >= 90 * DAY_MS ? 'long_term' : 'existing'
}

export const isReturningUser = (member) => member.signInCount >= 2

export function matchesUserGroup(member, group, now = Date.now()) {
  if (group === 'all') return true
  if (group === 'returning') return isReturningUser(member)
  return getUserTenure(member, now) === group
}

export const matchesBetaFilter = (member, filter) => (
  filter === 'all' || (member.isBetaTester === true ? 'beta' : 'standard') === filter
)

export function compareDirectoryUsers(left, right, sort) {
  if (['newest', 'oldest', 'last-sign-in'].includes(sort)) {
    const field = sort === 'last-sign-in' ? 'lastSignInAt' : 'createdAt'
    const a = timestamp(left[field])
    const b = timestamp(right[field])
    if (!Number.isFinite(a)) return Number.isFinite(b) ? 1 : 0
    if (!Number.isFinite(b)) return -1
    return sort === 'oldest' ? a - b : b - a
  }
  const field = sort === 'email-asc' ? 'email' : sort === 'company-asc' ? 'company' : 'fullName'
  const order = (left[field] || '').localeCompare(right[field] || '')
  return sort === 'name-desc' ? -order : order
}
