import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { watchEmployeeNotifications } from '../services/employeeNotificationService'
import './EmployeeNotifications.css'

const loadAlerts = (key) => {
  const empty = { since: new Date().toISOString(), alerts: [], checkpoints: {}, processed: [] }
  try {
    const saved = JSON.parse(localStorage.getItem(key))
    if (saved?.since && Array.isArray(saved.alerts)) return saved
  } catch { return empty }
  return empty
}

export function EmployeeNotifications({ currentUser, onOpen, client = supabase }) {
  const storageKey = `echoai-employee-alerts-${currentUser.id}`
  const [cache, setCache] = useState(() => loadAlerts(storageKey))
  const initial = useRef(cache)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)
  const unread = cache.alerts.filter((alert) => !alert.read)
  const newest = unread[0]

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(cache)) } catch { return }
  }, [cache, storageKey])

  useEffect(() => watchEmployeeNotifications({
    client,
    userId: currentUser.id,
    role: currentUser.role,
    ...initial.current,
    onNotification: (alert) => setCache((current) => current.alerts.some((item) => item.id === alert.id)
      ? current
      : { ...current, alerts: [alert, ...current.alerts].slice(0, 100) }),
    onCheckpoint: (checkpoint) => setCache((current) => ({ ...current, ...checkpoint })),
    onError: setError,
  }), [client, currentUser.id, currentUser.role])

  useEffect(() => {
    if (!expanded) return
    const close = (event) => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [expanded])

  const markRead = (id) => setCache((current) => ({ ...current, alerts: current.alerts.map((alert) => !id || alert.id === id ? { ...alert, read: true } : alert) }))
  const open = async (alert) => {
    setOpening(true)
    try {
      await onOpen(alert)
      markRead(alert.id)
      setExpanded(false)
    } catch {
      setError('Unable to open this alert. Please try again.')
    } finally {
      setOpening(false)
    }
  }

  return (
    <aside className="employee-notifications" aria-label="Employee notifications">
      {expanded ? (
        <section className="employee-alert-panel" aria-label="Recent employee alerts">
          <header><strong>Employee notifications</strong><button type="button" title="Mark all read" aria-label="Mark all notifications read" onClick={() => markRead()}><CheckCheck size={18} /></button><button type="button" title="Close notifications" aria-label="Close notifications" onClick={() => setExpanded(false)}><X size={18} /></button></header>
          {error && <p role="status">{error}</p>}
          <div className="employee-alert-list">
            {cache.alerts.length === 0 && <p>No new notifications.</p>}
            {cache.alerts.map((alert) => (
              <article key={alert.id} className={alert.read ? 'is-read' : ''}>
                <strong>{alert.title}</strong><p>{alert.detail}</p>
                <div><button type="button" onClick={() => open(alert)} disabled={opening}>Check it out</button>{!alert.read && <button type="button" title="Dismiss notification" aria-label={`Dismiss ${alert.title}`} onClick={() => markRead(alert.id)}><X size={16} /></button>}</div>
              </article>
            ))}
          </div>
        </section>
      ) : newest && (
        <section className="employee-alert-popup" role="status" aria-live="polite">
          <button type="button" className="employee-alert-dismiss" title="Dismiss notification" aria-label="Dismiss notification" onClick={() => markRead(newest.id)}><X size={16} /></button>
          <strong>{newest.title}</strong><p>{newest.detail}</p>
          <button type="button" onClick={() => open(newest)} disabled={opening}>Check it out now</button>
          {error && <p>{error}</p>}
        </section>
      )}
      <button type="button" className={`employee-alert-bell ${unread.length ? 'has-unread' : ''}`} title="Employee notifications" aria-label={`Employee notifications, ${unread.length} unread`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <Bell size={22} aria-hidden="true" />{unread.length > 0 && <span>{unread.length}</span>}
      </button>
    </aside>
  )
}