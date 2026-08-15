import { useEffect, useMemo, useState } from 'react'
import './CalendarPopout.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)
const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1)
const dayKey = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Six weeks always renders, so the grid never changes height between months.
const buildGrid = (month) => {
  const first = startOfMonth(month)
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - cursor.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor)
    date.setDate(cursor.getDate() + index)
    return date
  })
}

export function CalendarPopout({
  open,
  onClose,
  scheduledPosts = [],
  googleEvents = [],
  calendars = [],
  selectedCalendarId,
  onSelectCalendar,
  connected,
  onConnect,
  syncEnabled,
  onToggleSync,
  loading,
  error,
  onMonthChange,
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()))

  useEffect(() => {
    if (open) onMonthChange?.(month)
  }, [open, month, onMonthChange])

  const byDay = useMemo(() => {
    const map = new Map()
    const push = (key, entry) => {
      if (!key) return
      map.set(key, [...(map.get(key) ?? []), entry])
    }

    scheduledPosts.forEach((post) => {
      push(dayKey(post.scheduledAt), {
        id: `post-${post.id}`,
        source: 'echoai',
        title: post.campaign || post.message || 'Scheduled post',
        time: post.scheduledAt,
        detail: (post.channels ?? []).join(', '),
      })
    })

    googleEvents.forEach((event) => {
      push(dayKey(event.start), {
        id: `gcal-${event.id}`,
        source: 'google',
        title: event.title,
        time: event.allDay ? '' : event.start,
        detail: event.location || '',
        link: event.htmlLink,
      })
    })

    return map
  }, [scheduledPosts, googleEvents])

  if (!open) return null

  const grid = buildGrid(month)
  const todayKey = dayKey(new Date())
  const selectedEntries = byDay.get(selectedDay) ?? []

  return (
    <>
      <button type="button" className="calendar-popout-scrim" onClick={onClose} aria-label="Close calendar" />
      <aside className="calendar-popout" role="dialog" aria-label="Calendar">
        <header className="calendar-popout-head">
          <div>
            <p className="calendar-popout-kicker">Calendar</p>
            <h2>
              {month.toLocaleString(undefined, { month: 'long' })} {month.getFullYear()}
            </h2>
          </div>
          <div className="calendar-popout-nav">
            <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">‹</button>
            <button type="button" onClick={() => setMonth(startOfMonth(new Date()))}>Today</button>
            <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">›</button>
            <button type="button" className="calendar-popout-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>

        <div className="calendar-popout-source">
          {connected ? (
            <>
              <label>
                Google calendar
                <select
                  value={selectedCalendarId}
                  onChange={(event) => onSelectCalendar(event.target.value)}
                >
                  {calendars.length === 0 && <option value="primary">Primary</option>}
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                      {calendar.primary ? ' (primary)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="calendar-popout-toggle">
                <input type="checkbox" checked={syncEnabled} onChange={(event) => onToggleSync(event.target.checked)} />
                Add scheduled posts to this calendar
              </label>
            </>
          ) : (
            <div className="calendar-popout-connect">
              <p>Connect Google to see your calendars alongside scheduled posts.</p>
              <button type="button" className="primary-button" onClick={onConnect}>
                Connect Google Calendar
              </button>
            </div>
          )}
        </div>

        {error && <p className="calendar-popout-error">{error}</p>}
        {loading && <p className="calendar-popout-note">Loading events...</p>}

        <div className="calendar-popout-weekdays">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendar-popout-grid">
          {grid.map((date) => {
            const key = dayKey(date)
            const entries = byDay.get(key) ?? []
            const outside = date.getMonth() !== month.getMonth()

            return (
              <button
                type="button"
                key={key}
                className={[
                  'calendar-day',
                  outside ? 'is-outside' : '',
                  key === todayKey ? 'is-today' : '',
                  key === selectedDay ? 'is-selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelectedDay(key)}
              >
                <span className="calendar-day-number">{date.getDate()}</span>
                <span className="calendar-day-dots">
                  {entries.slice(0, 3).map((entry) => (
                    <i key={entry.id} className={`dot dot-${entry.source}`} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>

        <div className="calendar-popout-agenda">
          <h3>
            {new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h3>
          {selectedEntries.length === 0 ? (
            <p className="calendar-popout-note">Nothing scheduled.</p>
          ) : (
            <ul>
              {selectedEntries.map((entry) => (
                <li key={entry.id} className={`agenda-item agenda-${entry.source}`}>
                  <span className="agenda-time">
                    {entry.time
                      ? new Date(entry.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                      : 'All day'}
                  </span>
                  <span className="agenda-body">
                    <strong>{entry.title}</strong>
                    {entry.detail && <small>{entry.detail}</small>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
