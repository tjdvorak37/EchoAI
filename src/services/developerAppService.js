import { supabase } from '../lib/supabase'

export const developerAppService = {
  async list() {
    const { data, error } = await supabase.functions.invoke('developer-app-config', { method: 'GET' })
    if (error) throw new Error(error.message)
    return data ?? { providers: [], records: [], canEdit: false }
  },

  async save(record) {
    const { data, error } = await supabase.functions.invoke('developer-app-config', {
      body: record,
    })
    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || error.message)
    }
    return data.record
  },
}