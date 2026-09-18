// Single source of truth for subscription tiers.
// Anything that prices, displays, or enforces a plan reads from here so the
// checkout, the database, and the storage limit can never disagree.

export const ANNUAL_DISCOUNT = 0.15

export const FREE_ACCOUNT = {
  key: 'free',
  label: 'Standard',
  monthlyPrice: 0,
  includedAiCredits: 0,
  storageGb: 0,
  tagline: 'Explore every EchoAI workspace, connect accounts, and upgrade when you are ready to run paid tools.',
  features: ['Permanent account access', 'Full workspace discovery', 'Account, help, and connection setup'],
}

export const ACCOUNT_TYPES = {
  standard: { label: 'Standard', accessLevel: 'free' },
  premium: { label: 'Premium', accessLevel: 'paid' },
}

export const PLANS = {
  premium: {
    key: 'premium',
    label: 'Premium',
    storageGb: 0,
    monthlyPrice: 39,
    annualPrice: 390,
    includedAiCredits: 0,
    tagline: 'Full EchoAI access for creators and teams ready to publish, monitor, create, and optimize campaigns.',
    audience: 'Creators, businesses, and teams',
    popular: true,
    marginPct: 0,
  },
}

export const PLAN_ORDER = ['premium']

export const BILLING_INTERVALS = {
  monthly: { label: 'Monthly', suffix: '/ month' },
  annual: { label: 'Annual', suffix: '/ year' },
}

export const getPlan = (planKey) => PLANS[planKey] ?? PLANS.premium

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
