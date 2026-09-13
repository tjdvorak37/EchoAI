import { isSupabaseConfigured, supabase } from '../lib/supabase'

const RECORD_TYPES = ['expense', 'payroll', 'tax', 'refund', 'task']
const DEMO_KEY = 'echoai-finance-records-v1'

const demoKey = (companyKey) => `${DEMO_KEY}-${companyKey.trim().toLowerCase()}`

export const financeService = {
  async listRecords(companyKey) {
    if (!companyKey) return {}
    if (!isSupabaseConfigured) {
      try {
        const stored = JSON.parse(localStorage.getItem(demoKey(companyKey)))
        return stored || {}
      } catch {
        return {}
      }
    }
    const { data, error } = await supabase
      .from('finance_records')
      .select('id, record_type, record')
      .eq('company_key', companyKey.trim().toLowerCase())
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data || []).reduce((grouped, row) => {
      if (!grouped[row.record_type]) grouped[row.record_type] = []
      grouped[row.record_type].push({ ...row.record, id: row.record.id || row.id })
      return grouped
    }, {})
  },

  async replaceRecords({ companyKey, userId, type, records }) {
    if (!companyKey) return
    if (!RECORD_TYPES.includes(type)) throw new Error('Unsupported finance record type.')
    const key = companyKey.trim().toLowerCase()
    if (!isSupabaseConfigured) {
      let stored
      try { stored = JSON.parse(localStorage.getItem(demoKey(key))) || {} } catch { stored = {} }
      stored[type] = records
      localStorage.setItem(demoKey(key), JSON.stringify(stored))
      return
    }
    const { error: deleteError } = await supabase
      .from('finance_records')
      .delete()
      .eq('company_key', key)
      .eq('record_type', type)
    if (deleteError) throw new Error(deleteError.message)
    if (!records.length) return
    const rows = records.map((record) => ({
      company_key: key,
      record_type: type,
      record,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('finance_records').insert(rows)
    if (error) throw new Error(error.message)
  },
}
