import { isSupabaseConfigured, supabase } from '../lib/supabase'

const normalizePost = (record) => ({
  id: record.id,
  title: record.title,
  body: record.body,
  category: record.category,
  documentUrl: record.document_url || '',
  authorId: record.author_id,
  authorName: record.author_name || 'Staff',
  createdAt: record.created_at,
})

const normalizeMessage = (record) => ({
  id: record.id,
  channelType: record.channel_type,
  recipientId: record.recipient_id || '',
  senderId: record.sender_id,
  senderName: record.sender_name || 'Staff',
  body: record.body,
  createdAt: record.created_at,
})

const getCurrentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign in before using the company forum.')
  return data.user
}

export const internalForumService = {
  async list() {
    if (!isSupabaseConfigured) return { posts: [], messages: [] }

    const [{ data: posts, error: postsError }, { data: messages, error: messagesError }] = await Promise.all([
      supabase
        .from('internal_forum_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('internal_forum_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (postsError) throw new Error(postsError.message)
    if (messagesError) throw new Error(messagesError.message)
    return {
      posts: (posts || []).map(normalizePost),
      messages: (messages || []).map(normalizeMessage),
    }
  },

  async createPost({ title, body, category, documentUrl, currentUser }) {
    const cleanedTitle = title.trim()
    const cleanedBody = body.trim()
    if (!cleanedTitle || !cleanedBody) throw new Error('Add a title and message before posting.')

    if (!isSupabaseConfigured) {
      return normalizePost({
        id: `post-${Date.now()}`,
        title: cleanedTitle,
        body: cleanedBody,
        category,
        document_url: documentUrl,
        author_id: currentUser?.id,
        author_name: currentUser?.fullName || currentUser?.email || 'Staff',
        created_at: new Date().toISOString(),
      })
    }

    const user = await getCurrentUser()
    const { data, error } = await supabase
      .from('internal_forum_posts')
      .insert({
        author_id: user.id,
        author_name: currentUser?.fullName || currentUser?.email || user.email || 'Staff',
        title: cleanedTitle.slice(0, 160),
        body: cleanedBody.slice(0, 4000),
        category,
        document_url: documentUrl.trim().slice(0, 500),
      })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return normalizePost(data)
  },

  async sendMessage({ body, channelType, recipientId, currentUser }) {
    const cleanedBody = body.trim()
    if (!cleanedBody) throw new Error('Type a message before sending.')
    if (channelType === 'direct' && !recipientId) throw new Error('Choose a teammate for a direct message.')

    if (!isSupabaseConfigured) {
      return normalizeMessage({
        id: `message-${Date.now()}`,
        channel_type: channelType,
        recipient_id: recipientId,
        sender_id: currentUser?.id,
        sender_name: currentUser?.fullName || currentUser?.email || 'Staff',
        body: cleanedBody,
        created_at: new Date().toISOString(),
      })
    }

    const user = await getCurrentUser()
    const { data, error } = await supabase
      .from('internal_forum_messages')
      .insert({
        sender_id: user.id,
        sender_name: currentUser?.fullName || currentUser?.email || user.email || 'Staff',
        channel_type: channelType,
        recipient_id: channelType === 'direct' ? recipientId : null,
        body: cleanedBody.slice(0, 2000),
      })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return normalizeMessage(data)
  },
}