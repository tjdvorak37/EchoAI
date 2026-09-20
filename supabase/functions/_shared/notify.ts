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
  smtp_host?: string
  smtp_port?: number
  smtp_encryption?: string
  smtp_user?: string
  smtp_password?: string
  resend_api_key?: string
  sendgrid_api_key?: string
}

export interface SupportReplyPayload {
  requesterName?: string
  requesterEmail: string
  ticketId: string
  subject?: string
  response: string
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
        smtp_host: data.smtp_host || 'smtp.office365.com',
        smtp_port: data.smtp_port || 587,
        smtp_encryption: data.smtp_encryption || 'STARTTLS',
        smtp_user: data.smtp_user || 'support@echoaipro.com',
        smtp_password: data.smtp_password || '',
        resend_api_key: data.resend_api_key || '',
        sendgrid_api_key: data.sendgrid_api_key || '',
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
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_encryption: 'STARTTLS',
    smtp_user: 'support@echoaipro.com',
    smtp_password: '',
    resend_api_key: '',
    sendgrid_api_key: '',
  }
}

export const sendSupportTicketEmail = async (
  payload: TicketNotificationPayload,
  adminClient?: any,
  overrideConfig?: Partial<NotificationConfig>,
): Promise<{ success: boolean; provider?: string; recipients?: string[]; error?: string }> => {
  const baseConfig = await getNotificationConfig(adminClient)
  const config = { ...baseConfig, ...(overrideConfig || {}) }

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
    .filter((e): e is string => Boolean(e))
    .flatMap((e) => e.split(','))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (recipients.length === 0) {
    recipients.push('support@echoaipro.com')
  }

  const fromEmail = 'support@echoaipro.com'
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
  const resendApiKey = config.resend_api_key || Deno.env.get('RESEND_API_KEY')
  if (resendApiKey) {
    try {
      // First try sending with the custom domain support@echoaipro.com
      let resendResponse = await fetch('https://api.resend.com/emails', {
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

      if (resendResponse.ok) {
        sent = true
        providerUsed = 'resend'
      } else {
        const errJson = await resendResponse.json().catch(() => ({}))
        console.warn('Resend send from custom domain failed:', errJson)

        // If custom domain is not yet verified in Resend, fallback to Resend's verified test sender
        if (resendResponse.status === 403 || resendResponse.status === 422 || errJson.message?.toLowerCase().includes('domain')) {
          const fallbackResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `${fromName} <onboarding@resend.dev>`,
              to: recipients,
              reply_to: fromEmail,
              subject,
              text: textBody,
              html: htmlBody,
            }),
          })
          if (fallbackResponse.ok) {
            sent = true
            providerUsed = 'resend (onboarding@resend.dev)'
          } else {
            const fallbackErr = await fallbackResponse.json().catch(() => ({}))
            return {
              success: false,
              provider: 'resend',
              recipients,
              error: fallbackErr.message || errJson.message || 'Resend delivery failed. Check your API key and verified domain in Resend.',
            }
          }
        } else {
          return {
            success: false,
            provider: 'resend',
            recipients,
            error: errJson.message || 'Resend error. Check your API key in settings.',
          }
        }
      }
    } catch (err) {
      console.error('Failed sending via Resend:', err)
      return { success: false, provider: 'resend', recipients, error: (err as Error).message }
    }
  }

  // 2. SendGrid API
  const sendgridApiKey = config.sendgrid_api_key || Deno.env.get('SENDGRID_API_KEY')
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
      const webhookResponse = await fetch(config.webhook_url, {
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
      if (webhookResponse.ok) {
        sent = true
        providerUsed = 'webhook'
      } else {
        return {
          success: false,
          provider: 'webhook',
          recipients,
          error: `Webhook rejected notification with HTTP ${webhookResponse.status}.`,
        }
      }
    } catch (err) {
      return { success: false, provider: 'webhook', recipients, error: (err as Error).message }
    }
  }

  if (!sent) {
    return {
      success: false,
      provider: 'none',
      recipients,
      error: 'No email provider is configured. Add a Resend or SendGrid API key, or enable a working webhook, then save the settings.',
    }
  }

  console.log(`[Ticket Notification] Notification dispatched to ${recipients.join(', ')} via ${providerUsed} for: "${subject}"`)
  return { success: true, provider: providerUsed, recipients }
}

export const sendSupportAcknowledgmentEmail = async (
  payload: TicketNotificationPayload,
  adminClient?: any,
): Promise<{ success: boolean; provider?: string; error?: string }> => {
  if (!payload.requesterEmail) return { success: false, error: 'Requester email is required.' }

  const config = await getNotificationConfig(adminClient)
  const resendApiKey = config.resend_api_key || Deno.env.get('RESEND_API_KEY')
  const sendgridApiKey = config.sendgrid_api_key || Deno.env.get('SENDGRID_API_KEY')
  const fromEmail = 'support@echoaipro.com'
  const fromName = config.sender_name || 'EchoAI Support'
  const ticketReference = payload.ticketId ? payload.ticketId.slice(0, 8).toUpperCase() : 'PENDING'
  const safeName = (payload.requesterName || 'there').replace(/[<>]/g, '')
  const subject = `We received your EchoAI support request (${ticketReference})`
  const text = `Hi ${safeName},\n\nYour support request has been received and will be addressed as soon as possible.\n\nReference: ${ticketReference}\nCategory: ${payload.category}\n\nPlease reply to this email if you need to add important information.\n\nEchoAI Support`
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:auto"><h2 style="color:#173ea5">We received your request</h2><p>Hi ${safeName},</p><p>Your support request has been received and will be addressed as soon as possible.</p><div style="background:#f5f7fb;border:1px solid #dce3ef;padding:16px"><strong>Reference:</strong> ${ticketReference}<br><strong>Category:</strong> ${payload.category.replace(/[<>]/g, '')}</div><p>Please reply to this email if you need to add important information.</p><p>EchoAI Support</p></div>`

  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [payload.requesterEmail], reply_to: fromEmail, subject, text, html }),
    })
    if (response.ok) return { success: true, provider: 'resend' }
  }

  if (sendgridApiKey) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sendgridApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.requesterEmail }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: { email: fromEmail },
        subject,
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
      }),
    })
    if (response.ok || response.status === 202) return { success: true, provider: 'sendgrid' }
  }

  return { success: false, provider: 'none', error: 'No configured email provider accepted the acknowledgment.' }
}

export const sendSupportReplyEmail = async (
  payload: SupportReplyPayload,
  adminClient?: any,
): Promise<{ success: boolean; provider?: string; error?: string }> => {
  const config = await getNotificationConfig(adminClient)
  const resendApiKey = config.resend_api_key || Deno.env.get('RESEND_API_KEY')
  const sendgridApiKey = config.sendgrid_api_key || Deno.env.get('SENDGRID_API_KEY')
  const fromEmail = 'support@echoaipro.com'
  const fromName = config.sender_name || 'EchoAI Support'
  const ticketReference = payload.ticketId.slice(0, 8).toUpperCase()
  const safeName = (payload.requesterName || 'there').replace(/[<>]/g, '')
  const safeResponse = payload.response.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const subject = `Re: [Ticket ${payload.ticketId}] ${payload.subject || 'EchoAI support request'}`
  const text = `Hi ${safeName},\n\n${payload.response}\n\nReference: ${ticketReference}\n\nEchoAI Support`
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:auto"><p>Hi ${safeName},</p><div style="white-space:pre-wrap">${safeResponse}</div><p style="color:#64748b;font-size:13px">Reference: ${ticketReference}</p><p>EchoAI Support</p></div>`

  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [payload.requesterEmail], reply_to: fromEmail, subject, text, html }),
      })
      if (response.ok) return { success: true, provider: 'resend' }
      const detail = await response.json().catch(() => ({}))
      return { success: false, provider: 'resend', error: detail.message || `Resend rejected the reply with HTTP ${response.status}.` }
    } catch (error) {
      return { success: false, provider: 'resend', error: (error as Error).message }
    }
  }

  if (sendgridApiKey) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sendgridApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.requesterEmail }] }],
          from: { email: fromEmail, name: fromName },
          reply_to: { email: fromEmail },
          subject,
          content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
        }),
      })
      if (response.ok || response.status === 202) return { success: true, provider: 'sendgrid' }
      return { success: false, provider: 'sendgrid', error: `SendGrid rejected the reply with HTTP ${response.status}.` }
    } catch (error) {
      return { success: false, provider: 'sendgrid', error: (error as Error).message }
    }
  }

  return { success: false, provider: 'none', error: 'No email provider is configured for support replies.' }
}

export const sendPasswordResetEmail = async (
  recipientEmail: string,
  actionLink: string,
  adminClient?: any,
): Promise<{ success: boolean; provider?: string; error?: string }> => {
  const config = await getNotificationConfig(adminClient)
  const resendApiKey = config.resend_api_key || Deno.env.get('RESEND_API_KEY')
  const sendgridApiKey = config.sendgrid_api_key || Deno.env.get('SENDGRID_API_KEY')
  const fromEmail = 'support@echoaipro.com'
  const fromName = config.sender_name || 'EchoAI Support'
  const subject = 'Reset your EchoAI password'
  const text = `A password reset was requested for your EchoAI account.\n\nReset your password: ${actionLink}\n\nThis link is single-use and expires in one hour. If you did not request this, you can ignore this email.`
  const safeLink = actionLink.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:auto"><h2 style="color:#173ea5">Reset your EchoAI password</h2><p>A password reset was requested for your account.</p><p><a href="${safeLink}" style="display:inline-block;background:#2357d6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700">Reset password</a></p><p>This link is single-use and expires in one hour. If you did not request this, you can ignore this email.</p></div>`

  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [recipientEmail], reply_to: fromEmail, subject, text, html }),
    })
    if (response.ok) return { success: true, provider: 'resend' }
  }

  if (sendgridApiKey) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sendgridApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipientEmail }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: { email: fromEmail },
        subject,
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
      }),
    })
    if (response.ok || response.status === 202) return { success: true, provider: 'sendgrid' }
  }

  return { success: false, provider: 'none', error: 'No configured email provider accepted the password reset email.' }
}

export const sendAccountConfirmationEmail = async (
  recipientEmail: string,
  actionLink: string,
  adminClient?: any,
): Promise<{ success: boolean; provider?: string; error?: string }> => {
  const config = await getNotificationConfig(adminClient)
  const resendApiKey = config.resend_api_key || Deno.env.get('RESEND_API_KEY')
  const sendgridApiKey = config.sendgrid_api_key || Deno.env.get('SENDGRID_API_KEY')
  const fromEmail = 'support@echoaipro.com'
  const fromName = 'EchoAI Support'
  const subject = 'Confirm your EchoAI account'
  const text = `Welcome to EchoAI. Confirm your email address to finish setting up your account:\n\n${actionLink}\n\nThis link is single-use. If you did not create this account, you can ignore this email.`
  const safeLink = actionLink.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:auto"><h2 style="color:#173ea5">Confirm your EchoAI account</h2><p>Welcome to EchoAI. Confirm your email address to finish setting up your account.</p><p><a href="${safeLink}" style="display:inline-block;background:#2357d6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700">Confirm email address</a></p><p>This link is single-use. If you did not create this account, you can ignore this email.</p><p>EchoAI Support</p></div>`

  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [recipientEmail], reply_to: fromEmail, subject, text, html }),
    })
    if (response.ok) return { success: true, provider: 'resend' }
  }

  if (sendgridApiKey) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sendgridApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipientEmail }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: { email: fromEmail },
        subject,
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
      }),
    })
    if (response.ok || response.status === 202) return { success: true, provider: 'sendgrid' }
  }

  return { success: false, provider: 'none', error: 'No configured Support email provider accepted the confirmation email.' }
}
