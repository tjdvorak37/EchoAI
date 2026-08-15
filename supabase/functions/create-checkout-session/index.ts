// Creates a Stripe Checkout session. Prices live server-side so the amount can
// never be tampered with by the browser.
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { corsHeaders, getCorsHeaders, json } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

const PLAN_KEYS = ['standard', 'storage_plus', 'storage_pro', 'storage_max', 'creator']

// One Stripe price per tier per interval, e.g. STRIPE_PRICE_STORAGE_PRO_ANNUAL.
const priceFor = (plan: string, interval: string) =>
  Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`)

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

    const priceId = priceFor(plan, interval)
    if (!priceId) {
      return json({ error: 'That plan is not available for purchase yet.' }, 400, request)
    }

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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
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

    return json({ url: session.url, referralApplied: Boolean(appliedReferralCode) }, 200, request)
  } catch (error) {
    console.error('create-checkout-session failed', error)
    return json({ error: 'Unable to start checkout.' }, 500, request)
  }
})
