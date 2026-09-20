import { isSupabaseConfigured, supabase } from '../lib/supabase'

const invoke = async (body) => {
  if (!isSupabaseConfigured) return body.action === 'status' ? { connections: [] } : { report: { totals: {}, campaigns: [], insights: [] } }
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('Please sign in before managing advertising accounts.')
  const { data, error } = await supabase.functions.invoke('ad-analytics', { headers: { Authorization: `Bearer ${accessToken}` }, body })
  if (error) {
    const detail = await error.context?.json?.().catch(() => null)
    const message = detail?.error || error.message || 'Advertising service is unavailable.'
    if (/failed to send a request|function.*not found|404/i.test(message)) {
      return { unavailable: true, message: 'Ads setup is not deployed yet. Ask your IT team to deploy the ad-analytics Edge Function and its database migration.' }
    }
    throw new Error(message)
  }
  return data
}

export const adAnalyticsService = {
  async listConnections() {
    const data = await invoke({ action: 'status' })
    return { connections: data.connections || [], unavailable: data.unavailable, message: data.message }
  },
  async getReport({ days }) {
    const data = await invoke({ action: 'report', days })
    return { report: data.report || { totals: {}, campaigns: [], insights: [] }, unavailable: data.unavailable, message: data.message }
  },
  async connect(provider) {
    const data = await invoke({ action: 'connect', provider })
    if (!data.url) throw new Error('The advertising provider did not return an authorization URL.')
    window.location.assign(data.url)
  },
}