import { isSupabaseConfigured, supabase } from '../lib/supabase'

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
  },
]

const DEMO_ACCESS_REQUESTS = []

const BLOCKED_STATUS_MESSAGES = {
  pending: 'Your account is pending approval by Management or IT.',
  denied: 'Your account request was denied. Contact Management or IT for help.',
  deactivated: 'Your account has been deactivated. Contact Management or IT for help.',
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

const normalizeMember = (record) => ({
  id: record.id,
  fullName: record.full_name,
  email: record.email,
  company: record.company,
  role: record.role,
  accessStatus: record.access_status,
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

    const otpSend = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })

    if (otpSend.error) {
      throw new Error(otpSend.error.message)
    }

    return {
      mfaRequired: true,
      user: null,
    }
  },

  async verifyMfaCode({ email, code }) {
    if (!email || !code) {
      throw new Error('Email and verification code are required.')
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
        },
      }
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
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
    })

    if (profileError) {
      throw new Error(profileError.message)
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

    return { ok: true }
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
