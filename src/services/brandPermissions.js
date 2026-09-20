export const canManageBrandKit = (user) => {
  if (!user?.id) {
    return false
  }

  const role = String(user.role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const accessStatus = String(user.accessStatus ?? user.access_status ?? 'active').toLowerCase()
  return ['admin', 'super_admin', 'manager', 'it'].includes(role) && !['denied', 'deactivated'].includes(accessStatus)
}