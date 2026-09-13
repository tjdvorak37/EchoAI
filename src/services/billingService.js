import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { getPlan, getPlanPrice } from '../data/plans'

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

  async startCheckout({ plan, billingInterval, email, fullName, referralCode }) {
    const data = await invokeFunction('create-checkout-session', {
      plan,
      billingInterval,
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

  async buyCreditPack(productKey) {
    const data = await invokeFunction('create-credit-checkout', { productKey })
    if (!data?.url) throw new Error('Credit checkout is unavailable right now.')
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

  async getAiDashboard() {
    if (!isSupabaseConfigured) {
      return {
        balance: 500,
        monthlyAllowance: 500,
        periodEnd: null,
        pricing: [
          { capability: 'message', mode: 'standard', botName: 'Echo Copywriter', description: 'Captions, posts, hashtags, and rewrites.', creditCost: 1, unit: 'request' },
          { capability: 'image', mode: 'standard', botName: 'Echo Image Studio', description: 'Campaign image generation.', creditCost: 5, unit: 'image' },
          { capability: 'video', mode: 'standard', botName: 'Echo Video Fast', description: 'Short-form video generation.', creditCost: 60, unit: 'second' },
        ],
        recentJobs: [],
      }
    }

    const [account, pricing, jobs] = await Promise.all([
      supabase.from('echo_credit_accounts').select('balance, monthly_allowance, period_end').maybeSingle(),
      supabase.from('echo_ai_pricing').select('capability, mode, bot_name, bot_description, echo_credit_cost, credit_cost, unit').eq('enabled', true).order('capability'),
      supabase.from('echo_ai_jobs').select('id, capability, mode, credits_reserved, status, created_at').order('created_at', { ascending: false }).limit(6),
    ])
    const failed = [account, pricing, jobs].find((result) => result.error)
    if (failed) throw new Error(failed.error.message)
    return {
      balance: account.data?.balance ?? 0,
      monthlyAllowance: account.data?.monthly_allowance ?? 0,
      periodEnd: account.data?.period_end ?? null,
      pricing: (pricing.data ?? []).map((item) => ({
        capability: item.capability,
        mode: item.mode,
        botName: item.bot_name || item.capability,
        description: item.bot_description || '',
        creditCost: item.echo_credit_cost ?? item.credit_cost ?? 0,
        unit: item.unit || 'request',
      })),
      recentJobs: jobs.data ?? [],
    }
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
      planLabel: getPlan(row.plan).label,
      billingInterval: row.billing_interval ?? 'monthly',
      priceUsd: getPlanPrice(row.plan, row.billing_interval ?? 'monthly'),
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
