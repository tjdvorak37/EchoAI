// Privileged user-support actions for admins. The caller's role is re-checked
// here with the service role key: a browser can claim any role, so the client's
// own view of who it is never decides access.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'
import { getNotificationConfig, sendSupportTicketEmail } from '../_shared/notify.ts'

const PRIVILEGED_ROLES = new Set([
  'admin',
  'super_admin',
  'manager',
  'it',
  'accountant',
  'board_member',
])

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, request)
  }

  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!accessToken) {
      return json({ error: 'Not authenticated.' }, 401, request)
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: caller, error: callerError } = await adminClient.auth.getUser(accessToken)
    if (callerError || !caller.user) {
      return json({ error: 'Not authenticated.' }, 401, request)
    }

    const callerEmail = caller.user.email?.toLowerCase().trim() ?? ''

    let { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, company_email_edit_access, email')
      .eq('id', caller.user.id)
      .maybeSingle()

    if (!callerProfile && callerEmail) {
      const { data: profileByEmail } = await adminClient
        .from('profiles')
        .select('role, company_email_edit_access, email')
        .ilike('email', callerEmail)
        .maybeSingle()
      callerProfile = profileByEmail
    }

    const userRole = (callerProfile?.role || caller.user.user_metadata?.role || caller.user.app_metadata?.role || '').toLowerCase().trim()
    const isOwnerEmail = callerEmail === 'tdvorak37@gmail.com' || callerEmail === 'support@echoaipro.com'
    const isSuperAdmin = userRole === 'admin' || userRole === 'super_admin' || isOwnerEmail
    const isPrivileged = PRIVILEGED_ROLES.has(userRole) || isSuperAdmin

    if (!isPrivileged) {
      return json({ error: 'Not authorised.' }, 403, request)
    }

    const effectiveCallerProfile = callerProfile ?? {
      role: userRole,
      company_email_edit_access: false,
      email: callerEmail,
    }
    const canEditEmail = isSuperAdmin || effectiveCallerProfile.company_email_edit_access === true

    const body = await request.json()
    const { action, fullName, company, email: targetEmail } = body
    const userId = body.userId || caller.user.id
    const globalActions = new Set([
      'create-user',
      'get-ticket-notification-config',
      'update-ticket-notification-config',
      'test-ticket-notification',
      'notify-ticket-created',
    ])
    if (!action || (!globalActions.has(action) && !userId)) {
      return json({ error: 'An action and userId are required.' }, 400, request)
    }

    if (action === 'get-ticket-notification-config') {
      const config = await getNotificationConfig(adminClient)
      return json({ config, canEdit: canEditEmail }, 200, request)
    }

    if (action === 'update-ticket-notification-config') {
      if (!canEditEmail) {
        return json({ error: 'Super Admin permission or granted Company Email editing access is required to modify mailbox passwords and notification parameters.' }, 403, request)
      }

      const {
        enabled,
        recipientEmail,
        secondaryEmail,
        senderName,
        subjectPrefix,
        includeFullDescription,
        notifyOnLandingTickets,
        notifyOnAppTickets,
        notifyOnCompanyRequests,
        webhookUrl,
        webhookEnabled,
        smtpHost,
        smtpPort,
        smtpEncryption,
        smtpUser,
        smtpPassword,
        resendApiKey,
        sendgridApiKey,
      } = body

      const updateData: Record<string, unknown> = {
        id: 'default',
        enabled: enabled !== false,
        recipient_email: typeof recipientEmail === 'string' ? recipientEmail.trim() : 'support@echoaipro.com',
        secondary_email: typeof secondaryEmail === 'string' ? secondaryEmail.trim() : '',
        sender_name: typeof senderName === 'string' ? senderName.trim().slice(0, 100) : 'EchoAI Support System',
        subject_prefix: typeof subjectPrefix === 'string' ? subjectPrefix.trim().slice(0, 50) : '[EchoAI Support]',
        include_full_description: includeFullDescription !== false,
        notify_on_landing_tickets: notifyOnLandingTickets !== false,
        notify_on_app_tickets: notifyOnAppTickets !== false,
        notify_on_company_requests: notifyOnCompanyRequests !== false,
        webhook_url: typeof webhookUrl === 'string' ? webhookUrl.trim().slice(0, 500) : '',
        webhook_enabled: webhookEnabled === true,
        smtp_host: typeof smtpHost === 'string' && smtpHost.trim() ? smtpHost.trim() : 'smtp.office365.com',
        smtp_port: Number(smtpPort) || 587,
        smtp_encryption: typeof smtpEncryption === 'string' ? smtpEncryption.trim() : 'STARTTLS',
        smtp_user: typeof smtpUser === 'string' && smtpUser.trim() ? smtpUser.trim() : 'support@echoaipro.com',
        updated_by: caller.user.id,
        updated_at: new Date().toISOString(),
      }

      const { data: existing } = await adminClient
        .from('support_ticket_notifications')
        .select('smtp_password, resend_api_key, sendgrid_api_key')
        .eq('id', 'default')
        .maybeSingle()

      if (typeof smtpPassword === 'string' && smtpPassword.trim()) {
        updateData.smtp_password = smtpPassword.trim()
      } else if (existing?.smtp_password) {
        updateData.smtp_password = existing.smtp_password
      }

      if (typeof resendApiKey === 'string') {
        updateData.resend_api_key = resendApiKey.trim()
      } else if (existing?.resend_api_key) {
        updateData.resend_api_key = existing.resend_api_key
      }

      if (typeof sendgridApiKey === 'string') {
        updateData.sendgrid_api_key = sendgridApiKey.trim()
      } else if (existing?.sendgrid_api_key) {
        updateData.sendgrid_api_key = existing.sendgrid_api_key
      }

      const { data: savedConfig, error: saveError } = await adminClient
        .from('support_ticket_notifications')
        .upsert(updateData, { onConflict: 'id' })
        .select('*')
        .single()

      if (saveError) {
        return json({ error: saveError.message }, 500, request)
      }

      await adminClient.from('admin_user_audit').insert({
        actor_id: caller.user.id,
        target_user_id: null,
        action: 'updated_support_notification_config',
        detail: { recipient_email: updateData.recipient_email, enabled: updateData.enabled },
      })

      return json({ config: savedConfig }, 200, request)
    }

    if (action === 'test-ticket-notification') {
      const testCategory = typeof body.category === 'string' ? body.category : 'Technical issue'
      const testDetails = typeof body.details === 'string' && body.details.trim()
        ? body.details.trim()
        : 'This is a test notification dispatched from the EchoAI Support Configuration Panel to verify outbound email and webhook routing.'

      const testResult = await sendSupportTicketEmail({
        ticketId: `test-${Date.now().toString(36)}`,
        requesterName: effectiveCallerProfile.role === 'admin' ? 'Super Admin (Test)' : 'Technician (Test)',
        requesterEmail: caller.user.email || 'support@echoaipro.com',
        category: `[TEST] ${testCategory}`,
        subject: `[TEST NOTIFICATION] EchoAI Support Routing Test`,
        details: testDetails,
        source: 'app',
        company: 'EchoAI Internal Test',
        createdAt: new Date().toISOString(),
      }, adminClient, {
        resend_api_key: typeof body.resendApiKey === 'string' ? body.resendApiKey.trim() : undefined,
        sendgrid_api_key: typeof body.sendgridApiKey === 'string' ? body.sendgridApiKey.trim() : undefined,
        recipient_email: typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : undefined,
        secondary_email: typeof body.secondaryEmail === 'string' ? body.secondaryEmail.trim() : undefined,
        smtp_user: typeof body.smtpUser === 'string' ? body.smtpUser.trim() : undefined,
      })

      if (testResult.error && !testResult.success) {
        return json({ error: testResult.error }, 400, request)
      }

      if (!testResult.success) {
        return json({ error: testResult.error || 'The notification provider did not accept the test email.' }, 502, request)
      }

      return json({
        ok: true,
        result: testResult,
        message: `Test notification sent successfully to ${(testResult.recipients || ['support@echoaipro.com']).join(', ')}. Provider: ${testResult.provider || 'default'}.`,
      }, 200, request)
    }

    if (action === 'notify-ticket-created') {
      const { ticketId, category, details, requesterName, requesterEmail, company: ticketCompany, source } = body
      if (!category || !details) {
        return json({ error: 'Category and details are required.' }, 400, request)
      }

      const notifyResult = await sendSupportTicketEmail({
        ticketId,
        category,
        details,
        requesterName: requesterName || caller.user.email,
        requesterEmail: requesterEmail || caller.user.email,
        company: ticketCompany,
        source: source || 'app',
        createdAt: new Date().toISOString(),
      }, adminClient)

      return json({ ok: true, result: notifyResult }, 200, request)
    }

    if (action === 'create-user') {
      if (!isSuperAdmin) {
        return json({ error: 'Super Admin access is required to create users.' }, 403, request)
      }

      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const newFullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 120) : ''
      const newCompany = typeof body.company === 'string' ? body.company.trim().slice(0, 120) : ''
      const role = typeof body.role === 'string' ? body.role : 'it'
      const profitSharePercent = Number(body.profitSharePercent || 0)
      if (!email || !newFullName || !newCompany || !['it', 'accountant', 'board_member', 'manager', 'user'].includes(role)) {
        return json({ error: 'Name, email, company, and a valid staff role are required.' }, 400, request)
      }
      if (role === 'board_member' && (!Number.isFinite(profitSharePercent) || profitSharePercent < 1 || profitSharePercent > 50)) {
        return json({ error: 'Board Member profit share must be between 1% and 50%.' }, 400, request)
      }

      const rawAppUrl = Deno.env.get('APP_URL') ?? ''
      const appUrl = rawAppUrl.trim().replace(/\/$/, '') || 'https://echoaipro.com'

      const { data: created, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: newFullName, company: newCompany },
        redirectTo: `${appUrl}/reset-password`,
      })
      let invitedUser = created?.user ?? null
      if (!invitedUser && createError) {
        const { data: users } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        invitedUser = users?.users?.find((user) => user.email?.toLowerCase() === email) ?? null
      }
      if (!invitedUser) {
        return json({ error: createError?.message || 'Could not create that user.' }, 409, request)
      }

      // Also generate a single-use setup / recovery link in case email delivery is delayed
      let directRecoveryLink: string | null = null
      try {
        const { data: recoveryData } = await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${appUrl}/reset-password` },
        })
        directRecoveryLink = recoveryData?.properties?.action_link ?? null
      } catch {
        // Link generation is a best-effort convenience alongside the invite email
      }

      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .upsert({ id: invitedUser.id, email, full_name: newFullName, company: newCompany, role, profit_share_percent: role === 'board_member' ? profitSharePercent : 0, access_status: 'active' }, { onConflict: 'id' })
        .select('id, full_name, email, company, role, profit_share_percent, access_status, storage_quota_mb, trademark_edit_access, developer_app_edit_access, company_email_edit_access')
        .single()
      if (profileError) return json({ error: 'User was invited but the profile could not be configured.' }, 500, request)

      await adminClient
        .from('access_requests')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('user_id', invitedUser.id)
        .eq('status', 'pending')

      await adminClient.from('admin_user_audit').insert({
        actor_id: caller.user.id,
        target_user_id: invitedUser.id,
        action: 'updated_profile',
        detail: { action: 'created-user', role },
      })
      return json({ profile, recoveryLink: directRecoveryLink }, 201, request)
    }

    const selfAction = effectiveCallerProfile.role === 'admin'
      && ((typeof targetEmail === 'string' && targetEmail.trim().toLowerCase() === callerEmail)
        || userId === caller.user.id)
    const lookupUserId = selfAction ? caller.user.id : userId

    const { data: targetById } = await adminClient
      .from('profiles')
      .select('id, full_name, email, company, role, is_board_member, profit_share_percent, access_status, is_beta_tester, ai_enabled, ai_access_note, trademark_edit_access, developer_app_edit_access, company_email_edit_access, created_at')
      .eq('id', lookupUserId)
      .maybeSingle()

    let target = targetById
    if (!target && typeof targetEmail === 'string' && targetEmail.trim()) {
      const { data: targetByEmail } = await adminClient
        .from('profiles')
        .select('id, full_name, email, company, role, is_board_member, profit_share_percent, access_status, is_beta_tester, ai_enabled, ai_access_note, trademark_edit_access, developer_app_edit_access, company_email_edit_access, created_at')
        .ilike('email', targetEmail.trim())
        .maybeSingle()
      target = targetByEmail
    }

    if (!target && ['set-trademark-edit-access', 'set-developer-app-edit-access', 'set-company-email-edit-access'].includes(action)) {
      let authTarget = userId ? (await adminClient.auth.admin.getUserById(userId)).data.user : null
      if (!authTarget && typeof targetEmail === 'string' && targetEmail.trim()) {
        const { data: users } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        authTarget = users?.users?.find((user) => user.email?.toLowerCase() === targetEmail.trim().toLowerCase()) ?? null
      }
      if (authTarget) {
        const metadata = authTarget.user_metadata ?? {}
        const { data: repairedProfile } = await adminClient
          .from('profiles')
          .upsert({
            id: authTarget.id,
            email: authTarget.email?.toLowerCase() ?? targetEmail.trim().toLowerCase(),
            full_name: metadata.full_name || authTarget.email?.split('@')[0] || 'Staff member',
            company: metadata.company || '',
            role: 'it',
            access_status: 'active',
          }, { onConflict: 'id' })
          .select('id, full_name, email, company, role, is_board_member, profit_share_percent, access_status, is_beta_tester, ai_enabled, ai_access_note, trademark_edit_access, developer_app_edit_access, company_email_edit_access, created_at')
          .single()
        target = repairedProfile
      }
    }

    if (!target) {
      return json({ error: `User not found for id '${userId || 'none'}' or email '${targetEmail || 'none'}'.` }, 404, request)
    }

    // Admins are excluded from these actions so one compromised admin account
    if (target.role === 'admin' && caller.user.id !== target.id && !isSuperAdmin) {
      return json({ error: 'Administrator accounts cannot be managed here.' }, 403, request)
    }

    if (['admin', 'manager', 'it', 'accountant'].includes(target.role) && !isSuperAdmin) {
      return json({ error: 'Only Super Admins can view or manage employee accounts.' }, 403, request)
    }

    const recordAudit = async (auditAction: string, detail: Record<string, unknown> = {}) => {
      await adminClient.from('admin_user_audit').insert({
        actor_id: caller.user.id,
        target_user_id: target.id,
        action: auditAction,
        detail,
      })
    }

    if (action === 'verification-summary') {
      const { data: authUser } = await adminClient.auth.admin.getUserById(userId)
      const { count: ticketCount } = await adminClient
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)

      const { data: recentTickets } = await adminClient
        .from('support_tickets')
        .select('id, category, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3)

      await recordAudit('viewed_verification')

      return json({
        summary: {
          fullName: target.full_name,
          email: target.email,
          company: target.company,
          role: target.role,
          accessStatus: target.access_status,
          signedUpAt: authUser?.user?.created_at ?? target.created_at,
          lastSignInAt: authUser?.user?.last_sign_in_at ?? null,
          emailConfirmedAt: authUser?.user?.email_confirmed_at ?? null,
          ticketCount: ticketCount ?? 0,
          recentTickets: recentTickets ?? [],
        },
      }, 200, request)
    }

    if (action === 'recovery-link') {
      if (!target.email) {
        return json({ error: 'That account has no email address on file.' }, 400, request)
      }

      const rawAppUrl = Deno.env.get('APP_URL') ?? ''
      const appUrl = rawAppUrl.trim().replace(/\/$/, '') || 'https://echoaipro.com'

      // generateLink issues a single-use recovery URL. The admin never learns or
      // sets the password; the user completes the reset themselves.
      const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: target.email,
        options: { redirectTo: `${appUrl}/reset-password` },
      })

      if (linkError) {
        return json({ error: 'Could not generate a recovery link.' }, 500, request)
      }

      await recordAudit('generated_recovery_link')

      return json({
        recoveryLink: link.properties?.action_link ?? null,
        expiresHint: 'This link is single-use and expires in 1 hour.',
      }, 200, request)
    }

    if (action === 'update-profile') {
      const patch: Record<string, string> = {}
      if (typeof fullName === 'string' && fullName.trim()) patch.full_name = fullName.trim().slice(0, 120)
      if (typeof company === 'string') patch.company = company.trim().slice(0, 120)

      if (!Object.keys(patch).length) {
        return json({ error: 'Nothing to update.' }, 400, request)
      }

      const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update(patch)
        .eq('id', target.id)
        .select('id, full_name, email, company, role, access_status')
        .maybeSingle()

      if (updateError) {
        return json({ error: 'Could not update that profile.' }, 500, request)
      }

      await recordAudit('updated_profile', patch)

      return json({ profile: updated }, 200, request)
    }

    if (action === 'set-beta-ai-access') {
      if (!['admin', 'manager', 'it'].includes(effectiveCallerProfile.role)) {
        return json({ error: 'IT or Management access is required to change beta AI access.' }, 403, request)
      }
      const isBetaTester = body.isBetaTester === true
      const enabled = body.enabled === true
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
      const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update({ is_beta_tester: isBetaTester, ai_enabled: isBetaTester ? enabled : true, ai_access_note: isBetaTester ? note : '' })
        .eq('id', target.id)
        .select('id, is_beta_tester, ai_enabled, ai_access_note')
        .single()
      if (updateError) return json({ error: 'Could not update beta AI access.' }, 500, request)
      await recordAudit('updated_beta_ai_access', { ai_enabled: enabled, ai_access_note: note })
      return json({ profile: updated }, 200, request)
    }

    if (action === 'set-trademark-edit-access') {
      if (!isSuperAdmin) {
        return json({ error: 'Super Admin access is required to grant trademark editing.' }, 403, request)
      }
      const enabled = body.enabled === true
      const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update({ trademark_edit_access: enabled })
        .eq('id', target.id)
        .select('id, trademark_edit_access')
        .single()
      if (updateError) return json({ error: 'Could not update trademark editing access.' }, 500, request)
      await recordAudit('updated_profile', { trademark_edit_access: enabled })
      return json({ profile: updated }, 200, request)
    }

    if (action === 'set-developer-app-edit-access') {
      if (!isSuperAdmin) {
        return json({ error: 'Super Admin access is required to grant Developer Apps editing.' }, 403, request)
      }
      const enabled = body.enabled === true
      const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update({ developer_app_edit_access: enabled })
        .eq('id', target.id)
        .select('id, developer_app_edit_access')
        .single()
      if (updateError) return json({ error: 'Could not update Developer Apps editing access.' }, 500, request)
      await recordAudit('updated_profile', { developer_app_edit_access: enabled })
      return json({ profile: updated }, 200, request)
    }

    if (action === 'set-company-email-edit-access') {
      if (!isSuperAdmin) {
        return json({ error: 'Super Admin access is required to grant Company Email & SMTP editing.' }, 403, request)
      }
      const enabled = body.enabled === true
      const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update({ company_email_edit_access: enabled })
        .eq('id', target.id)
        .select('id, company_email_edit_access')
        .single()
      if (updateError) return json({ error: 'Could not update Company Email editing access.' }, 500, request)
      await recordAudit('updated_profile', { company_email_edit_access: enabled })
      return json({ profile: updated }, 200, request)
    }

    if (action === 'set-board-member-profit-share') {
      if (!isSuperAdmin) {
        return json({ error: 'Super Admin access is required to edit Board Member profit share.' }, 403, request)
      }
      const profitSharePercent = Number(body.profitSharePercent)
      if (!Number.isFinite(profitSharePercent) || profitSharePercent < 1 || profitSharePercent > 50) {
        return json({ error: 'Profit share must be between 1% and 50%.' }, 400, request)
      }
      const isCallerSelf = target.id === caller.user.id || (typeof targetEmail === 'string' && targetEmail.trim().toLowerCase() === callerEmail)
      if (!target.is_board_member && target.role !== 'board_member' && !(isCallerSelf && isSuperAdmin)) {
        return json({ error: 'The selected user is not a Board Member.' }, 400, request)
      }
      const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update({ profit_share_percent: profitSharePercent, ...(isCallerSelf ? { is_board_member: true } : {}) })
        .eq('id', target.id)
        .select('id, is_board_member, profit_share_percent')
        .single()
      if (updateError) return json({ error: 'Could not update Board Member profit share.' }, 500, request)
      await recordAudit('updated_profile', { profit_share_percent: profitSharePercent })
      return json({ profile: updated }, 200, request)
    }

    if (action === 'set-board-membership') {
      if (!isSuperAdmin) return json({ error: 'Super Admin access is required to edit Board Membership.' }, 403, request)
      const enabled = body.enabled === true
      const share = Number(body.profitSharePercent || 0)
      if (enabled && (!Number.isFinite(share) || share < 1 || share > 50)) return json({ error: 'Board Member profit share must be between 1% and 50%.' }, 400, request)
      const nextRole = !enabled && target.role === 'board_member' ? 'user' : target.role
      const { data: updated, error: updateError } = await adminClient.from('profiles').update({ role: nextRole, is_board_member: enabled, profit_share_percent: enabled ? share : 0 }).eq('id', target.id).select('id, role, is_board_member, profit_share_percent').single()
      if (updateError) return json({ error: 'Could not update Board Membership.' }, 500, request)
      await recordAudit('updated_profile', { role: nextRole, is_board_member: enabled, profit_share_percent: enabled ? share : 0 })
      return json({ profile: updated }, 200, request)
    }

    return json({ error: 'Unknown action.' }, 400, request)
  } catch {
    return json({ error: 'Unexpected error.' }, 500, request)
  }
})
