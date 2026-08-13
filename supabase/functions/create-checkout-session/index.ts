// Creates a Stripe Checkout session. Prices live server-side so the amount can
// never be tampered with by the browser.
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { corsHeaders, json } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'),
  annual: Deno.env.get('STRIPE_PRICE_ANNUAL'),
}

// 20% off the first month, or 10% off the first year. Both are duration=once
// coupons in Stripe, so the discount never carries into later renewals.
const REFERRAL_COUPON_BY_PLAN: Record<string, string | undefined> = {
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
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const { plan, email: bodyEmail, fullName, referralCode } = await request.json()

    const priceId = PRICE_BY_PLAN[plan]
    if (!priceId) {
      return json({ error: 'Unknown plan.' }, 400)
    }

    const user = await userFromAuthHeader(request.headers.get('Authorization'))
    const email = user?.email ?? (typeof bodyEmail === 'string' ? bodyEmail.trim() : '')

    if (!email || !email.includes('@')) {
      return json({ error: 'A valid email address is required.' }, 400)
    }

    // Referral eligibility is decided server-side; the browser only supplies the code.
    let appliedReferralCode = ''
    const coupon = REFERRAL_COUPON_BY_PLAN[plan]

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
          full_name: typeof fullName === 'string' ? fullName : '',
          ...(appliedReferralCode ? { referral_code: appliedReferralCode } : {}),
          ...(user?.id ? { supabase_user_id: user.id } : {}),
        },
      },
      success_url: `${APP_URL}/?checkout=success`,
      cancel_url: `${APP_URL}/?checkout=cancelled`,
    })

    return json({ url: session.url, referralApplied: Boolean(appliedReferralCode) })
  } catch (error) {
    console.error('create-checkout-session failed', error)
    return json({ error: 'Unable to start checkout.' }, 500)
  }
})
