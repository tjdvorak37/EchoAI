import { isSupabaseConfigured, supabase } from '../lib/supabase'

const normalizeCompanyAccount = (record) => ({
  id: record.id,
  companyName: record.company_name,
  platform: record.platform,
  accountName: record.account_name,
})

const normalizeCompanyPost = (record) => ({
  id: record.id,
  companyName: record.company_name,
  title: record.title,
  content: record.content,
  channels: record.channels,
  publishedAt: record.published_at,
})

const normalizeQueue = (record) => ({
  id: record.id,
  companyPostId: record.company_post_id,
  status: record.status,
  queuedAt: record.queued_at,
  decisionAt: record.decision_at,
})

const normalizeRepost = (record) => ({
  id: record.id,
  companyPostId: record.company_post_id,
  status: record.status,
  caption: record.caption,
  postedAt: record.posted_at,
})

const assertAdminRole = (profile) => {
  if (profile?.role !== 'admin') {
    throw new Error('Only admin users can publish company posts.')
  }
}

const getSessionUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('No authenticated user found.')
  }

  return data.user
}

const getCurrentProfile = async () => {
  const user = await getSessionUser()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, company')
    .eq('id', user.id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

const getCompanyKey = (profile) => {
  const value = profile?.company?.trim()
  if (!value) {
    throw new Error('Company is required on the user profile for tenant isolation.')
  }

  return value.toLowerCase()
}

export const repostService = {
  async getWorkspace() {
    if (!isSupabaseConfigured) {
      return null
    }

    const profile = await getCurrentProfile()
    const companyKey = getCompanyKey(profile)

    const [accountsResult, postsResult, queueResult, repostsResult, settingsResult] =
      await Promise.all([
        supabase
          .from('company_social_accounts')
          .select('*')
          .eq('company_key', companyKey)
          .order('platform', { ascending: true }),
        supabase
          .from('company_main_posts')
          .select('*')
          .eq('company_key', companyKey)
          .order('published_at', { ascending: false }),
        supabase
          .from('repost_queue')
          .select('*')
          .eq('company_key', companyKey)
          .eq('user_id', profile.id)
          .order('queued_at', { ascending: false }),
        supabase
          .from('user_reposts')
          .select('*')
          .eq('company_key', companyKey)
          .eq('user_id', profile.id)
          .order('posted_at', { ascending: false }),
        supabase
          .from('user_repost_settings')
          .select('*')
          .eq('user_id', profile.id)
          .maybeSingle(),
      ])

    const errors = [
      accountsResult.error,
      postsResult.error,
      queueResult.error,
      repostsResult.error,
      settingsResult.error,
    ].filter(Boolean)

    if (errors.length) {
      throw new Error(errors[0].message)
    }

    return {
      companyAccounts: (accountsResult.data ?? []).map(normalizeCompanyAccount),
      companyPosts: (postsResult.data ?? []).map(normalizeCompanyPost),
      queue: (queueResult.data ?? []).map(normalizeQueue),
      reposts: (repostsResult.data ?? []).map(normalizeRepost),
      autoApprove: Boolean(settingsResult.data?.auto_approve_company_posts),
      profile,
      companyKey,
    }
  },

  async setAutoApprove({ enabled, companyKey }) {
    if (!isSupabaseConfigured) {
      return null
    }

    const profile = await getCurrentProfile()
    const resolvedCompanyKey = companyKey || getCompanyKey(profile)

    const { data, error } = await supabase
      .from('user_repost_settings')
      .upsert(
        {
          user_id: profile.id,
          company_key: resolvedCompanyKey,
          auto_approve_company_posts: enabled,
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return Boolean(data.auto_approve_company_posts)
  },

  async createCompanyMainPost({ title, content, channels, companyName, companyKey }) {
    if (!isSupabaseConfigured) {
      return null
    }

    if (!title?.trim() || !content?.trim()) {
      throw new Error('Post title and content are required.')
    }

    const profile = await getCurrentProfile()
    assertAdminRole(profile)
    const user = await getSessionUser()
    const resolvedCompanyKey = companyKey || getCompanyKey(profile)

    const { data, error } = await supabase
      .from('company_main_posts')
      .insert({
        company_key: resolvedCompanyKey,
        company_name: companyName || profile.company,
        title: title.trim(),
        content: content.trim(),
        channels: channels?.length ? channels : ['instagram'],
        created_by: user.id,
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeCompanyPost(data)
  },

  async createCompanySocialAccount({ platform, accountName, companyName, companyKey }) {
    if (!isSupabaseConfigured) {
      return null
    }

    if (!platform?.trim() || !accountName?.trim()) {
      throw new Error('Platform and account name are required.')
    }

    const profile = await getCurrentProfile()
    assertAdminRole(profile)
    const resolvedCompanyKey = companyKey || getCompanyKey(profile)

    const { data, error } = await supabase
      .from('company_social_accounts')
      .insert({
        company_key: resolvedCompanyKey,
        company_name: companyName || profile.company,
        platform: platform.trim(),
        account_name: accountName.trim(),
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeCompanyAccount(data)
  },

  async broadcastCompanyPost({ companyPostId }) {
    if (!isSupabaseConfigured) {
      return null
    }

    if (!companyPostId) {
      throw new Error('Company post ID is required for broadcast.')
    }

    const { data, error } = await supabase.rpc('broadcast_company_post', {
      target_company_post_id: companyPostId,
    })

    if (error) {
      throw new Error(error.message)
    }

    return Number(data ?? 0)
  },

  async enqueueCompanyPost({ companyPostId, companyKey }) {
    if (!isSupabaseConfigured) {
      return null
    }

    const profile = await getCurrentProfile()
    const resolvedCompanyKey = companyKey || getCompanyKey(profile)

    const { data, error } = await supabase
      .from('repost_queue')
      .insert({
        company_key: resolvedCompanyKey,
        company_post_id: companyPostId,
        user_id: profile.id,
        status: 'pending',
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeQueue(data)
  },

  async markQueueDeclined({ queueId }) {
    if (!isSupabaseConfigured) {
      return null
    }

    const { data, error } = await supabase
      .from('repost_queue')
      .update({
        status: 'declined',
        decision_at: new Date().toISOString(),
      })
      .eq('id', queueId)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeQueue(data)
  },

  async approveAndCreateRepost({ queueId, companyPostId, companyKey, caption }) {
    if (!isSupabaseConfigured) {
      return null
    }

    const profile = await getCurrentProfile()
    const resolvedCompanyKey = companyKey || getCompanyKey(profile)
    const decisionTime = new Date().toISOString()

    const { data: queueData, error: queueError } = await supabase
      .from('repost_queue')
      .update({
        status: 'posted',
        decision_at: decisionTime,
      })
      .eq('id', queueId)
      .select('*')
      .single()

    if (queueError) {
      throw new Error(queueError.message)
    }

    const { data: repostData, error: repostError } = await supabase
      .from('user_reposts')
      .insert({
        company_key: resolvedCompanyKey,
        company_post_id: companyPostId,
        user_id: profile.id,
        status: 'posted',
        caption,
        posted_at: decisionTime,
      })
      .select('*')
      .single()

    if (repostError) {
      throw new Error(repostError.message)
    }

    return {
      queue: normalizeQueue(queueData),
      repost: normalizeRepost(repostData),
    }
  },
}
