// Creates a Stripe Checkout session. Prices live server-side so the amount can
// never be tampered with by the browser.
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2025-03-31.basil',
  httpClient: Stripe.createFetchHttpClient(),
})

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

const PLAN_KEYS = ['standard', 'storage_plus', 'storage_pro', 'storage_max', 'creator']

const PLAN_DEFAULTS: Record<string, { label: string; monthlyPrice: number; annualPrice: number; storageGb: number; tokens: number }> = {
  standard: { label: 'Standard', monthlyPrice: 29, annualPrice: 295, storageGb: 2, tokens: 500 },
  storage_plus: { label: 'Storage +', monthlyPrice: 39, annualPrice: 398, storageGb: 10, tokens: 1000 },
  storage_pro: { label: 'Storage Pro', monthlyPrice: 59, annualPrice: 599, storageGb: 25, tokens: 2500 },
  storage_max: { label: 'Storage Max', monthlyPrice: 89, annualPrice: 899, storageGb: 50, tokens: 4500 },
  creator: { label: 'Creator Studio', monthlyPrice: 129, annualPrice: 1299, storageGb: 100, tokens: 7500 },
}

const DEFAULT_STRIPE_PRICES: Record<string, string> = {
  STRIPE_PRICE_STANDARD_MONTHLY: 'price_1UFGJ9RrklQsqC822EUTvcKQ',
  STRIPE_PRICE_STANDARD_ANNUAL: 'price_1UFGJ9RrklQsqC823cmY2TfS',
  STRIPE_PRICE_STORAGE_PLUS_MONTHLY: 'price_1UFGHxRrklQsqC820fmti9kY',
  STRIPE_PRICE_STORAGE_PLUS_ANNUAL: 'price_1UFGHxRrklQsqC820FuI8teb',
  STRIPE_PRICE_STORAGE_PRO_MONTHLY: 'price_1UFGGdRrklQsqC825AahS61v',
  STRIPE_PRICE_STORAGE_PRO_ANNUAL: 'price_1UFGGdRrklQsqC82PLtdTqAr',
  STRIPE_PRICE_STORAGE_MAX_MONTHLY: 'price_1UFGEiRrklQsqC82jSx1SMxs',
  STRIPE_PRICE_STORAGE_MAX_ANNUAL: 'price_1UFGEiRrklQsqC82kFKGekg3',
  STRIPE_PRICE_CREATOR_MONTHLY: 'price_1UFGCRRrklQsqC82vjVbVkuJ',
  STRIPE_PRICE_CREATOR_ANNUAL: 'price_1UFGCRRrklQsqC82NfiDNVOW',
}

// One Stripe price per tier per interval, e.g. STRIPE_PRICE_STORAGE_PRO_ANNUAL.
const priceFor = (plan: string, interval: string) => {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`
  return Deno.env.get(envKey) || DEFAULT_STRIPE_PRICES[envKey] || ''
}

// 20% off the first month, or 10% off the first year. Both are duration=once
// coupons in Stripe, so the discount never carries into later renewals.
const REFERRAL_COUPON_BY_INTERVAL: Record<string, string | undefined> = {
  monthly: Deno.env.get('STRIPE_COUPON_REFERRAL_MONTHLY'),
  annual: Deno.env.get('STRIPE_COUPON_REFERRAL_ANNUAL'),
}

const adminClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

const userFromAuthHeader = async (authHeader: string | null) => {
  if (!authHeader?.startsWith('Bearer ')) return null

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data } = await client.auth.getUser(authHeader.replace('Bearer ', ''))
  return data?.user ?? null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, request)
  }

  try {
    const { plan, billingInterval, email: bodyEmail, fullName, referralCode } = await request.json()

    const interval = billingInterval === 'annual' ? 'annual' : 'monthly'

    if (!PLAN_KEYS.includes(plan)) {
      return json({ error: 'Unknown plan.' }, 400, request)
    }

    const planMeta = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.standard
    const priceId = priceFor(plan, interval)

    const user = await userFromAuthHeader(request.headers.get('Authorization'))
    const email = user?.email ?? (typeof bodyEmail === 'string' ? bodyEmail.trim() : '')

    if (!email || !email.includes('@')) {
      return json({ error: 'A valid email address is required.' }, 400, request)
    }

    // Referral eligibility is decided server-side; the browser only supplies the code.
    let appliedReferralCode = ''
    const coupon = REFERRAL_COUPON_BY_INTERVAL[interval]

    if (typeof referralCode === 'string' && referralCode.trim() && coupon) {
      const { data: resolved } = await adminClient().rpc('resolve_referral_code', {
        p_code: referralCode.trim(),
        p_email: email,
      })

      if (resolved?.valid) {
        appliedReferralCode = referralCode.trim()
      }
    }

    const targetAmount = interval === 'annual' ? planMeta.annualPrice : planMeta.monthlyPrice
    const dynamicPriceData = {
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(targetAmount * 100),
        recurring: {
          interval: interval === 'annual' ? 'year' : 'month',
        },
        product_data: {
          name: `EchoAI ${planMeta.label} (${interval === 'annual' ? 'Annual' : 'Monthly'})`,
          description: `EchoAI ${planMeta.label} Plan — ${planMeta.storageGb} GB Storage & ${planMeta.tokens.toLocaleString()} Monthly Tokens`,
        },
      },
      quantity: 1,
    }

    const createCheckoutSession = async (lineItem: Record<string, unknown>) => {
      return await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [lineItem],
        customer_email: email,
        client_reference_id: user?.id ?? undefined,
        // Stripe rejects allow_promotion_codes alongside an applied discount.
        ...(appliedReferralCode
          ? { discounts: [{ coupon }] }
          : { allow_promotion_codes: true }),
        subscription_data: {
          metadata: {
            email,
            plan,
            billing_interval: interval,
            full_name: typeof fullName === 'string' ? fullName : '',
            ...(appliedReferralCode ? { referral_code: appliedReferralCode } : {}),
            ...(user?.id ? { supabase_user_id: user.id } : {}),
          },
        },
        success_url: `${APP_URL}/?checkout=success`,
        cancel_url: `${APP_URL}/?checkout=cancelled`,
      })
    }

    let session: Stripe.Checkout.Session
    if (priceId) {
      try {
        session = await createCheckoutSession({ price: priceId, quantity: 1 })
      } catch (priceError) {
        console.warn(`Price ID ${priceId} rejected by Stripe (inactive or missing). Falling back to direct price_data:`, priceError)
        session = await createCheckoutSession(dynamicPriceData)
      }
    } else {
      session = await createCheckoutSession(dynamicPriceData)
    }

    return json({ url: session.url, referralApplied: Boolean(appliedReferralCode) }, 200, request)
  } catch (error) {
    console.error('create-checkout-session failed', error)
    const errMessage = error instanceof Error ? error.message : String(error)
    return json({ error: errMessage || 'Unable to start checkout.' }, 500, request)
  }
})
