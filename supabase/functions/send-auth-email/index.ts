import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'
import { sendAccountConfirmationEmail } from '../_shared/notify.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)

  try {
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !email.includes('@')) return json({ ok: true }, 200, request)

    const { data: profile } = await adminClient.from('profiles').select('id, email').ilike('email', email).maybeSingle()
    if (!profile?.id) return json({ ok: true }, 200, request)
    const { data: authData } = await adminClient.auth.admin.getUserById(profile.id)
    if (!authData.user?.email) return json({ ok: true }, 200, request)
    if (authData.user.email_confirmed_at) return json({ ok: true, alreadyConfirmed: true }, 200, request)

    const appUrl = (Deno.env.get('APP_URL') || 'https://www.echoaipro.com').trim().replace(/\/$/, '')
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'signup',
      email: authData.user.email,
      options: { redirectTo: `${appUrl}/` },
    })
    if (linkError || !linkData?.properties?.action_link) {
      return json({ error: 'Unable to generate an account confirmation link.' }, 500, request)
    }

    const delivery = await sendAccountConfirmationEmail(authData.user.email, linkData.properties.action_link, adminClient)
    if (!delivery.success) return json({ error: delivery.error || 'Unable to send the confirmation email.' }, 503, request)
    return json({ ok: true, provider: delivery.provider }, 200, request)
  } catch (error) {
    console.error('Auth email delivery failed:', error)
    return json({ error: 'Unable to send the account email.' }, 500, request)
  }
})