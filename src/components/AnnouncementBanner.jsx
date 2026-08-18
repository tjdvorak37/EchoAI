import { useState } from 'react'
import { X } from 'lucide-react'

const getDismissalKey = (notice, dismissalScope) =>
  `echoai-announcement-dismissed:${dismissalScope}:${notice.id}:${notice.updatedAt}`

export function AnnouncementBanner({ notice, audience, dismissalScope = 'public' }) {
  const dismissalKey = getDismissalKey(notice, dismissalScope)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissalKey) === 'true'
    } catch {
      return false
    }
  })

  const message = notice.message.trim()
  if (!notice.enabled || !message || dismissed) return null

  const dismiss = () => {
    try {
      localStorage.setItem(dismissalKey, 'true')
    } catch {
      // The banner can still close when storage is unavailable.
    }
    setDismissed(true)
  }

  return (
    <div className={`announcement-banner announcement-banner-${audience}`} role="status" aria-live="polite">
      <div className={`announcement-track ${notice.scrolling ? 'is-scrolling' : ''}`}>
        <span className="announcement-message"><strong>Important:</strong> {message}</span>
        {notice.scrolling && (
          <span className="announcement-message" aria-hidden="true"><strong>Important:</strong> {message}</span>
        )}
      </div>
      <button type="button" className="announcement-close" onClick={dismiss} aria-label="Close announcement">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  )
}