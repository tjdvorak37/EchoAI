export const canManageBrandKit = (user) => {
  if (!user?.id) {
    return false
  }

  const role = String(user.role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const accessStatus = String(user.accessStatus ?? user.access_status ?? 'active').toLowerCase()
  return ['admin', 'manager'].includes(role) && !['denied', 'deactivated'].includes(accessStatus)
}