import { isSupabaseConfigured, supabase } from '../lib/supabase'

const PLAN_PRICE_USD = { monthly: 15, annual: 120 }
const ENTITLED_STATUSES = ['active', 'trialing', 'past_due']

const invokeFunction = async (name, body) => {
  const { data, error } = await supabase.functions.invoke(name, { body })

  if (error) {
    // Edge functions return { error } payloads alongside non-2xx responses.
    const detail = await error.context?.json?.().catch(() => null)
    throw new Error(detail?.error || error.message || 'Billing request failed.')
  }

  return data
}

export const billingService = {
  // True when billing runs against Stripe + Supabase rather than local demo state.
  isLive: isSupabaseConfigured,

  async startCheckout({ plan, email, fullName, referralCode }) {
    const data = await invokeFunction('create-checkout-session', {
      plan,
      email,
      fullName,
      referralCode,
    })

    if (!data?.url) {
      throw new Error('Checkout is unavailable right now. Please try again.')
    }

    window.location.assign(data.url)
    return data.url
  },

  async openBillingPortal() {
    const data = await invokeFunction('billing-portal', {})

    if (!data?.url) {
      throw new Error('The billing portal is unavailable right now.')
    }

    window.location.assign(data.url)
    return data.url
  },

  async redeemPromoCode({ code, email }) {
    const { data, error } = await supabase.rpc('redeem_promo_code', {
      p_code: code,
      p_email: email ?? null,
    })

    if (error) {
      throw new Error(error.message)
    }

    return data
  },

  async getMyEntitlement() {
    if (!isSupabaseConfigured) {
      return { entitled: true, status: 'demo' }
    }

    const { data, error } = await supabase.rpc('my_entitlement')

    if (error) {
      throw new Error(error.message)
    }

    return data ?? { entitled: false, status: 'none' }
  },

  async getReferralSummary() {
    if (!isSupabaseConfigured) {
      return { code: 'ECHO-DEMO01', converted: 0, rewardsGranted: 0, rewardsPending: 0 }
    }

    // Issues the caller's code on first use, then reads their totals.
    const { error: codeError } = await supabase.rpc('my_referral_code')
    if (codeError) throw new Error(codeError.message)

    const { data, error } = await supabase.rpc('my_referral_summary')
    if (error) throw new Error(error.message)

    return data
  },

  referralLink(code) {
    return code ? `${window.location.origin}/?ref=${encodeURIComponent(code)}` : ''
  },

  // Admin/finance reads. RLS limits these to staff roles.
  async listSubscriptions() {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.email,
      userFullName: row.email,
      plan: row.plan,
      priceUsd: PLAN_PRICE_USD[row.plan] ?? 0,
      storageLimitGb: row.storage_limit_gb,
      status: row.status,
      provider: row.provider,
      purchasedAt: row.created_at,
      expiresAt: row.current_period_end,
      gracePeriodEndsAt: row.grace_period_ends_at,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      paymentConfirmed: ENTITLED_STATUSES.includes(row.status),
      notes: row.provider === 'promo' ? 'Activated by promo code' : '',
    }))
  },

  async listPayments() {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('billing_payments')
      .select('*')
      .order('paid_at', { ascending: false })

    if (error) throw new Error(error.message)

    return (data ?? []).map((row) => ({
      id: row.id,
      licenseId: row.stripe_subscription_id,
      userEmail: row.email,
      userFullName: row.email,
      plan: row.plan,
      amountUsd: Number(row.amount_usd) || 0,
      method: row.method,
      status: row.status,
      paidAt: row.paid_at,
    }))
  },
}
