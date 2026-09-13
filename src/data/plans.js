// Single source of truth for subscription tiers.
// Anything that prices, displays, or enforces a plan reads from here so the
// checkout, the database, and the storage limit can never disagree.

export const ANNUAL_DISCOUNT = 0.15

export const PLANS = {
  standard: {
    key: 'standard',
    label: 'Standard',
    storageGb: 2,
    monthlyPrice: 30,
    annualPrice: 306,
    includedAiCredits: 500,
    aiCreditValueUsd: 15,
    tagline: 'Everything in EchoAI with room for day-to-day campaign work.',
  },
  storage_plus: {
    key: 'storage_plus',
    label: 'Storage +',
    storageGb: 10,
    monthlyPrice: 33,
    annualPrice: 337,
    includedAiCredits: 800,
    aiCreditValueUsd: 15,
    tagline: 'Five times the space for teams building a steady content library.',
  },
  storage_pro: {
    key: 'storage_pro',
    label: 'Storage Pro',
    storageGb: 25,
    monthlyPrice: 37,
    annualPrice: 377,
    includedAiCredits: 1500,
    aiCreditValueUsd: 15,
    tagline: 'For regular video work and multi-brand asset archives.',
    popular: true,
  },
  storage_max: {
    key: 'storage_max',
    label: 'Storage Max',
    storageGb: 50,
    monthlyPrice: 42,
    annualPrice: 428,
    includedAiCredits: 2500,
    aiCreditValueUsd: 15,
    tagline: 'Heavy production schedules with long-form video and raw footage.',
  },
  creator: {
    key: 'creator',
    label: 'Creator',
    storageGb: 100,
    monthlyPrice: 50,
    annualPrice: 510,
    includedAiCredits: 4000,
    aiCreditValueUsd: 15,
    tagline: 'Maximum headroom for agencies and full-time creator studios.',
  },
}

export const PLAN_ORDER = ['standard', 'storage_plus', 'storage_pro', 'storage_max', 'creator']

export const BILLING_INTERVALS = {
  monthly: { label: 'Monthly', suffix: '/ month' },
  annual: { label: 'Annual', suffix: '/ year' },
}

export const getPlan = (planKey) => PLANS[planKey] ?? PLANS.standard

export const getPlanPrice = (planKey, interval) => {
  const plan = getPlan(planKey)
  return interval === 'annual' ? plan.annualPrice : plan.monthlyPrice
}

// What a plan is worth per month, used for MRR and referral credits.
export const getMonthlyEquivalent = (planKey, interval) => {
  const plan = getPlan(planKey)
  return interval === 'annual'
    ? Math.round((plan.annualPrice / 12) * 100) / 100
    : plan.monthlyPrice
}

export const getAnnualSavings = (planKey) => {
  const plan = getPlan(planKey)
  return plan.monthlyPrice * 12 - plan.annualPrice
}

export const getStorageMb = (planKey) => getPlan(planKey).storageGb * 1024

export const formatStorage = (gb) => (gb >= 1 ? `${gb} GB` : `${gb * 1024} MB`)
