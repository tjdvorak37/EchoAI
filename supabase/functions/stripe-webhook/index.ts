// Stripe webhook receiver: the only thing that activates or revokes paid access.
// Every state change Stripe reports is written straight to public.subscriptions,
// and database triggers propagate it to the user's account access.
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createSubtleCryptoProvider()

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

// How long a customer keeps access after a failed charge while Stripe retries.
const GRACE_DAYS = Number(Deno.env.get('BILLING_GRACE_DAYS') ?? '3')

const PLAN_KEYS = ['standard', 'storage_plus', 'storage_pro', 'storage_max', 'creator']

// Reverse lookup from Stripe price id back to our tier + interval, built from the
// same STRIPE_PRICE_<TIER>_<INTERVAL> variables the checkout function reads.
const PRICE_LOOKUP: Record<string, { plan: string; interval: string }> = {}
for (const plan of PLAN_KEYS) {
  for (const interval of ['monthly', 'annual']) {
    const priceId = Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`)
    if (priceId) PRICE_LOOKUP[priceId] = { plan, interval }
  }
}

// Stripe status -> our status. Anything that is not currently paid resolves to a
// non-entitled value, so revocation needs no separate code path.
const STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'incomplete',
  incomplete_expired: 'expired',
  canceled: 'canceled',
  paused: 'canceled',
}

const toIso = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null

const planFromSubscription = (subscription: Stripe.Subscription) => {
  const priceId = subscription.items.data[0]?.price?.id ?? ''
  const mapped = PRICE_LOOKUP[priceId]
  if (mapped) return mapped

  // Checkout stamps these on the subscription, so they survive a price rename.
  const metaPlan = subscription.metadata?.plan
  const metaInterval = subscription.metadata?.billing_interval
  const interval =
    metaInterval === 'annual' || subscription.items.data[0]?.price?.recurring?.interval === 'year'
      ? 'annual'
      : 'monthly'

  return {
    plan: metaPlan && PLAN_KEYS.includes(metaPlan) ? metaPlan : 'standard',
    interval,
  }
}

const resolveEmail = async (subscription: Stripe.Subscription) => {
  const metadataEmail = subscription.metadata?.email
  if (metadataEmail) return metadataEmail

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id

  if (!customerId) return null

  const customer = await stripe.customers.retrieve(customerId)
  if (customer.deleted) return null
  return customer.email ?? null
}

const applySubscription = async (subscription: Stripe.Subscription) => {
  const email = await resolveEmail(subscription)
  if (!email) {
    throw new Error(`No email on subscription ${subscription.id}`)
  }

  const status = STATUS_MAP[subscription.status] ?? 'expired'
  const graceEndsAt = status === 'past_due'
    ? new Date(Date.now() + GRACE_DAYS * 86_400_000).toISOString()
    : null

  const { plan, interval } = planFromSubscription(subscription)

  const { error } = await supabase.rpc('apply_stripe_subscription', {
    p_stripe_subscription_id: subscription.id,
    p_stripe_customer_id: typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null,
    p_email: email,
    p_user_id: subscription.metadata?.supabase_user_id || null,
    p_plan: plan,
    p_billing_interval: interval,
    p_status: status,
    p_current_period_end: toIso(subscription.current_period_end),
    p_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    p_grace_period_ends_at: graceEndsAt,
  })

  if (error) throw new Error(error.message)
}

const subscriptionIdFromInvoice = (invoice: Stripe.Invoice) =>
  typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null

// The referrer's reward is one free month, delivered as an account credit that
// Stripe applies to their next invoice. No money leaves the platform.
const grantReferralReward = async (subscription: Stripe.Subscription, email: string) => {
  const referralCode = subscription.metadata?.referral_code
  if (!referralCode) return

  const { data: result, error } = await supabase.rpc('record_referral_conversion', {
    p_code: referralCode,
    p_referred_email: email,
    p_stripe_subscription_id: subscription.id,
    p_plan: planFromSubscription(subscription).plan,
  })

  if (error) throw new Error(error.message)
  if (!result?.recorded || result.reward !== 'credit') return

  await stripe.customers.createBalanceTransaction(result.stripeCustomerId, {
    amount: -Math.round(Number(result.creditUsd) * 100),
    currency: 'usd',
    description: `EchoAI referral reward — one free month (${referralCode})`,
  })

  const { error: markError } = await supabase.rpc('mark_referral_rewarded', {
    p_referral_id: result.referralId,
    p_note: `Account credit of $${result.creditUsd} applied`,
  })

  if (markError) throw new Error(markError.message)
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = request.headers.get('stripe-signature')
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!signature || !secret) {
    return new Response('Missing signature', { status: 400 })
  }

  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret, undefined, cryptoProvider)
  } catch (error) {
    console.error('Signature verification failed', error)
    return new Response('Invalid signature', { status: 400 })
  }

  // Idempotency: a duplicate delivery loses the race on the primary key and exits.
  const { error: seenError } = await supabase
    .from('billing_events')
    .insert({ event_id: event.id, event_type: event.type })

  if (seenError) {
    if (seenError.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 })
    }
    console.error('Unable to record billing event', seenError)
    return new Response('Storage error', { status: 500 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (!session.subscription) break

        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        // Carry identity onto the subscription so later events resolve without a lookup.
        // Existing keys are preserved: referral_code is set at checkout creation.
        const metadata: Record<string, string> = {
          ...subscription.metadata,
          email: session.customer_details?.email ?? session.customer_email ?? '',
        }
        if (session.client_reference_id) {
          metadata.supabase_user_id = session.client_reference_id
        }
        const updated = await stripe.subscriptions.update(subscriptionId, { metadata })

        await applySubscription({ ...subscription, ...updated })

        // Attribution happens only here, so a later subscription event cannot
        // mint a second reward for the same signup.
        const referredEmail = session.customer_details?.email ?? session.customer_email
        if (referredEmail) {
          await grantReferralReward(updated, referredEmail)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        await applySubscription(event.data.object as Stripe.Subscription)
        break
      }

      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = subscriptionIdFromInvoice(invoice)
        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await applySubscription(subscription)

        const email = invoice.customer_email ?? (await resolveEmail(subscription))
        if (invoice.id && email) {
          const { error } = await supabase.rpc('record_billing_payment', {
            p_stripe_invoice_id: invoice.id,
            p_stripe_subscription_id: subscriptionId,
            p_email: email,
            p_plan: planFromSubscription(subscription).plan,
            p_amount_usd: (invoice.amount_paid ?? 0) / 100,
            p_status: event.type === 'invoice.payment_succeeded' ? 'confirmed' : 'failed',
            p_paid_at: toIso(invoice.status_transitions?.paid_at) ?? new Date().toISOString(),
          })
          if (error) throw new Error(error.message)
        }
        break
      }

      default:
        break
    }
  } catch (error) {
    console.error(`Failed handling ${event.type}`, error)
    // Roll back the idempotency marker so Stripe's retry is processed.
    await supabase.from('billing_events').delete().eq('event_id', event.id)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
