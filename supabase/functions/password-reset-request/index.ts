import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'
import { sendPasswordResetEmail } from '../_shared/notify.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PER_EMAIL_PER_HOUR = 5
const MAX_PER_IP_PER_HOUR = 20

const hashValue = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)

  try {
    const { email } = await request.json()
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 200) : ''
    if (!EMAIL_PATTERN.test(cleanEmail)) return json({ error: 'Enter a valid email address.' }, 400, request)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const emailHash = await hashValue(cleanEmail)
    const forwardedFor = request.headers.get('x-forwarded-for') ?? ''
    const ip = forwardedFor.split(',')[0].trim()
    const ipHash = ip ? await hashValue(ip) : null

    const [{ count: emailCount }, { count: ipCount }] = await Promise.all([
      adminClient.from('password_reset_throttle').select('id', { count: 'exact', head: true }).eq('email_hash', emailHash).gte('created_at', oneHourAgo),
      ipHash
        ? adminClient.from('password_reset_throttle').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', oneHourAgo)
        : Promise.resolve({ count: 0 }),
    ])

    if ((emailCount ?? 0) >= MAX_PER_EMAIL_PER_HOUR || (ipCount ?? 0) >= MAX_PER_IP_PER_HOUR) {
      return json({ ok: true }, 200, request)
    }
    await adminClient.from('password_reset_throttle').insert({ email_hash: emailHash, ip_hash: ipHash })

    const appUrl = (Deno.env.get('APP_URL') || 'https://www.echoaipro.com').trim().replace(/\/$/, '')
    const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: cleanEmail,
      options: { redirectTo: `${appUrl}/?recovery=1` },
    })

    if (!linkError && link?.properties?.action_link) {
      const result = await sendPasswordResetEmail(cleanEmail, link.properties.action_link, adminClient)
      if (!result.success) console.error('Password reset delivery failed:', result.error)
    }

    return json({ ok: true }, 200, request)
  } catch (error) {
    console.error('Password reset request failed:', error)
    return json({ error: 'Unable to process that request right now.' }, 500, request)
  }
})