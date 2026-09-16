import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { json } from '../_shared/cors.ts'

const normalizeEmail = (value: unknown) => {
  if (typeof value === 'string') {
    const match = value.match(/<([^>]+)>/)?.[1] || value
    return match.trim().toLowerCase()
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return normalizeEmail(record.address || record.email || (record.emailAddress as Record<string, unknown> | undefined)?.address)
  }
  return ''
}

const stripHtml = (value: string) => value
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .trim()

const trimQuotedReply = (value: string) => value
  .split(/\n(?:On .+ wrote:|From:\s|_{5,}|-{5,}Original Message-{5,})/i)[0]
  .trim()
  .slice(0, 10000)

const secureEquals = (left: string, right: string) => {
  if (!left || left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)

  const expectedSecret = Deno.env.get('SUPPORT_INBOUND_WEBHOOK_SECRET') || ''
  const suppliedSecret = request.headers.get('x-webhook-secret')
    || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    || ''
  if (!expectedSecret) return json({ error: 'Inbound support email is not configured.' }, 503, request)
  if (!secureEquals(suppliedSecret, expectedSecret)) return json({ error: 'Invalid webhook credentials.' }, 401, request)

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!payload) return json({ error: 'A JSON email payload is required.' }, 400, request)

  const senderEmail = normalizeEmail(payload.from || payload.sender)
  const sender = (payload.from || payload.sender) as Record<string, unknown> | undefined
  const senderAddress = sender?.emailAddress as Record<string, unknown> | undefined
  const senderName = String(payload.fromName || payload.senderName || senderAddress?.name || '').trim().slice(0, 120)
  const subject = String(payload.subject || '')
  const messageBody = payload.body && typeof payload.body === 'object'
    ? payload.body as Record<string, unknown>
    : null
  const directBody = typeof payload.body === 'string' ? payload.body : ''
  const nestedContent = String(messageBody?.content || '')
  const nestedContentType = String(messageBody?.contentType || '').toLowerCase()
  const rawBody = String(payload.text || (nestedContentType === 'text' ? nestedContent : '') || '')
  const htmlBody = String(payload.html || (nestedContentType === 'html' ? nestedContent : '') || directBody || '')
  const body = trimQuotedReply(rawBody.trim() || stripHtml(htmlBody) || String(payload.bodyPreview || ''))
  const providerMessageId = String(payload.messageId || payload.internetMessageId || payload.id || '').trim().slice(0, 500) || null
  if (!senderEmail || !body) return json({ error: 'Sender email and message body are required.' }, 400, request)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  if (providerMessageId) {
    const { data: existing } = await adminClient
      .from('support_ticket_messages')
      .select('id, ticket_id')
      .eq('provider_message_id', providerMessageId)
      .maybeSingle()
    if (existing) return json({ ok: true, duplicate: true, ticketId: existing.ticket_id }, 200, request)
  }

  const referenceText = `${subject}\n${rawBody}\n${htmlBody}`
  const fullReference = referenceText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0]
  const shortReference = referenceText.match(/Reference:\s*([0-9a-f]{8})/i)?.[1]?.toLowerCase()
  if (!fullReference && !shortReference) return json({ error: 'No ticket reference was found in the email.' }, 400, request)

  const { data: senderProfile } = await adminClient
    .from('profiles')
    .select('id, full_name')
    .ilike('email', senderEmail)
    .maybeSingle()

  let ticketQuery = adminClient
    .from('support_tickets')
    .select('id, user_id, requester_email, contact_email, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (fullReference) ticketQuery = ticketQuery.eq('id', fullReference)

  const { data: candidates, error: ticketError } = await ticketQuery
  if (ticketError) return json({ error: 'Could not locate the referenced ticket.' }, 500, request)

  const matchesSender = (ticket: Record<string, unknown>) => {
    const ticketEmail = normalizeEmail(ticket.requester_email || ticket.contact_email)
    return ticketEmail === senderEmail || (senderProfile?.id && ticket.user_id === senderProfile.id)
  }
  const ticket = (candidates || []).find((candidate) =>
    matchesSender(candidate) && (!shortReference || String(candidate.id).toLowerCase().startsWith(shortReference)),
  )
  if (!ticket) return json({ error: 'No support ticket matched this sender and reference.' }, 404, request)

  const { error: insertError } = await adminClient.from('support_ticket_messages').insert({
    ticket_id: ticket.id,
    direction: 'customer',
    sender_name: senderName || senderProfile?.full_name || senderEmail,
    sender_email: senderEmail,
    body,
    provider_message_id: providerMessageId,
  })
  if (insertError) return json({ error: 'Could not add the reply to the ticket.' }, 500, request)

  await adminClient
    .from('support_tickets')
    .update({ status: 'in_progress' })
    .eq('id', ticket.id)

  return json({ ok: true, ticketId: ticket.id }, 200, request)
})