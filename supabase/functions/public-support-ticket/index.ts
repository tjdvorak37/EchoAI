// Ticket intake for people who cannot sign in. This is an unauthenticated write
// path, so it is rate limited per email and per IP and never accepts uploads.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const MAX_PER_EMAIL_PER_HOUR = 3
const MAX_PER_IP_PER_HOUR = 6
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Hashed so the raw address is not retained for rate limiting purposes.
const hashIp = async (ip: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, request)
  }

  try {
    const { email, name, category, details } = await request.json()

    if (!email || !EMAIL_PATTERN.test(String(email))) {
      return json({ error: 'A valid email address is required.' }, 400, request)
    }
    if (!details || String(details).trim().length < 20) {
      return json({ error: 'Please describe the problem in at least 20 characters.' }, 400, request)
    }

    const cleanEmail = String(email).trim().toLowerCase().slice(0, 200)
    const cleanName = String(name ?? '').trim().slice(0, 120)
    const cleanDetails = String(details).trim().slice(0, 4000)
    const cleanCategory = String(category ?? 'Sign-in issue').trim().slice(0, 80)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count: emailCount } = await adminClient
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('contact_email', cleanEmail)
      .gte('created_at', oneHourAgo)

    if ((emailCount ?? 0) >= MAX_PER_EMAIL_PER_HOUR) {
      return json({ error: 'You have sent several requests already. Please wait an hour before sending another.' }, 429, request)
    }

    const forwardedFor = request.headers.get('x-forwarded-for') ?? ''
    const ip = forwardedFor.split(',')[0].trim()
    if (ip) {
      const ipHash = await hashIp(ip)
      const { count: ipCount } = await adminClient
        .from('public_ticket_throttle')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', oneHourAgo)

      if ((ipCount ?? 0) >= MAX_PER_IP_PER_HOUR) {
        return json({ error: 'Too many requests from this network. Please try again later.' }, 429, request)
      }

      await adminClient.from('public_ticket_throttle').insert({ ip_hash: ipHash })
    }

    // Matching on the address alone would let anyone attach a ticket to another
    // person's account, so this only ever links, never trusts the sender.
    const { data: knownProfile } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('email', cleanEmail)
      .maybeSingle()

    const { error: insertError } = await adminClient.from('support_tickets').insert({
      user_id: null,
      contact_email: cleanEmail,
      contact_name: cleanName || null,
      category: cleanCategory,
      details: knownProfile
        ? `${cleanDetails}\n\n[Matches an existing account — verify identity before acting.]`
        : cleanDetails,
      source: 'landing',
      status: 'open',
    })

    if (insertError) {
      return json({ error: 'Could not submit that request.' }, 500, request)
    }

    // Always the same response, so this cannot be used to test which emails
    // have accounts.
    return json({ ok: true }, 200, request)
  } catch {
    return json({ error: 'Unexpected error.' }, 500, request)
  }
})
