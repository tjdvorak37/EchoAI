// Authenticator recovery. Verifying a backup code here (rather than in the
// browser) means a recovery code can never mint a session by itself: it only
// removes the lost factor, and the user must re-enrol on their next sign-in.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const { email, password, recoveryCode } = await request.json()

    if (!email || !password || !recoveryCode) {
      return json({ error: 'Email, password, and a recovery code are required.' }, 400)
    }

    // The password must still be correct: a stolen recovery code alone is useless.
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: signIn, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !signIn.user) {
      // Deliberately vague: do not confirm whether the email exists.
      return json({ error: 'Those details did not match.' }, 401)
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: consumed, error: consumeError } = await adminClient.rpc(
      'consume_mfa_recovery_code',
      { p_user_id: signIn.user.id, p_code: recoveryCode },
    )

    if (consumeError) {
      console.error('recovery code check failed', consumeError)
      return json({ error: 'Unable to verify that code.' }, 500)
    }

    if (!consumed) {
      return json({ error: 'Those details did not match.' }, 401)
    }

    const { data: factors, error: factorError } =
      await adminClient.auth.admin.mfa.listFactors({ userId: signIn.user.id })

    if (factorError) {
      console.error('listFactors failed', factorError)
      return json({ error: 'Unable to reset your authenticator.' }, 500)
    }

    for (const factor of factors?.factors ?? []) {
      await adminClient.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: signIn.user.id,
      })
    }

    return json({
      ok: true,
      message: 'Authenticator removed. Sign in with your password and set up a new one.',
    })
  } catch (error) {
    console.error('mfa-recover failed', error)
    return json({ error: 'Recovery failed. Please contact support.' }, 500)
  }
})
