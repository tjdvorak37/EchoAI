import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'
import { sendSupportReplyEmail } from '../_shared/notify.ts'

const STAFF_ROLES = new Set(['admin', 'manager', 'it'])

const getAssuranceLevel = (accessToken: string) => {
  try {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).aal
  } catch {
    return null
  }
}

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
  if (getAssuranceLevel(accessToken) !== 'aal2') return json({ error: 'Multi-factor authentication is required.' }, 403, request)

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle()
  if (!profile || !STAFF_ROLES.has(profile.role)) return json({ error: 'Staff access is required.' }, 403, request)

  const { ticketId, response } = await request.json().catch(() => ({}))
  const cleanResponse = String(response ?? '').trim()
  if (!ticketId || !cleanResponse) return json({ error: 'A ticket response is required.' }, 400, request)
  if (cleanResponse.length > 10000) return json({ error: 'Ticket responses must be 10,000 characters or fewer.' }, 400, request)

  const { data: ticket, error: ticketError } = await adminClient
    .from('support_tickets')
    .select('id, user_id, subject, category, requester_name, requester_email, contact_name, contact_email')
    .eq('id', ticketId)
    .maybeSingle()
  if (ticketError || !ticket) return json({ error: 'Ticket not found.' }, 404, request)

  let requesterEmail = ticket.requester_email || ticket.contact_email || ''
  let requesterName = ticket.requester_name || ticket.contact_name || ''
  if (!requesterEmail && ticket.user_id) {
    const { data: requester } = await adminClient
      .from('profiles')
      .select('email, full_name')
      .eq('id', ticket.user_id)
      .maybeSingle()
    requesterEmail = requester?.email || ''
    requesterName = requesterName || requester?.full_name || ''
  }
  if (!requesterEmail) return json({ error: 'This ticket has no requester email address.' }, 400, request)

  const delivery = await sendSupportReplyEmail({
    requesterName,
    requesterEmail,
    ticketId: ticket.id,
    subject: ticket.subject || ticket.category,
    response: cleanResponse,
  }, adminClient)
  if (!delivery.success) return json({ error: delivery.error || 'The reply could not be delivered.', provider: delivery.provider }, 502, request)

  const respondedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await adminClient
    .from('support_tickets')
    .update({ admin_response: cleanResponse, responded_at: respondedAt, status: 'waiting_customer' })
    .eq('id', ticket.id)
    .select('id, status, admin_response, responded_at, updated_at')
    .single()
  if (updateError) return json({ error: 'The email was sent, but the ticket could not be updated. Refresh before replying again.' }, 500, request)

  return json({
    id: updated.id,
    status: updated.status,
    adminResponse: updated.admin_response,
    respondedAt: updated.responded_at,
    updatedAt: updated.updated_at,
    provider: delivery.provider,
  }, 200, request)
})