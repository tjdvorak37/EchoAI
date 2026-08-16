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

    const { action, userId, fullName, company } = await request.json()
    if (!action || !userId) {
      return json({ error: 'An action and userId are required.' }, 400, request)
    }

    const { data: target } = await adminClient
      .from('profiles')
      .select('id, full_name, email, company, role, access_status, created_at')
      .eq('id', userId)
      .maybeSingle()

    if (!target) {
      return json({ error: 'User not found.' }, 404, request)
    }

    // Admins are excluded from these actions so one compromised admin account
    // cannot be used to take over another.
    if (target.role === 'admin' && caller.user.id !== target.id) {
      return json({ error: 'Administrator accounts cannot be managed here.' }, 403, request)
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
        .eq('id', userId)
        .select('id, full_name, email, company, role, access_status')
        .maybeSingle()

      if (updateError) {
        return json({ error: 'Could not update that profile.' }, 500, request)
      }

      await recordAudit('updated_profile', patch)

      return json({ profile: updated }, 200, request)
    }

    return json({ error: 'Unknown action.' }, 400, request)
  } catch {
    return json({ error: 'Unexpected error.' }, 500, request)
  }
})
