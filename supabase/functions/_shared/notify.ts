// Helper to send ticket notifications to support@echoaipro.com and technician accounts
// Reads parameters from public.support_ticket_notifications table and environment variables.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

export interface TicketNotificationPayload {
  ticketId?: string
  requesterName?: string
  requesterEmail?: string
  category: string
  subject?: string
  details: string
  source?: 'landing' | 'app' | 'company_package'
  company?: string
  createdAt?: string
}

export interface NotificationConfig {
  id?: string
  enabled: boolean
  recipient_email: string
  secondary_email?: string
  sender_name?: string
  subject_prefix?: string
  include_full_description?: boolean
  notify_on_landing_tickets?: boolean
  notify_on_app_tickets?: boolean
  notify_on_company_requests?: boolean
  webhook_url?: string
  webhook_enabled?: boolean
}

export const getNotificationConfig = async (adminClient?: any): Promise<NotificationConfig> => {
  const client = adminClient || createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  try {
    const { data, error } = await client
      .from('support_ticket_notifications')
      .select('*')
      .eq('id', 'default')
      .maybeSingle()

    if (data && !error) {
      return {
        enabled: data.enabled !== false,
        recipient_email: data.recipient_email || 'support@echoaipro.com',
        secondary_email: data.secondary_email || '',
        sender_name: data.sender_name || 'EchoAI Support System',
        subject_prefix: data.subject_prefix || '[EchoAI Support]',
        include_full_description: data.include_full_description !== false,
        notify_on_landing_tickets: data.notify_on_landing_tickets !== false,
        notify_on_app_tickets: data.notify_on_app_tickets !== false,
        notify_on_company_requests: data.notify_on_company_requests !== false,
        webhook_url: data.webhook_url || '',
        webhook_enabled: data.webhook_enabled === true,
      }
    }
  } catch (err) {
    console.warn('Failed to load notification config from DB, using defaults:', err)
  }

  return {
    enabled: true,
    recipient_email: Deno.env.get('SUPPORT_NOTIFICATION_EMAIL') || 'support@echoaipro.com',
    secondary_email: '',
    sender_name: 'EchoAI Support System',
    subject_prefix: '[EchoAI Support]',
    include_full_description: true,
    notify_on_landing_tickets: true,
    notify_on_app_tickets: true,
    notify_on_company_requests: true,
    webhook_url: Deno.env.get('SUPPORT_NOTIFICATION_WEBHOOK_URL') || '',
    webhook_enabled: Boolean(Deno.env.get('SUPPORT_NOTIFICATION_WEBHOOK_URL')),
  }
}

export const sendSupportTicketEmail = async (
  payload: TicketNotificationPayload,
  adminClient?: any,
): Promise<{ success: boolean; provider?: string; recipients?: string[]; error?: string }> => {
  const config = await getNotificationConfig(adminClient)

  if (!config.enabled) {
    console.log('[Ticket Notification] Skipped: Support notifications are currently disabled in settings.')
    return { success: true, provider: 'disabled' }
  }

  // Check source-specific routing switches
  if (payload.source === 'landing' && config.notify_on_landing_tickets === false) {
    return { success: true, provider: 'filtered_by_source' }
  }
  if (payload.source === 'app' && config.notify_on_app_tickets === false) {
    return { success: true, provider: 'filtered_by_source' }
  }
  if (payload.source === 'company_package' && config.notify_on_company_requests === false) {
    return { success: true, provider: 'filtered_by_source' }
  }

  const recipients = [config.recipient_email, config.secondary_email]
    .filter(Boolean)
    .flatMap((e) => e.split(','))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (recipients.length === 0) {
    recipients.push('support@echoaipro.com')
  }

  const fromEmail = Deno.env.get('MAIL_FROM_EMAIL') || 'support@echoaipro.com'
  const fromName = config.sender_name || 'EchoAI Support System'
  const prefix = config.subject_prefix ? `${config.subject_prefix} ` : ''

  const requester = payload.requesterEmail || 'Unknown customer'
  const requesterDisplay = payload.requesterName ? `${payload.requesterName} <${requester}>` : requester
  const subject = payload.subject || `${prefix}New ${payload.category} ticket from ${payload.requesterName || requester}`

  const detailsText = config.include_full_description !== false
    ? payload.details
    : `${payload.details.slice(0, 200)}... [Description truncated in notification]`

  const textBody = `
New Support Ticket Submitted to EchoAI
======================================

Category:    ${payload.category}
From:        ${requesterDisplay}
Company:     ${payload.company || 'Not specified'}
Source:      ${payload.source === 'landing' ? 'Public Landing Page' : payload.source === 'company_package' ? 'Company Package Request' : 'In-App Authenticated User'}
Ticket ID:   ${payload.ticketId || 'Pending'}
Time:        ${payload.createdAt || new Date().toISOString()}

Ticket Description:
--------------------------------------
${detailsText}

--------------------------------------
View and reply to this ticket in the IT / Admin Backend:
https://echoaipro.com/
`.trim()

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f172a; color: #ffffff; padding: 24px; }
    .header h2 { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 0; color: #94a3b8; font-size: 14px; }
    .content { padding: 24px; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
    .meta-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
    .meta-label { color: #64748b; font-weight: 600; width: 120px; }
    .meta-value { color: #0f172a; font-weight: 500; }
    .desc-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-wrap; font-size: 14px; color: #334155; }
    .action-btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 12px; }
    .footer { text-align: center; padding: 16px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>🎫 ${payload.category}</h2>
      <p>EchoAI Customer Support Intake Notification</p>
    </div>
    <div class="content">
      <table class="meta-table">
        <tr>
          <td class="meta-label">Customer</td>
          <td class="meta-value"><strong>${payload.requesterName || 'Not provided'}</strong> &lt;<a href="mailto:${requester}">${requester}</a>&gt;</td>
        </tr>
        <tr>
          <td class="meta-label">Category</td>
          <td class="meta-value"><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;">${payload.category}</span></td>
        </tr>
        <tr>
          <td class="meta-label">Company</td>
          <td class="meta-value">${payload.company || 'Personal / None'}</td>
        </tr>
        <tr>
          <td class="meta-label">Channel</td>
          <td class="meta-value">${payload.source === 'landing' ? 'Landing Page' : payload.source === 'company_package' ? 'Company Package Request' : 'In-App Help Desk'}</td>
        </tr>
      </table>

      <h4 style="margin:16px 0 8px 0;color:#0f172a;font-size:14px;">Ticket Message &amp; Description:</h4>
      <div class="desc-box">${detailsText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

      <div style="text-align: center; margin-top: 24px;">
        <a href="https://echoaipro.com/" class="action-btn">Open Support Desk &amp; Reply</a>
      </div>
    </div>
    <div class="footer">
      Sent to <strong>${recipients.join(', ')}</strong> based on your front-end notification rules.
    </div>
  </div>
</body>
</html>
`.trim()

  let sent = false
  let providerUsed = 'logged'

  // 1. Resend API
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: recipients,
          reply_to: requester,
          subject,
          text: textBody,
          html: htmlBody,
        }),
      })
      if (response.ok) {
        sent = true
        providerUsed = 'resend'
      } else {
        const errJson = await response.json().catch(() => ({}))
        console.warn('Resend error:', errJson)
      }
    } catch (err) {
      console.error('Failed sending via Resend:', err)
    }
  }

  // 2. SendGrid API
  const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')
  if (!sent && sendgridApiKey) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: recipients.map((email) => ({ email })) }],
          from: { email: fromEmail, name: fromName },
          reply_to: { email: requester },
          subject,
          content: [
            { type: 'text/plain', value: textBody },
            { type: 'text/html', value: htmlBody },
          ],
        }),
      })
      if (response.ok || response.status === 202) {
        sent = true
        providerUsed = 'sendgrid'
      }
    } catch (err) {
      console.error('Failed sending via SendGrid:', err)
    }
  }

  // 3. Webhook (e.g. Teams / Slack / Zapier webhook)
  if (config.webhook_enabled && config.webhook_url) {
    try {
      await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          from: fromEmail,
          subject,
          text: textBody,
          html: htmlBody,
          payload,
        }),
      })
    } catch (err) {
      console.error('Failed sending via webhook:', err)
    }
  }

  console.log(`[Ticket Notification] Notification dispatched to ${recipients.join(', ')} via ${providerUsed} for: "${subject}"`)
  return { success: true, provider: providerUsed, recipients }
}
