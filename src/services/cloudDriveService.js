import { isSupabaseConfigured, supabase } from '../lib/supabase'

export const CLOUD_PROVIDERS = {
  microsoft: { key: 'microsoft', label: 'OneDrive / SharePoint', icon: '🗂️' },
  google: { key: 'google', label: 'Google Drive', icon: '📁' },
}

const invoke = async (body) => {
  const { data, error } = await supabase.functions.invoke('cloud-drive', { body })

  if (error) {
    const detail = await error.context?.json?.().catch(() => null)
    throw new Error(detail?.error || error.message || 'Cloud drive request failed.')
  }

  return data
}

// Linked files point at the customer's own drive. Size is recorded for display
// only; nothing is stored by EchoAI, so these never count against the quota.
export const toLinkedAsset = ({ item, provider, folderId }) => ({
  id: `linked_${provider}_${item.id}`,
  name: item.name,
  type: item.mimeType?.startsWith('video/')
    ? 'video'
    : item.mimeType?.startsWith('image/')
      ? 'image'
      : 'document',
  mime: item.mimeType || 'application/octet-stream',
  size: item.size || 0,
  folderId,
  createdAt: new Date().toISOString(),
  previewUrl: item.thumbnailUrl || item.downloadUrl || '',
  linked: true,
  provider,
  externalId: item.id,
  webUrl: item.webUrl || '',
  summary: `Linked from ${CLOUD_PROVIDERS[provider]?.label ?? provider}`,
})

export const cloudDriveService = {
  isAvailable: isSupabaseConfigured,

  async listConnections() {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase.rpc('my_cloud_connections')
    if (error) throw new Error(error.message)

    return (data ?? []).map((row) => ({
      provider: row.provider,
      accountEmail: row.account_email,
      connectedAt: row.connected_at,
    }))
  },

  async connect(provider) {
    const data = await invoke({ action: 'connect', provider })
    if (!data?.url) throw new Error('Could not start the connection.')
    window.location.assign(data.url)
  },

  async disconnect(provider) {
    const { error } = await supabase.rpc('disconnect_cloud_provider', { p_provider: provider })
    if (error) throw new Error(error.message)
  },

  async listFiles({ provider, folderId = '', search = '', siteId = '' }) {
    const data = await invoke({ action: 'list', provider, folderId, search, siteId })
    return data?.items ?? []
  },

  async listCalendarEvents({ timeMin, timeMax }) {
    const data = await invoke({
      action: 'calendar',
      provider: 'google',
      timeMin,
      timeMax,
    })
    return data?.events ?? []
  },

  async listSharePointSites() {
    const data = await invoke({ action: 'sites', provider: 'microsoft' })
    return data?.sites ?? []
  },

  async resolveFileUrl({ provider, fileId }) {
    return invoke({ action: 'link', provider, fileId })
  },
}
