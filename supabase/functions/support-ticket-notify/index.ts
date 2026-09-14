import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'
import { sendSupportAcknowledgmentEmail, sendSupportTicketEmail } from '../_shared/notify.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)

  const accessToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'Authentication required.' }, 401, request)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )
  const { data: caller } = await adminClient.auth.getUser(accessToken)
  if (!caller.user) return json({ error: 'Authentication required.' }, 401, request)

  const { ticketId } = await request.json().catch(() => ({}))
  const { data: ticket, error } = await adminClient
    .from('support_tickets')
    .select('id, user_id, category, details, source, created_at')
    .eq('id', ticketId)
    .eq('user_id', caller.user.id)
    .maybeSingle()
  if (error || !ticket) return json({ error: 'Ticket not found.' }, 404, request)

  const { data: profile } = await adminClient
    .from('profiles')
    .select('full_name, email, company')
    .eq('id', caller.user.id)
    .maybeSingle()

  const payload = {
    ticketId: ticket.id,
    requesterName: profile?.full_name || caller.user.user_metadata?.full_name || caller.user.email,
    requesterEmail: profile?.email || caller.user.email,
    company: profile?.company || '',
    category: ticket.category,
    details: ticket.details,
    source: 'app' as const,
    createdAt: ticket.created_at,
  }
  const [staffNotification, acknowledgment] = await Promise.allSettled([
    sendSupportTicketEmail(payload, adminClient),
    sendSupportAcknowledgmentEmail(payload, adminClient),
  ])

  return json({ ok: true, staffNotification, acknowledgment }, 200, request)
})