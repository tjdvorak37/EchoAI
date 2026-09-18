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
  standard: {
    key: 'standard',
    label: 'Standard',
    storageGb: 2,
    monthlyPrice: 29,
    annualPrice: 295,
    includedAiCredits: 500,
    aiCreditValueUsd: 15,
    tagline: 'Everything in EchoAI with room for day-to-day campaign work. Perfect for solo creators & freelancers.',
    audience: 'Solo creators, freelancers',
    marginPct: 93.8,
  },
  storage_plus: {
    key: 'storage_plus',
    label: 'Storage +',
    storageGb: 10,
    monthlyPrice: 39,
    annualPrice: 398,
    includedAiCredits: 1000,
    aiCreditValueUsd: 25,
    tagline: 'Five times the space and 1,000 monthly tokens for growing businesses and steady content creation.',
    audience: 'Small businesses, growing content creators',
    marginPct: 91.0,
  },
  storage_pro: {
    key: 'storage_pro',
    label: 'Storage Pro',
    storageGb: 25,
    monthlyPrice: 59,
    annualPrice: 599,
    includedAiCredits: 2500,
    aiCreditValueUsd: 50,
    tagline: '2,500 monthly tokens and 25 GB storage for regular multi-track video and multi-brand asset archives.',
    audience: 'Agencies, multi-brand marketing teams',
    popular: true,
    marginPct: 86.4,
  },
  storage_max: {
    key: 'storage_max',
    label: 'Storage Max',
    storageGb: 50,
    monthlyPrice: 89,
    annualPrice: 899,
    includedAiCredits: 4500,
    aiCreditValueUsd: 90,
    tagline: 'Heavy production schedules with 4,500 monthly tokens, 50 GB storage, raw footage, and team workflows.',
    audience: 'Production teams, high-volume social managers',
    marginPct: 83.1,
  },
  creator: {
    key: 'creator',
    label: 'Creator Studio',
    storageGb: 100,
    monthlyPrice: 129,
    annualPrice: 1299,
    includedAiCredits: 7500,
    aiCreditValueUsd: 150,
    tagline: 'Maximum power with 7,500 monthly tokens and 100 GB storage for commercial video studios and enterprise agencies.',
    audience: 'Enterprise agencies, commercial video studios',
    marginPct: 80.6,
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
