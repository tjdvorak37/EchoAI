import { isSupabaseConfigured, supabase } from '../lib/supabase'

export const boardMemberService = {
  async getSummary(companyKey) {
    if (!isSupabaseConfigured || !companyKey) return null
    const { data, error } = await supabase.rpc('board_member_financial_summary', { p_company_key: companyKey })
    if (error) throw new Error(error.message)
    return data
  },
}
