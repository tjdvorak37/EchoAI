import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { canUseAgentMode, runUserAiAgent } from './aiAgentService'

const randomId = () => `post_${Math.random().toString(36).slice(2, 10)}`

const getCurrentUserId = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign in before scheduling a post.')
  return data.user.id
}

const localMessageIdeas = (prompt) => [
  {
    title: 'Launch urgency',
    copy: `Today only: ${prompt.slice(0, 80)}... Claim your offer before midnight.`,
    image: 'Bold product close-up with energetic typography overlay.',
  },
  {
    title: 'Community angle',
    copy: `Your followers asked for this. ${prompt.slice(0, 90)} and share your pick in comments.`,
    image: 'Lifestyle scene showing customers using the product in daylight.',
  },
  {
    title: 'Story sequence',
    copy: `Frame 1: Hook. Frame 2: Benefit. Frame 3: ${prompt.slice(0, 70)} with a clear CTA.`,
    image: 'Three-panel storyboard with warm gradients and social-safe margins.',
  },
]

export const platformService = {
  async listPosts() {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('scheduled_posts')
      .select('*')
      .order('scheduled_at', { ascending: false })

    if (error) throw new Error(error.message)

    return (data ?? []).map((post) => ({
      id: post.id,
      campaign: post.campaign,
      message: post.message,
      imageIdea: post.image_idea,
      scheduledAt: post.scheduled_at,
      channels: post.channels,
      channelAccounts: post.channel_accounts ?? {},
      media: post.media ?? [],
      status: post.status,
    }))
  },

  async schedulePost(payload) {
    const post = {
      id: randomId(),
      status: 'scheduled',
      ...payload,
    }

    if (!isSupabaseConfigured) {
      return post
    }

    const userId = await getCurrentUserId()

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: userId,
        campaign: payload.campaign,
        message: payload.message,
        image_idea: payload.imageIdea,
        scheduled_at: payload.scheduledAt,
        channels: payload.channels,
        channel_accounts: payload.channelAccounts ?? {},
        media: payload.media ?? [],
        status: 'scheduled',
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return {
      id: data.id,
      campaign: data.campaign,
      message: data.message,
      imageIdea: data.image_idea,
      scheduledAt: data.scheduled_at,
      channels: data.channels,
      channelAccounts: data.channel_accounts ?? {},
      media: data.media ?? [],
      status: data.status,
    }
  },

  async reschedulePost(postId, scheduledAtIso) {
    if (!postId || !scheduledAtIso) throw new Error('Post ID and a new date/time are required.')

    if (!isSupabaseConfigured) {
      return { id: postId, scheduledAt: scheduledAtIso }
    }

    const { data, error } = await supabase
      .from('scheduled_posts')
      .update({ scheduled_at: scheduledAtIso })
      .eq('id', postId)
      .eq('status', 'scheduled')
      .select('id, scheduled_at')
      .single()

    if (error) throw new Error(error.message)
    return { id: data.id, scheduledAt: data.scheduled_at }
  },

  async deleteScheduledPost(postId) {
    if (!postId) throw new Error('Post ID is required.')

    if (!isSupabaseConfigured) {
      return { id: postId, deleted: true }
    }

    const { data, error } = await supabase.functions.invoke('social-publisher', {
      body: { action: 'cancel_scheduled', postId },
    })
    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || error.message)
    }
    return data
  },

  async postNow(payload) {
    const publishedAt = new Date().toISOString()
    const post = {
      id: randomId(),
      status: 'scheduled',
      scheduledAt: publishedAt,
      ...payload,
    }

    if (!isSupabaseConfigured) {
      return post
    }

    const userId = await getCurrentUserId()

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: userId,
        campaign: payload.campaign,
        message: payload.message,
        image_idea: payload.imageIdea,
        scheduled_at: publishedAt,
        channels: payload.channels,
        channel_accounts: payload.channelAccounts ?? {},
        media: payload.media ?? [],
        status: 'scheduled',
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) throw new Error('Sign in before publishing a post.')

    const { data: publishResult, error: publishError } = await supabase.functions.invoke('social-publisher', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'publish_now', postId: data.id },
    })
    if (publishError) {
      const detail = await publishError.context?.json?.().catch(() => null)
      throw new Error(detail?.error || publishError.message || 'Unable to publish this post.')
    }
    if (publishResult?.status !== 'published') {
      throw new Error(publishResult?.error || 'The social provider did not confirm publication.')
    }

    return {
      id: data.id,
      campaign: data.campaign,
      message: data.message,
      imageIdea: data.image_idea,
      scheduledAt: data.scheduled_at,
      channels: data.channels,
      channelAccounts: data.channel_accounts ?? {},
      media: data.media ?? [],
      status: publishResult.status,
    }
  },

  async generateMessageIdeas(prompt, agentConfig) {
    const cleanedPrompt = prompt.trim()
    if (!cleanedPrompt) {
      return []
    }

    if (canUseAgentMode(agentConfig, 'message')) {
      try {
        const agentResult = await runUserAiAgent({
          agentConfig,
          mode: 'copy',
          prompt: cleanedPrompt,
          payload: { prompt: cleanedPrompt },
        })

        if (agentResult.suggestions?.length) {
          return agentResult.suggestions
        }
      } catch (error) {
        console.warn('User AI agent unavailable, falling back to default copy generation.', error)
      }
    }

    return localMessageIdeas(cleanedPrompt)
  },
}
