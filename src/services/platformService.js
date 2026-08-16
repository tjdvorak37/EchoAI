import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { canUseAgentMode, runUserAiAgent } from './aiAgentService'

const randomId = () => `post_${Math.random().toString(36).slice(2, 10)}`

export const platformService = {
  async schedulePost(payload) {
    const post = {
      id: randomId(),
      status: 'scheduled',
      ...payload,
    }

    if (!isSupabaseConfigured) {
      return post
    }

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert({
        campaign: payload.campaign,
        message: payload.message,
        image_idea: payload.imageIdea,
        scheduled_at: payload.scheduledAt,
        channels: payload.channels,
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
      status: data.status,
    }
  },

  async postNow(payload) {
    const publishedAt = new Date().toISOString()
    const post = {
      id: randomId(),
      status: 'published',
      scheduledAt: publishedAt,
      ...payload,
    }

    if (!isSupabaseConfigured) {
      return post
    }

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert({
        campaign: payload.campaign,
        message: payload.message,
        image_idea: payload.imageIdea,
        scheduled_at: publishedAt,
        channels: payload.channels,
        status: 'published',
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
      status: data.status,
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

    if (!isSupabaseConfigured) {
      return [
        {
          title: 'Launch urgency',
          copy: `Today only: ${cleanedPrompt.slice(0, 80)}... Claim your offer before midnight.`,
          image: 'Bold product close-up with energetic typography overlay.',
        },
        {
          title: 'Community angle',
          copy: `Your followers asked for this. ${cleanedPrompt.slice(0, 90)} and share your pick in comments.`,
          image: 'Lifestyle scene showing customers using the product in daylight.',
        },
        {
          title: 'Story sequence',
          copy: `Frame 1: Hook. Frame 2: Benefit. Frame 3: ${cleanedPrompt.slice(0, 70)} with a clear CTA.`,
          image: 'Three-panel storyboard with warm gradients and social-safe margins.',
        },
      ]
    }

    const { data, error } = await supabase.functions.invoke('generate-social-copy', {
      body: { prompt: cleanedPrompt },
    })

    if (error) {
      throw new Error(error.message)
    }

    return data.suggestions ?? []
  },
}
