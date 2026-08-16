import { isSupabaseConfigured, supabase } from '../lib/supabase'

const normalizeAccount = (record) => ({
  id: record.id,
  platform: record.platform,
  accountName: record.account_name,
  accountType: record.account_type,
  publishingScopes: record.publishing_scopes ?? [],
  status: record.connection_status === 'oauth_connected' ? 'healthy' : 'oauth required',
  connectionStatus: record.connection_status,
})

export const socialIntegrationService = {
  async getPlatformReadiness() {
    if (!isSupabaseConfigured) return []

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) {
      throw new Error('Please sign in before loading social integration status.')
    }

    const { data, error } = await supabase.functions.invoke('social-oauth', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'status' },
    })
    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || error.message || 'Unable to load integration readiness.')
    }
    return data?.platforms ?? []
  },

  async listAccounts() {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('user_social_accounts')
      .select('*')
      .order('platform')

    if (error) throw new Error(error.message)
    return (data ?? []).map(normalizeAccount)
  },

  async saveAccount({ platform, accountName, accountType, publishingScopes }) {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('user_social_accounts')
      .upsert({
        platform,
        account_name: accountName.trim(),
        account_type: accountType,
        publishing_scopes: publishingScopes,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return normalizeAccount(data)
  },

  async removeAccount(accountId) {
    if (!isSupabaseConfigured) return

    const { error } = await supabase
      .from('user_social_accounts')
      .delete()
      .eq('id', accountId)

    if (error) throw new Error(error.message)
  },

  async connectAccount({ platform, requestedScopes }) {
    if (!isSupabaseConfigured) {
      throw new Error('Social authorization requires the live Supabase environment.')
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) {
      throw new Error('Please sign in before connecting a social account.')
    }

    const { data, error } = await supabase.functions.invoke('social-oauth', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'connect', platform, requestedScopes },
    })

    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || error.message || 'Unable to start social authorization.')
    }
    if (!data?.url) throw new Error('The social provider did not return an authorization URL.')

    window.location.assign(data.url)
  },
}