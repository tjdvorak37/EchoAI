import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2025-03-31.basil',
  httpClient: Stripe.createFetchHttpClient(),
})

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401, request)

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )
  const { data } = await client.auth.getUser(authorization.slice('Bearer '.length))
  if (!data.user) return json({ error: 'Authentication required.' }, 401, request)

  const body = await request.json().catch(() => ({}))
  const database = admin()
  if (body.action === 'change-temporary-password') {
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 12) {
      return json({ error: 'Choose a password with at least 12 characters.' }, 400, request)
    }
    if (data.user.app_metadata?.must_change_password !== true) {
      return json({ error: 'This account does not require a temporary password change.' }, 409, request)
    }

    const { error: updateError } = await database.auth.admin.updateUserById(data.user.id, {
      password,
      app_metadata: {
        ...(data.user.app_metadata || {}),
        must_change_password: false,
        temporary_password_set_at: null,
        password_changed_at: new Date().toISOString(),
      },
    })
    if (updateError) return json({ error: 'Unable to update your password.' }, 500, request)
    return json({ updated: true }, 200, request)
  }

  if (body.action !== 'delete') return json({ error: 'Unsupported account action.' }, 400, request)

  const { data: subscription } = await database
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (subscription?.stripe_customer_id) {
    const activeSubscriptions = await stripe.subscriptions.list({
      customer: subscription.stripe_customer_id,
      status: 'all',
      limit: 100,
    })
    for (const item of activeSubscriptions.data) {
      if (!['canceled', 'incomplete_expired'].includes(item.status)) {
        await stripe.subscriptions.cancel(item.id)
      }
    }
  }

  const { error } = await database.auth.admin.deleteUser(data.user.id)
  if (error) return json({ error: 'Unable to delete your account.' }, 500, request)
  return json({ deleted: true }, 200, request)
})
