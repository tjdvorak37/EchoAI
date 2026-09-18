import { isSupabaseConfigured, supabase } from '../lib/supabase'

const invoke = async (body) => {
  if (!isSupabaseConfigured) return body.action === 'status' ? { connections: [] } : { report: { totals: {}, campaigns: [], insights: [] } }
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('Please sign in before managing advertising accounts.')
  const { data, error } = await supabase.functions.invoke('ad-analytics', { headers: { Authorization: `Bearer ${accessToken}` }, body })
  if (error) {
    const detail = await error.context?.json?.().catch(() => null)
    throw new Error(detail?.error || error.message || 'Advertising service is unavailable.')
  }
  return data
}

export const adAnalyticsService = {
  async listConnections() {
    const data = await invoke({ action: 'status' })
    return data.connections || []
  },
  async getReport({ days }) {
    const data = await invoke({ action: 'report', days })
    return data.report || { totals: {}, campaigns: [], insights: [] }
  },
  async connect(provider) {
    const data = await invoke({ action: 'connect', provider })
    if (!data.url) throw new Error('The advertising provider did not return an authorization URL.')
    window.location.assign(data.url)
  },
}