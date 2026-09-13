import { isSupabaseConfigured, supabase } from '../lib/supabase'

const DEMO_KEY = 'echoai-trademark-workspace-v1'

export const trademarkService = {
  async load(companyKey) {
    if (!companyKey) return null
    if (!isSupabaseConfigured) {
      try { return JSON.parse(localStorage.getItem(`${DEMO_KEY}-${companyKey}`)) } catch { return null }
    }

    const { data, error } = await supabase
      .from('trademark_workspaces')
      .select('document')
      .eq('company_key', companyKey.trim().toLowerCase())
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.document ?? null
  },

  async save({ companyKey, companyName, document, userId, canEdit }) {
    if (!companyKey) throw new Error('A company is required for the legal workspace.')
    if (!canEdit) throw new Error('Trademark editing access is required.')
    const key = companyKey.trim().toLowerCase()
    if (!isSupabaseConfigured) {
      localStorage.setItem(`${DEMO_KEY}-${key}`, JSON.stringify(document))
      return document
    }

    const { data, error } = await supabase
      .from('trademark_workspaces')
      .upsert({ company_key: key, company_name: companyName || companyKey, document, updated_by: userId, updated_at: new Date().toISOString() })
      .select('document')
      .single()
    if (error) throw new Error(error.message)
    return data.document
  },
}