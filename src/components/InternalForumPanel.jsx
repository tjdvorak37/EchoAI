import { useEffect, useState } from 'react'
import { internalForumService } from '../services/internalForumService'

const STAFF_ROLES = ['admin', 'it', 'accountant']

export function InternalForumPanel({ currentUser, teamMembers = [], onUnreadChange }) {
  const [activeView, setActiveView] = useState('posts')
  const [posts, setPosts] = useState([])
  const [messages, setMessages] = useState([])
  const [postDraft, setPostDraft] = useState({ title: '', body: '', category: 'Training', documentUrl: '' })
  const [messageDraft, setMessageDraft] = useState({ body: '', channelType: 'group', recipientId: '' })
  const [status, setStatus] = useState({ loading: true, saving: false, error: '', message: '' })
  const [, setReadMarker] = useState(0)

  const staffMembers = teamMembers.filter((member) => STAFF_ROLES.includes(member.role) && member.id !== currentUser?.id)
  const visibleMessages = messages.filter((message) => (
    message.channelType === 'group'
      || message.senderId === currentUser?.id
      || message.recipientId === currentUser?.id
  ))

  useEffect(() => {
    let active = true
    internalForumService.list().then((result) => {
      if (!active) return
      setPosts(result.posts)
      setMessages(result.messages)
      onUnreadChange?.(internalForumService.getUnreadCount(result.messages, currentUser?.id))
      setStatus({ loading: false, saving: false, error: '', message: '' })
    }).catch((error) => {
      if (active) setStatus({ loading: false, saving: false, error: error.message, message: '' })
    })
    return () => { active = false }
  }, [currentUser?.id, onUnreadChange])

  const unreadCount = internalForumService.getUnreadCount(messages, currentUser?.id)

  useEffect(() => {
    onUnreadChange?.(unreadCount)
  }, [onUnreadChange, unreadCount])

  useEffect(() => {
    if (activeView !== 'chat') return
    internalForumService.markMessagesRead(currentUser?.id)
    setReadMarker((current) => current + 1)
    onUnreadChange?.(0)
  }, [activeView, currentUser?.id, messages.length, onUnreadChange])

  const submitPost = async (event) => {
    event.preventDefault()
    setStatus((current) => ({ ...current, saving: true, error: '', message: '' }))
    try {
      const created = await internalForumService.createPost({ ...postDraft, currentUser })
      setPosts((current) => [created, ...current])
      setPostDraft({ title: '', body: '', category: 'Training', documentUrl: '' })
      setStatus({ loading: false, saving: false, error: '', message: 'Forum post published.' })
    } catch (error) {
      setStatus((current) => ({ ...current, saving: false, error: error.message, message: '' }))
    }
  }

  const submitMessage = async (event) => {
    event.preventDefault()
    setStatus((current) => ({ ...current, saving: true, error: '', message: '' }))
    try {
      const created = await internalForumService.sendMessage({ ...messageDraft, currentUser })
      setMessages((current) => [created, ...current])
      setMessageDraft((current) => ({ ...current, body: '' }))
      setStatus({ loading: false, saving: false, error: '', message: 'Message sent.' })
    } catch (error) {
      setStatus((current) => ({ ...current, saving: false, error: error.message, message: '' }))
    }
  }

  if (status.loading) return <p className="muted">Loading company forum...</p>

  return (
    <div className="it-overview">
      <div className="it-ticket-view-tabs" role="tablist" aria-label="Company forum views">
        <button type="button" className={activeView === 'posts' ? 'active' : ''} onClick={() => setActiveView('posts')}>Forum & docs</button>
        <button type="button" className={activeView === 'chat' ? 'active' : ''} onClick={() => setActiveView('chat')}>
          Staff chat{unreadCount > 0 ? ` (${unreadCount} new)` : ''}
        </button>
      </div>

      {status.error && <p className="auth-message auth-error">{status.error}</p>}
      {status.message && <p className="auth-message">{status.message}</p>}

      {activeView === 'posts' && (
        <>
          <div className="it-section">
            <h3 className="it-section-title">Post training or company information</h3>
            <form className="auth-form" onSubmit={submitPost}>
              <label>Category<select value={postDraft.category} onChange={(event) => setPostDraft((current) => ({ ...current, category: event.target.value }))}><option>Training</option><option>Company update</option><option>Accounting</option><option>IT procedure</option><option>Policy</option></select></label>
              <label>Title<input value={postDraft.title} onChange={(event) => setPostDraft((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Document link<input type="url" value={postDraft.documentUrl} onChange={(event) => setPostDraft((current) => ({ ...current, documentUrl: event.target.value }))} placeholder="https://..." /></label>
              <label>Message<textarea rows="4" value={postDraft.body} onChange={(event) => setPostDraft((current) => ({ ...current, body: event.target.value }))} /></label>
              <button type="submit" className="primary-button" disabled={status.saving}>{status.saving ? 'Posting...' : 'Publish forum post'}</button>
            </form>
          </div>

          <div className="it-section">
            <h3 className="it-section-title">Forum stream</h3>
            {posts.length === 0 ? <p className="muted">No forum posts yet.</p> : posts.map((post) => (
              <div key={post.id} className="it-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <p>{post.title}</p>
                  <span>{post.category} • {post.authorName} • {new Date(post.createdAt).toLocaleString()}</span>
                  <p className="muted" style={{ marginTop: '0.45rem', whiteSpace: 'pre-wrap' }}>{post.body}</p>
                  {post.documentUrl && <a className="text-button" href={post.documentUrl} target="_blank" rel="noreferrer">Open document</a>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeView === 'chat' && (
        <>
          <div className="it-section">
            <h3 className="it-section-title">Group and direct messages</h3>
            <form className="auth-form" onSubmit={submitMessage}>
              <label>Message type<select value={messageDraft.channelType} onChange={(event) => setMessageDraft((current) => ({ ...current, channelType: event.target.value }))}><option value="group">Group message</option><option value="direct">Private message</option></select></label>
              {messageDraft.channelType === 'direct' && <label>Recipient<select value={messageDraft.recipientId} onChange={(event) => setMessageDraft((current) => ({ ...current, recipientId: event.target.value }))}><option value="">Choose teammate</option>{staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}</select></label>}
              <label>Message<textarea rows="3" value={messageDraft.body} onChange={(event) => setMessageDraft((current) => ({ ...current, body: event.target.value }))} /></label>
              <button type="submit" className="primary-button" disabled={status.saving}>{status.saving ? 'Sending...' : 'Send message'}</button>
            </form>
          </div>

          <div className="it-section">
            <h3 className="it-section-title">Message stream</h3>
            {visibleMessages.length === 0 ? <p className="muted">No staff messages yet.</p> : visibleMessages.map((message) => (
              <div key={message.id} className="it-row">
                <div>
                  <p>{message.senderName}</p>
                  <span>{message.channelType === 'direct' ? 'Private message' : 'Group'} • {new Date(message.createdAt).toLocaleString()}</span>
                  <p className="muted" style={{ marginTop: '0.45rem', whiteSpace: 'pre-wrap' }}>{message.body}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}