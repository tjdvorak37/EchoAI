import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2025-03-31.basil', httpClient: Stripe.createFetchHttpClient() })
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

const admin = () => createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request)
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false } })
  const { data: auth } = token ? await client.auth.getUser(token) : { data: { user: null } }
  if (!auth?.user) return json({ error: 'Authentication required.' }, 401, request)
  try {
    const { productKey } = await request.json()
    const CANONICAL_PACKS: Record<string, { label: string; credits: number; price_usd: number; stripe_price_id: string }> = {
      credit_500: { label: '500 AI Tokens', credits: 500, price_usd: 9.99, stripe_price_id: 'price_1UFGcbRrklQsqC82iY7GVtDr' },
      credit_1000: { label: '1,000 AI Tokens', credits: 1000, price_usd: 18.99, stripe_price_id: 'price_1UFGdRRrklQsqC82fUcEFFP3' },
      credit_2500: { label: '2,500 AI Tokens', credits: 2500, price_usd: 39.99, stripe_price_id: 'price_1UFGeBRrklQsqC82JMP7nUXL' },
      credit_5000: { label: '5,000 AI Tokens', credits: 5000, price_usd: 74.99, stripe_price_id: 'price_1UFGeqRrklQsqC82fuiF4ksA' },
    }

    const canonical = CANONICAL_PACKS[productKey]
    if (!canonical) return json({ error: 'Credit pack is unavailable.' }, 400, request)

    const { data: dbProduct } = await admin()
      .from('echo_credit_products')
      .select('id, product_key, label, credits, price_usd, stripe_price_id')
      .eq('product_key', productKey)
      .eq('enabled', true)
      .maybeSingle()

    const product = {
      id: dbProduct?.id || productKey,
      product_key: productKey,
      label: dbProduct?.label || canonical.label,
      credits: Number(dbProduct?.credits) || canonical.credits,
      price_usd: Number(dbProduct?.price_usd) || canonical.price_usd,
      stripe_price_id: dbProduct?.stripe_price_id || Deno.env.get(`STRIPE_PRICE_${productKey.toUpperCase()}`) || canonical.stripe_price_id || '',
    }

    const dynamicLineItem = {
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(product.price_usd * 100),
        product_data: {
          name: product.label || `${product.credits.toLocaleString()} Echo AI Tokens`,
          description: `${product.credits.toLocaleString()} Echo AI Tokens / Credits for Image, Video, and Copy generation`,
        },
      },
      quantity: 1,
    }

    const createCreditSession = async (lineItem: Record<string, unknown>) => {
      return await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [lineItem],
        customer_email: auth.user.email,
        client_reference_id: auth.user.id,
        metadata: {
          type: 'echo_credit_pack',
          product_id: product.id,
          product_key: product.product_key,
          credits: String(product.credits),
          supabase_user_id: auth.user.id,
        },
        success_url: `${APP_URL}/?credits=success&tokens=${product.credits}`,
        cancel_url: `${APP_URL}/?credits=cancelled`,
      })
    }

    let session: Stripe.Checkout.Session
    if (product.stripe_price_id) {
      try {
        session = await createCreditSession({ price: product.stripe_price_id, quantity: 1 })
      } catch (priceError) {
        console.warn(`Credit Price ID ${product.stripe_price_id} rejected by Stripe. Falling back to direct price_data:`, priceError)
        session = await createCreditSession(dynamicLineItem)
      }
    } else {
      session = await createCreditSession(dynamicLineItem)
    }
    return json({ url: session.url }, 200, request)
  } catch (error) {
    console.error('create-credit-checkout failed', error)
    const errMessage = error instanceof Error ? error.message : String(error)
    return json({ error: errMessage || 'Unable to start credit checkout.' }, 500, request)
  }
})