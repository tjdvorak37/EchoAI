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
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('board_profit_payouts').insert({
      company_key: payload.companyKey.trim().toLowerCase(),
      board_member_id: payload.boardMemberId,
      quarter_start: payload.quarterStart,
      quarter_end: payload.quarterEnd,
      profit_after_expenses: Number(payload.profitAfterExpenses),
      active_subscription_count: Number(payload.activeSubscriptionCount),
      share_percent: Number(payload.sharePercent),
      payout_amount: Number(payload.payoutAmount),
      created_by: userData.user?.id,
    }).select('*').single()
    if (error) throw new Error(error.message)
    return data
  },

  async markPaid(id) {
    const { data, error } = await supabase.from('board_profit_payouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    return data
  },
}
