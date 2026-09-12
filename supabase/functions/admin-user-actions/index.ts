// Privileged user-support actions for admins. The caller's role is re-checked
// here with the service role key: a browser can claim any role, so the client's
// own view of who it is never decides access.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const PRIVILEGED_ROLES = new Set(['admin', 'it'])

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

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.user.id)
      .maybeSingle()

    if (!callerProfile || !PRIVILEGED_ROLES.has(callerProfile.role)) {
      return json({ error: 'Not authorised.' }, 403, request)
    }

    const body = await request.json()
    const { action, userId, fullName, company, email: targetEmail } = body
    if (!action || (action !== 'create-user' && !userId)) {
      return json({ error: 'An action and userId are required.' }, 400, request)
    }

    if (action === 'create-user') {
      if (callerProfile.role !== 'admin') {
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
      if (role === 'board_member' && (!Number.isFinite(profitSharePercent) || profitSharePercent < 1 || profitSharePercent > 10)) {
        return json({ error: 'Board Member profit share must be between 1% and 10%.' }, 400, request)
      }

      const { data: created, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: newFullName, company: newCompany },
        redirectTo: `${Deno.env.get('APP_URL') ?? ''}/`,
      })
      let invitedUser = created?.user ?? null
      if (!invitedUser && createError) {
        const { data: users } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        invitedUser = users?.users?.find((user) => user.email?.toLowerCase() === email) ?? null
      }
      if (!invitedUser) {
        return json({ error: createError?.message || 'Could not create that user.' }, 409, request)
      }

      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .upsert({ id: invitedUser.id, email, full_name: newFullName, company: newCompany, role, profit_share_percent: role === 'board_member' ? profitSharePercent : 0, access_status: 'active' }, { onConflict: 'id' })
        .select('id, full_name, email, company, role, profit_share_percent, access_status, storage_quota_mb, trademark_edit_access, developer_app_edit_access')
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
      return json({ profile }, 201, request)
    }

    const callerEmail = caller.user.email?.toLowerCase() ?? ''
    const selfAction = callerProfile.role === 'admin'
      && ((typeof targetEmail === 'string' && targetEmail.trim().toLowerCase() === callerEmail)
        || userId === caller.user.id)
    const lookupUserId = selfAction ? caller.user.id : userId

    const { data: targetById } = await adminClient
      .from('profiles')
      .select('id, full_name, email, company, role, is_board_member, profit_share_percent, access_status, trademark_edit_access, developer_app_edit_access, created_at')
        .eq('id', lookupUserId)
      .maybeSingle()

    let target = targetById
    if (!target && typeof targetEmail === 'string' && targetEmail.trim()) {
      const { data: targetByEmail } = await adminClient
        .from('profiles')
        .select('id, full_name, email, company, role, is_board_member, profit_share_percent, access_status, trademark_edit_access, developer_app_edit_access, created_at')
        .ilike('email', targetEmail.trim())
        .maybeSingle()
      target = targetByEmail
    }

    if (!target && ['set-trademark-edit-access', 'set-developer-app-edit-access'].includes(action)) {
      let authTarget = userId ? (await adminClient.auth.admin.getUserById(userId)).data.user : null
      if (!authTarget && typeof targetEmail === 'string' && targetEmail.trim()) {
        const { data: users } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (target.role === 'admin' && caller.user.id !== target.id) {
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
          .select('id, full_name, email, company, role, access_status, trademark_edit_access, developer_app_edit_access, created_at')
          .single()
        target = repairedProfile
      }
    }

    if (!target) {
      return json({ error: `User not found for id '${userId || 'none'}' or email '${targetEmail || 'none'}'.` }, 404, request)
    }

    // Admins are excluded from these actions so one compromised admin account
        if (!target.is_board_member && target.role !== 'board_member') {
    if (target.role === 'admin' && caller.user.id !== target.id) {
      return json({ error: 'Administrator accounts cannot be managed here.' }, 403, request)
    }

    if (['admin', 'manager', 'it', 'accountant'].includes(target.role) && callerProfile.role !== 'admin') {
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

      // generateLink issues a single-use recovery URL. The admin never learns or
      // sets the password; the user completes the reset themselves.
      const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: target.email,
        options: { redirectTo: `${Deno.env.get('APP_URL') ?? ''}/?recovery=1` },
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

    if (action === 'set-trademark-edit-access') {
      if (callerProfile.role !== 'admin') {
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
      if (callerProfile.role !== 'admin') {
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

    if (action === 'set-board-member-profit-share') {
      if (callerProfile.role !== 'admin') {
        return json({ error: 'Super Admin access is required to edit Board Member profit share.' }, 403, request)
      }
      const profitSharePercent = Number(body.profitSharePercent)
      if (!Number.isFinite(profitSharePercent) || profitSharePercent < 1 || profitSharePercent > 10) {
        return json({ error: 'Profit share must be between 1% and 10%.' }, 400, request)
      }
      if (!target.is_board_member && target.role !== 'board_member' && !(target.id === caller.user.id && callerProfile.role === 'admin')) {
        return json({ error: 'The selected user is not a Board Member.' }, 400, request)
      }
      const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update({ profit_share_percent: profitSharePercent, ...(target.id === caller.user.id ? { is_board_member: true } : {}) })
        .eq('id', target.id)
        .select('id, is_board_member, profit_share_percent')
        .single()
      if (updateError) return json({ error: 'Could not update Board Member profit share.' }, 500, request)
      await recordAudit('updated_profile', { profit_share_percent: profitSharePercent })
      return json({ profile: updated }, 200, request)
    }

    if (action === 'set-board-membership') {
      if (callerProfile.role !== 'admin') return json({ error: 'Super Admin access is required to edit Board Membership.' }, 403, request)
      const enabled = body.enabled === true
      const share = Number(body.profitSharePercent || 0)
      if (enabled && (!Number.isFinite(share) || share < 1 || share > 10)) return json({ error: 'Board Member profit share must be between 1% and 10%.' }, 400, request)
      const { data: updated, error: updateError } = await adminClient.from('profiles').update({ is_board_member: enabled, profit_share_percent: enabled ? share : 0 }).eq('id', target.id).select('id, is_board_member, profit_share_percent').single()
      if (updateError) return json({ error: 'Could not update Board Membership.' }, 500, request)
      await recordAudit('updated_profile', { is_board_member: enabled, profit_share_percent: enabled ? share : 0 })
      return json({ profile: updated }, 200, request)
    }

    return json({ error: 'Unknown action.' }, 400, request)
  } catch {
    return json({ error: 'Unexpected error.' }, 500, request)
  }
})
