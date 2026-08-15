import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { DEFAULT_AGENT_CAPABILITIES } from './aiAgentService'

const DEMO_OTP = '123456'
const DEMO_USERS = [
  {
    id: 'demo-admin-1',
    fullName: 'Admin User',
    email: 'admin@company.com',
    company: 'EchoAI Media',
    password: 'admin123',
    role: 'admin',
    accessStatus: 'active',
    storageQuotaMb: 2048,
  },
  {
    id: 'demo-user-3',
    fullName: 'Taylor Morgan',
    email: 'taylor@company.com',
    company: 'EchoAI Media',
    password: 'user123',
    role: 'user',
    accessStatus: 'active',
    storageQuotaMb: 2048,
  },
  {
    id: 'demo-accountant-1',
    fullName: 'Sam Rivers',
    email: 'accountant@company.com',
    company: 'EchoAI Media',
    password: 'acct123',
    role: 'accountant',
    accessStatus: 'active',
    storageQuotaMb: 2048,
  },
]

const DEMO_ACCESS_REQUESTS = []

const BLOCKED_STATUS_MESSAGES = {
  pending: 'Your account is not active yet. Complete your subscription to unlock access.',
  denied: 'Your account request was denied. Contact Management or IT for help.',
  deactivated: 'Your access is inactive. This usually means a subscription lapsed or a payment failed — renew to restore it instantly.',
}

const assertAccountCanAccess = (accessStatus) => {
  if (!accessStatus || accessStatus === 'active' || accessStatus === 'approved') {
    return
  }

  throw new Error(
    BLOCKED_STATUS_MESSAGES[accessStatus] ??
      'Your account does not currently have access. Contact Management or IT.',
  )
}

const normalizeRequest = (record) => ({
  id: record.id,
  userId: record.user_id,
  fullName: record.full_name,
  email: record.email,
  company: record.company,
  status: record.status,
  requestedAt: record.requested_at,
  reviewedAt: record.reviewed_at,
})

const normalizeAiAgentConfig = (value) => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const hasCapabilityField = Object.prototype.hasOwnProperty.call(value, 'capabilities')
  const capabilityList = hasCapabilityField
    ? (Array.isArray(value.capabilities) ? value.capabilities.filter(Boolean) : [])
    : DEFAULT_AGENT_CAPABILITIES

  return {
    enabled: Boolean(value.enabled),
    name: value.name || 'My AI Agent',
    endpoint: value.endpoint || '',
    apiKey: value.apiKey || '',
    model: value.model || '',
    capabilities: capabilityList,
    personas: Array.isArray(value.personas) ? value.personas.filter((persona) => persona?.id && persona?.name) : [],
    routing: value.routing && typeof value.routing === 'object'
      ? value.routing
      : { strategy: 'best_quality', allowFallback: true },
    negativePrompt: value.negativePrompt || '',
    defaultStyle: value.defaultStyle || '',
    lastSyncedAt: value.lastSyncedAt || '',
    status: value.status || 'not connected',
    message: value.message || 'Connect an in-house AI endpoint for writing, documents, images, characters, video, audio, and media analysis.',
  }
}

const normalizeMember = (record) => ({
  id: record.id,
  fullName: record.full_name,
  email: record.email,
  company: record.company,
  role: record.role,
  accessStatus: record.access_status,
  storageQuotaMb: record.storage_quota_mb ?? record.storageQuotaMb ?? 2048,
  aiAgentConfig: normalizeAiAgentConfig(record.ai_agent_config ?? record.aiAgentConfig),
})

const getProfileByUser = async ({ userId, email }) => {
  if (!userId && !email) {
    return null
  }

  if (userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    if (data) {
      return data
    }
  }

  if (email) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  return null
}

export const authService = {
  async signIn({ email, password }) {
    if (!email || !password) {
      throw new Error('Email and password are required.')
    }

    if (!isSupabaseConfigured) {
      const demoUser = DEMO_USERS.find(
        (user) =>
          user.email.toLowerCase() === email.toLowerCase() &&
          user.password === password,
      )

      if (!demoUser) {
        throw new Error('Invalid demo credentials.')
      }

      assertAccountCanAccess(demoUser.accessStatus)

      return {
        mfaRequired: true,
        user: null,
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(error.message)
    }

    try {
      const profile = await getProfileByUser({
        userId: data.user?.id,
        email,
      })

      assertAccountCanAccess(profile?.access_status ?? 'pending')
    } catch (accessError) {
      await supabase.auth.signOut()
      throw accessError
    }

    // Real second factor. The password alone leaves the session at aal1, and
    // RLS rejects aal1 for anyone who has enrolled a factor, so this cannot be
    // skipped by talking to the API directly.
    const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors()
    if (factorError) {
      throw new Error(factorError.message)
    }

    const totpFactor = (factorData?.totp ?? []).find((factor) => factor.status === 'verified')

    if (!totpFactor) {
      return {
        mfaRequired: false,
        enrollmentRequired: true,
        user: {
          ...data.user,
          role: 'user',
          accessStatus: 'active',
        },
      }
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    })

    if (challengeError) {
      throw new Error(challengeError.message)
    }

    return {
      mfaRequired: true,
      factorId: totpFactor.id,
      challengeId: challenge.id,
      user: null,
    }
  },

  async verifyMfaCode({ email, code, factorId, challengeId }) {
    if (!code) {
      throw new Error('A verification code is required.')
    }

    if (!isSupabaseConfigured) {
      if (code !== DEMO_OTP) {
        throw new Error('Invalid code. Use 123456 in demo mode.')
      }

      const demoUser = DEMO_USERS.find(
        (user) => user.email.toLowerCase() === email.toLowerCase(),
      )

      assertAccountCanAccess(demoUser?.accessStatus ?? 'pending')

      return {
        user: {
          id: demoUser?.id ?? 'demo-user-1',
          email: demoUser?.email ?? email,
          role: demoUser?.role ?? 'user',
          accessStatus: demoUser?.accessStatus ?? 'active',
          storageQuotaMb: demoUser?.storageQuotaMb ?? 2048,
        },
      }
    }

    if (!factorId || !challengeId) {
      throw new Error('Your sign-in attempt expired. Please start again.')
    }

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.replace(/\s/g, ''),
    })

    if (error) {
      throw new Error(error.message)
    }

    const profile = await getProfileByUser({
      userId: data.user?.id,
      email,
    })

    try {
      assertAccountCanAccess(profile?.access_status ?? 'pending')
    } catch (accessError) {
      await supabase.auth.signOut()
      throw accessError
    }

    return {
      user: {
        ...data.user,
        role: profile?.role ?? data.user?.user_metadata?.role ?? 'user',
        accessStatus: profile?.access_status ?? 'active',
      },
    }
  },

  async signUp({ email, password, fullName, company }) {
    if (!email || !password || !fullName) {
      throw new Error('Full name, email, and password are required.')
    }

    if (!isSupabaseConfigured) {
      const normalizedEmail = email.toLowerCase()
      const newUserId = `demo-user-${Date.now()}`

      DEMO_USERS.push({
        id: newUserId,
        fullName,
        email: normalizedEmail,
        company,
        password,
        role: 'user',
        accessStatus: 'pending',
        storageQuotaMb: 2048,
      })

      DEMO_ACCESS_REQUESTS.push({
        id: `req_${Date.now()}`,
        userId: newUserId,
        fullName,
        email: normalizedEmail,
        company,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        reviewedAt: null,
      })

      return { ok: true }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          company,
        },
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    const userId = data.user?.id
    if (!userId) {
      throw new Error(
        'Signup created an account request but no user ID was returned. Check Supabase auth settings.',
      )
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      email,
      company,
      role: 'user',
      access_status: 'pending',
      ai_agent_config: {},
    })

    if (profileError) {
      throw new Error(profileError.message)
    }

    // The claim_subscription_for_new_profile trigger attaches any subscription
    // already paid for under this email and flips access to active. Only accounts
    // without billing coverage fall back to the manual approval queue.
    const { data: createdProfile } = await supabase
      .from('profiles')
      .select('access_status')
      .eq('id', userId)
      .maybeSingle()

    if (createdProfile?.access_status === 'active') {
      return { ok: true, activated: true }
    }

    const { error: requestError } = await supabase.from('access_requests').insert({
      user_id: userId,
      full_name: fullName,
      email,
      company,
      status: 'pending',
    })

    if (requestError) {
      throw new Error(requestError.message)
    }

    return { ok: true, activated: false }
  },

  async getAccessRequests() {
    if (!isSupabaseConfigured) {
      return DEMO_ACCESS_REQUESTS.map((request) => ({ ...request })).sort(
        (a, b) => new Date(b.requestedAt) - new Date(a.requestedAt),
      )
    }

    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .order('requested_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return (data ?? []).map(normalizeRequest)
  },

  async getManagedUsers() {
    if (!isSupabaseConfigured) {
      return DEMO_USERS.map((user) => {
        const userWithoutPassword = { ...user }
        delete userWithoutPassword.password
        return userWithoutPassword
      })
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return (data ?? []).map(normalizeMember)
  },

  async reviewAccessRequest({ requestId, decision }) {
    if (!requestId || !decision) {
      throw new Error('Request ID and decision are required.')
    }

    if (!['approved', 'denied'].includes(decision)) {
      throw new Error('Decision must be approved or denied.')
    }

    if (!isSupabaseConfigured) {
      const request = DEMO_ACCESS_REQUESTS.find((item) => item.id === requestId)
      if (!request) {
        throw new Error('Access request not found.')
      }

      request.status = decision
      request.reviewedAt = new Date().toISOString()

      const member = DEMO_USERS.find((user) => user.id === request.userId)
      if (member) {
        member.accessStatus = decision === 'approved' ? 'active' : 'denied'
      }

      return {
        request: { ...request },
        member: member
          ? {
              id: member.id,
              fullName: member.fullName,
              email: member.email,
              company: member.company,
              role: member.role,
              accessStatus: member.accessStatus,
            }
          : null,
      }
    }

    const { data: requestData, error: requestLookupError } = await supabase
      .from('access_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (requestLookupError) {
      throw new Error(requestLookupError.message)
    }

    if (!requestData) {
      throw new Error('Access request not found.')
    }

    const { data: updatedRequest, error: requestUpdateError } = await supabase
      .from('access_requests')
      .update({
        status: decision,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('*')
      .single()

    if (requestUpdateError) {
      throw new Error(requestUpdateError.message)
    }

    const nextStatus = decision === 'approved' ? 'active' : 'denied'
    let profileQuery = supabase
      .from('profiles')
      .update({ access_status: nextStatus })

    if (requestData.user_id) {
      profileQuery = profileQuery.eq('id', requestData.user_id)
    } else {
      profileQuery = profileQuery.eq('email', requestData.email)
    }

    const { data: updatedProfiles, error: profileUpdateError } = await profileQuery
      .select('*')

    if (profileUpdateError) {
      throw new Error(profileUpdateError.message)
    }

    return {
      request: normalizeRequest(updatedRequest),
      member: updatedProfiles?.[0] ? normalizeMember(updatedProfiles[0]) : null,
    }
  },

  async updateUserAccessStatus({ userId, accessStatus }) {
    if (!userId || !accessStatus) {
      throw new Error('User ID and access status are required.')
    }

    if (!['active', 'deactivated'].includes(accessStatus)) {
      throw new Error('Access status must be active or deactivated.')
    }

    if (!isSupabaseConfigured) {
      const member = DEMO_USERS.find((user) => user.id === userId)
      if (!member) {
        throw new Error('User not found.')
      }

      member.accessStatus = accessStatus
      return {
        id: member.id,
        fullName: member.fullName,
        email: member.email,
        company: member.company,
        role: member.role,
        accessStatus: member.accessStatus,
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ access_status: accessStatus })
      .eq('id', userId)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeMember(data)
  },

  async updateUserRole({ userId, role }) {
    if (!userId || !role) {
      throw new Error('User ID and role are required.')
    }

    if (!['user', 'manager', 'it', 'accountant', 'admin'].includes(role)) {
      throw new Error('Role must be user, manager, it, accountant, or admin.')
    }

    if (!isSupabaseConfigured) {
      const member = DEMO_USERS.find((user) => user.id === userId)
      if (!member) {
        throw new Error('User not found.')
      }

      member.role = role
      return {
        id: member.id,
        fullName: member.fullName,
        email: member.email,
        company: member.company,
        role: member.role,
        accessStatus: member.accessStatus,
        storageQuotaMb: member.storageQuotaMb,
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeMember(data)
  },

  async updateUserStorageQuota({ userId, storageQuotaMb }) {
    if (!userId || storageQuotaMb === undefined || storageQuotaMb === null) {
      throw new Error('User ID and storage quota are required.')
    }

    const parsedQuota = Number(storageQuotaMb)
    if (!Number.isFinite(parsedQuota) || parsedQuota <= 0) {
      throw new Error('Storage quota must be a positive number.')
    }

    if (!isSupabaseConfigured) {
      const member = DEMO_USERS.find((user) => user.id === userId)
      if (!member) {
        throw new Error('User not found.')
      }

      member.storageQuotaMb = parsedQuota
      return {
        id: member.id,
        fullName: member.fullName,
        email: member.email,
        company: member.company,
        role: member.role,
        accessStatus: member.accessStatus,
        storageQuotaMb: member.storageQuotaMb,
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ storage_quota_mb: parsedQuota })
      .eq('id', userId)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeMember(data)
  },

  async getUserAiAgentConfig({ userId, email }) {
    if (!userId && !email) {
      return null
    }

    if (!isSupabaseConfigured) {
      const demoUser = DEMO_USERS.find(
        (user) => user.id === userId || (email && user.email.toLowerCase() === email.toLowerCase()),
      )

      return normalizeAiAgentConfig(demoUser?.aiAgentConfig)
    }

    // Secrets live in an owner-only table; profiles is readable by staff and teammates.
    const { data, error } = await supabase
      .from('user_ai_agent_config')
      .select('config')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeAiAgentConfig(data?.config)
  },

  async updateUserAiAgentConfig({ userId, aiAgentConfig }) {
    if (!userId) {
      throw new Error('User ID is required.')
    }

    const normalizedConfig = normalizeAiAgentConfig(aiAgentConfig) ?? normalizeAiAgentConfig({})

    if (!isSupabaseConfigured) {
      const member = DEMO_USERS.find((user) => user.id === userId)
      if (!member) {
        throw new Error('User not found.')
      }

      member.aiAgentConfig = normalizedConfig
      return normalizedConfig
    }

    const { data, error } = await supabase
      .from('user_ai_agent_config')
      .upsert({ user_id: userId, config: normalizedConfig, updated_at: new Date().toISOString() })
      .select('config')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeAiAgentConfig(data?.config)
  },

  // --- Multi-factor authentication ----------------------------------------

  async listMfaFactors() {
    if (!isSupabaseConfigured) {
      return { totp: [], hasVerifiedFactor: false }
    }

    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      throw new Error(error.message)
    }

    const totp = data?.totp ?? []
    return { totp, hasVerifiedFactor: totp.some((factor) => factor.status === 'verified') }
  },

  // Returns the QR code Supabase generates, so no QR library is needed.
  async startMfaEnrollment() {
    if (!isSupabaseConfigured) {
      throw new Error('Connect Supabase to enable authenticator apps.')
    }

    // A half-finished enrolment blocks a new one, so clear those first.
    const { totp } = await authService.listMfaFactors()
    await Promise.all(
      totp
        .filter((factor) => factor.status !== 'verified')
        .map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })),
    )

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `EchoAI ${new Date().toISOString().slice(0, 10)}`,
    })

    if (error) {
      throw new Error(error.message)
    }

    return {
      factorId: data.id,
      qrCode: data.totp?.qr_code,
      secret: data.totp?.secret,
      uri: data.totp?.uri,
    }
  },

  async confirmMfaEnrollment({ factorId, code }) {
    if (!factorId || !code) {
      throw new Error('Enter the 6-digit code from your authenticator app.')
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s/g, ''),
    })

    if (error) {
      throw new Error(error.message)
    }

    // Only issued once, at enrolment.
    const { data, error: codesError } = await supabase.rpc('generate_mfa_recovery_codes')
    if (codesError) {
      throw new Error(codesError.message)
    }

    return { recoveryCodes: data ?? [] }
  },

  async disableMfa({ factorId }) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) {
      throw new Error(error.message)
    }
    return true
  },

  async regenerateRecoveryCodes() {
    const { data, error } = await supabase.rpc('generate_mfa_recovery_codes')
    if (error) {
      throw new Error(error.message)
    }
    return data ?? []
  },

  // Used when the authenticator is lost. Handled server-side so a recovery code
  // can never mint a session on its own.
  async recoverWithBackupCode({ email, password, recoveryCode }) {
    const { data, error } = await supabase.functions.invoke('mfa-recover', {
      body: { email, password, recoveryCode },
    })

    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || error.message)
    }

    return data
  },

  async createSupportTicket({ category, details }) {
    if (!category || !details) {
      throw new Error('Support category and details are required.')
    }

    if (!isSupabaseConfigured) {
      return {
        id: `ticket_${Date.now()}`,
        category,
        details,
        status: 'open',
      }
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      throw new Error(userError.message)
    }

    if (!user) {
      throw new Error('No authenticated user available for ticket creation.')
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        category,
        details,
        status: 'open',
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  },

  async requestPasswordReset(email) {
    if (!email) {
      throw new Error('Email is required.')
    }

    if (!isSupabaseConfigured) {
      return { ok: true }
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      throw new Error(error.message)
    }

    return { ok: true }
  },

  async signOut() {
    if (!isSupabaseConfigured) {
      return
    }

    await supabase.auth.signOut()
  },
}
