import { isSupabaseConfigured, supabase } from '../lib/supabase'

export const boardPayoutService = {
  async list(companyKey, ownOnly = false) {
    if (!isSupabaseConfigured || !companyKey) return []
    let query = supabase.from('board_profit_payouts').select('*').eq('company_key', companyKey.trim().toLowerCase()).order('quarter_end', { ascending: false })
    if (ownOnly) query = query.eq('board_member_id', (await supabase.auth.getUser()).data.user?.id)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data || []
  },

  async create(payload) {
    if (!isSupabaseConfigured) return payload
    const { data, error } = await supabase.rpc('create_board_profit_payout', {
      p_company_key: payload.companyKey,
      p_board_member_id: payload.boardMemberId,
      p_quarter_start: payload.quarterStart,
      p_quarter_end: payload.quarterEnd,
      p_profit_after_expenses: Number(payload.profitAfterExpenses),
      p_active_subscription_count: Number(payload.activeSubscriptionCount),
      p_notes: payload.notes || '',
    })
    if (error) throw new Error(error.message)
    return data
  },

  async markPaid(id) {
    const { data, error } = await supabase.rpc('mark_board_profit_payout_paid', { p_payout_id: id })
    if (error) throw new Error(error.message)
    return data
  },
}
