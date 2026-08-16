import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { DEFAULT_AGENT_CAPABILITIES } from './aiAgentService'

const DEMO_ACCESS_REQUESTS = []
const DEMO_USERS = []

const assertAccountCanAccess = (accessStatus, role = 'user') => {
  const normalizedRole = String(role || '').toLowerCase()

  if (normalizedRole === 'admin' || normalizedRole === 'super_admin') {
    return
  }

  if (!accessStatus || accessStatus === 'active' || accessStatus === 'approved') {
    return
  }

  throw new Error(
    BLOCKED_STATUS_MESSAGES[accessStatus] ??
      'Your account does not currently have access. Contact Management or IT.',
  )
}

const BLOCKED_STATUS_MESSAGES = {
  pending: 'Your account is not active yet. Complete your subscription to unlock access.',
  denied: 'Your account request was denied. Contact Management or IT for help.',
  deactivated: 'Your access is inactive. This usually means a subscription lapsed or a payment failed — renew to restore it instantly.',
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

const CONTACT_CARD_COLUMNS = {
  fullName: 'full_name',
  company: 'company',
  phone: 'phone',
  jobTitle: 'job_title',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  city: 'city',
  stateRegion: 'state_region',
  postalCode: 'postal_code',
  country: 'country',
  calendarUrl: 'calendar_url',
}

const normalizeContactCard = (record = {}) => ({
  id: record.id ?? '',
  email: record.email ?? '',
  role: record.role ?? 'user',
  fullName: record.full_name ?? '',
  company: record.company ?? '',
  phone: record.phone ?? '',
  jobTitle: record.job_title ?? '',
  addressLine1: record.address_line1 ?? '',
  addressLine2: record.address_line2 ?? '',
  city: record.city ?? '',
  stateRegion: record.state_region ?? '',
  postalCode: record.postal_code ?? '',
  country: record.country ?? '',
  calendarUrl: record.calendar_url ?? '',
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
    const normalizedEmail = String(email).trim()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  return null
}

export const authService = {
  async restoreSession() {
    if (!isSupabaseConfigured) return null

    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw new Error(error.message)
    if (!session?.user) return null

    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError) throw new Error(assuranceError.message)

    // A verified MFA factor requires an AAL2 session; never restore an AAL1
    // session into the authenticated workspace.
    if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') return null

    const profile = await getProfileByUser({
      userId: session.user.id,
      email: session.user.email,
    })
    if (!profile) return null

    assertAccountCanAccess(profile.access_status ?? 'pending', profile.role)

    return {
      ...session.user,
      role: profile.role ?? session.user.user_metadata?.role ?? 'user',
      accessStatus: profile.access_status ?? 'active',
      company: profile.company ?? '',
    }
  },

  async signIn({ email, password }) {
    if (!email || !password) {
      throw new Error('Email and password are required.')
    }

    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Contact support to restore access.')
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(error.message)
    }

    try {
      const { error: seatClaimError } = await supabase.rpc('claim_company_seat', {
        p_user_id: data.user?.id,
      })
      if (seatClaimError) {
        throw new Error(seatClaimError.message)
      }

      const profile = await getProfileByUser({
        userId: data.user?.id,
        email,
      })

      // A null profile here means RLS withheld the row at aal1, not that the
      // account is pending. The real check runs again after MFA verification.
      if (profile) {
        assertAccountCanAccess(profile.access_status ?? 'pending', profile.role)
      }
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
      const profile = await getProfileByUser({ userId: data.user?.id, email })

      return {
        mfaRequired: false,
        enrollmentRequired: true,
        user: {
          ...data.user,
          role: profile?.role ?? 'user',
          accessStatus: profile?.access_status ?? 'active',
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
      throw new Error('Supabase is not configured. Contact support to restore access.')
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
      assertAccountCanAccess(profile?.access_status ?? 'pending', profile?.role)
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

    // With email confirmation enabled, signUp returns the user but no session.
    // The auth.users trigger provisions the profile and access request.
    if (!data.session) {
      return { ok: true, activated: false, verificationRequired: true }
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

    const { data: seatClaimed, error: seatClaimError } = await supabase.rpc('claim_company_seat', {
      p_user_id: userId,
    })

    if (seatClaimError) {
      throw new Error(seatClaimError.message)
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
      return { ok: true, activated: true, seatActivated: Boolean(seatClaimed) }
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

    return { ok: true, activated: false, seatActivated: Boolean(seatClaimed) }
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

  async getCompanySeatData({ companyKey }) {
    if (!companyKey) return { package: null, seats: [] }

    if (!isSupabaseConfigured) {
      return { package: null, seats: [] }
    }

    const [{ data: packages, error: packageError }, { data: seats, error: seatError }] = await Promise.all([
      supabase.from('company_seat_packages').select('*').eq('company_key', companyKey).maybeSingle(),
      supabase.from('company_seats').select('*').eq('company_key', companyKey).order('assigned_at', { ascending: false }),
    ])

    if (packageError) throw new Error(packageError.message)
    if (seatError) throw new Error(seatError.message)

    return {
      package: packages
        ? { id: packages.id, companyKey: packages.company_key, seatLimit: packages.seat_limit, status: packages.status }
        : null,
      seats: (seats ?? []).map((seat) => ({
        id: seat.id,
        packageId: seat.package_id,
        employeeEmail: seat.employee_email,
        profileId: seat.profile_id,
        status: seat.status,
        assignedAt: seat.assigned_at,
        claimedAt: seat.claimed_at,
      })),
    }
  },

  async createCompanySeatPackage({ companyKey, seatLimit }) {
    const normalizedCompany = companyKey?.trim().toLowerCase()
    const parsedLimit = Number(seatLimit)
    if (!normalizedCompany || !Number.isInteger(parsedLimit) || parsedLimit < 1) {
      throw new Error('A company name and a positive whole-number seat limit are required.')
    }

    if (!isSupabaseConfigured) {
      return { id: 'demo-seat-package', companyKey: normalizedCompany, seatLimit: parsedLimit, status: 'active' }
    }

    const { data, error } = await supabase
      .from('company_seat_packages')
      .insert({ company_key: normalizedCompany, seat_limit: parsedLimit, created_by: (await supabase.auth.getUser()).data.user?.id })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return { id: data.id, companyKey: data.company_key, seatLimit: data.seat_limit, status: data.status }
  },

  async assignCompanySeat({ packageId, companyKey, employeeEmail }) {
    const normalizedEmail = employeeEmail?.trim().toLowerCase()
    if (!packageId || !companyKey || !normalizedEmail) {
      throw new Error('A seat package and employee email are required.')
    }

    if (!isSupabaseConfigured) {
      return { id: `demo-seat-${Date.now()}`, packageId, employeeEmail: normalizedEmail, status: 'assigned' }
    }

    const { data, error } = await supabase
      .from('company_seats')
      .insert({ package_id: packageId, company_key: companyKey.trim().toLowerCase(), employee_email: normalizedEmail, assigned_by: (await supabase.auth.getUser()).data.user?.id })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return { id: data.id, packageId: data.package_id, employeeEmail: data.employee_email, profileId: data.profile_id, status: data.status, assignedAt: data.assigned_at, claimedAt: data.claimed_at }
  },

  async revokeCompanySeat({ seatId }) {
    if (!seatId) throw new Error('Seat ID is required.')
    if (!isSupabaseConfigured) return { id: seatId, status: 'revoked' }

    const { data, error } = await supabase
      .from('company_seats')
      .update({ status: 'revoked' })
      .eq('id', seatId)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return { id: data.id, status: data.status }
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
      friendlyName: 'EchoAI',
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

  async createSupportTicket({ category, details, attachmentPaths = [] }) {
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
        attachment_paths: attachmentPaths,
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  },

  // Screenshots go to a private bucket keyed by user id; admins read them back
  // through short-lived signed URLs rather than public links.
  async uploadTicketAttachment(file) {
    if (!isSupabaseConfigured) {
      throw new Error('File uploads require a configured Supabase project.')
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Screenshots must be 5 MB or smaller.')
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      throw new Error('Attach a PNG, JPEG, WebP, or GIF image.')
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Sign in to attach a screenshot.')
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
    const path = `${user.id}/${Date.now()}-${safeName}`

    const { error } = await supabase.storage
      .from('ticket-attachments')
      .upload(path, file, { contentType: file.type, upsert: false })

    if (error) {
      throw new Error(error.message)
    }

    return path
  },

  async getTicketAttachmentUrl(path) {
    const { data, error } = await supabase.storage
      .from('ticket-attachments')
      .createSignedUrl(path, 300)

    if (error) {
      throw new Error(error.message)
    }

    return data.signedUrl
  },

  // Unauthenticated intake for people locked out of their account. Rate limiting
  // and all validation happen server-side.
  async submitPublicSupportTicket({ email, name, category, details }) {
    if (!isSupabaseConfigured) {
      return { ok: true }
    }

    const { data, error } = await supabase.functions.invoke('public-support-ticket', {
      body: { email, name, category, details },
    })

    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || 'Could not send that request.')
    }

    return data
  },

  // Privileged support actions. The caller's role is re-verified server-side.
  async adminUserAction({ action, userId, fullName, company }) {
    const { data, error } = await supabase.functions.invoke('admin-user-actions', {
      body: { action, userId, fullName, company },
    })

    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || 'That action could not be completed.')
    }

    return data
  },

  async submitCompanyPackageRequest({ fullName, email, company, seatCount, details }) {
    if (!fullName || !email || !company || !seatCount) {
      throw new Error('Name, email, company, and seat count are required.')
    }

    if (!isSupabaseConfigured) {
      return { ok: true }
    }

    const { error } = await supabase.rpc('submit_company_package_request', {
      p_full_name: fullName.trim(),
      p_email: email.trim().toLowerCase(),
      p_company: company.trim(),
      p_seat_count: Number(seatCount),
      p_details: details?.trim() || '',
    })

    if (error) {
      throw new Error(error.message)
    }

    return { ok: true }
  },

  async getSupportTickets() {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    return (data ?? []).map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject || ticket.category,
      category: ticket.category,
      details: ticket.details,
      userFullName: ticket.requester_name || ticket.contact_name || (ticket.user_id ? 'Authenticated user' : 'Signed-out visitor'),
      userEmail: ticket.requester_email || ticket.contact_email || '',
      source: ticket.source || 'app',
      attachmentPaths: ticket.attachment_paths || [],
      status: ticket.status,
      priority: ticket.category === 'Company package' ? 'high' : 'medium',
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      messages: [{
        id: `${ticket.id}-initial`,
        author: ticket.requester_name || ticket.contact_name || ticket.requester_email || ticket.contact_email || 'Requester',
        role: 'user',
        body: ticket.details,
        sentAt: ticket.created_at,
      }],
      adminResponse: ticket.admin_response || '',
    }))
  },

  async respondToSupportTicket({ ticketId, response }) {
    if (!ticketId || !response?.trim()) throw new Error('A ticket response is required.')
    if (!isSupabaseConfigured) return { id: ticketId, status: 'in_progress', adminResponse: response.trim() }

    const { data, error } = await supabase
      .from('support_tickets')
      .update({ admin_response: response.trim(), responded_at: new Date().toISOString(), status: 'in_progress' })
      .eq('id', ticketId)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return { id: data.id, status: data.status, adminResponse: data.admin_response }
  },

  async updateSupportTicketStatus({ ticketId, status }) {
    if (!ticketId || !status) throw new Error('A ticket and status are required.')
    if (!isSupabaseConfigured) return { id: ticketId, status, updatedAt: new Date().toISOString() }

    const { data, error } = await supabase
      .from('support_tickets')
      .update({ status })
      .eq('id', ticketId)
      .select('id, status, updated_at')
      .single()

    if (error) throw new Error(error.message)
    return { id: data.id, status: data.status, updatedAt: data.updated_at }
  },

  async updateCompanySeatPackage({ packageId, seatLimit, assignedSeats = 0 }) {
    const parsedLimit = Number(seatLimit)
    if (!packageId || !Number.isInteger(parsedLimit) || parsedLimit < assignedSeats) {
      throw new Error(`Seat package must be a whole number of at least ${assignedSeats}.`)
    }

    if (!isSupabaseConfigured) return { id: packageId, seatLimit: parsedLimit }

    const { data, error } = await supabase
      .from('company_seat_packages')
      .update({ seat_limit: parsedLimit })
      .eq('id', packageId)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return { id: data.id, companyKey: data.company_key, seatLimit: data.seat_limit, status: data.status }
  },

  async getMyContactCard({ userId, email }) {
    if (!isSupabaseConfigured) {
      return normalizeContactCard({ id: userId, email })
    }

    const profile = await getProfileByUser({ userId, email })
    return normalizeContactCard(profile ?? { id: userId, email })
  },

  async updateMyContactCard(card) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      throw new Error(userError.message)
    }

    if (!user) {
      throw new Error('You must be signed in to update your contact card.')
    }

    const payload = Object.entries(CONTACT_CARD_COLUMNS).reduce((acc, [field, column]) => {
      if (card[field] !== undefined) {
        acc[column] = String(card[field]).trim() || null
      }
      return acc
    }, {})

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeContactCard(data)
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
