import { useEffect, useState } from 'react'
import { postingScheduleService, WEEKDAY_KEYS } from '../services/postingScheduleService'
import './PostingSchedulePanel.css'

const DAY_LABELS = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
}

const formatTime = (time) => {
  const [hourStr, minute] = time.split(':')
  const hour = Number(hourStr)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${String(displayHour).padStart(2, '0')} : ${minute} ${period}`
}

const to24Hour = (hour12, period) => {
  const hour = Number(hour12) % 12
  return period === 'PM' ? hour + 12 : hour
}

export function PostingSchedulePanel() {
  const [schedule, setSchedule] = useState(null)
  const [status, setStatus] = useState({ loading: true, saving: false, message: '', error: '' })
  const [addTarget, setAddTarget] = useState('weekdays')
  const [addHour, setAddHour] = useState('9')
  const [addMinute, setAddMinute] = useState('00')
  const [addPeriod, setAddPeriod] = useState('AM')

  useEffect(() => {
    let active = true
    postingScheduleService.get()
      .then((result) => { if (active) setSchedule(result) })
      .catch((error) => { if (active) setStatus((current) => ({ ...current, error: error.message })) })
      .finally(() => { if (active) setStatus((current) => ({ ...current, loading: false })) })
    return () => { active = false }
  }, [])

  const persist = async (nextSchedule) => {
    setSchedule(nextSchedule)
    setStatus((current) => ({ ...current, saving: true, message: '', error: '' }))
    try {
      const saved = await postingScheduleService.save(nextSchedule)
      setSchedule(saved)
      setStatus({ loading: false, saving: false, message: 'Posting schedule saved.', error: '' })
    } catch (error) {
      setStatus((current) => ({ ...current, saving: false, error: error.message }))
    }
  }

  if (status.loading || !schedule) {
    return <section className="sub-panel"><p className="muted">Loading your posting schedule...</p></section>
  }

  const toggleDay = (dayKey) => {
    persist({
      ...schedule,
      days: { ...schedule.days, [dayKey]: { ...schedule.days[dayKey], enabled: !schedule.days[dayKey].enabled } },
    })
  }

  const changeGoal = (delta) => {
    persist({ ...schedule, weeklyGoal: Math.max(1, Math.min(500, schedule.weeklyGoal + delta)) })
  }

  const generateSlots = () => {
    persist({ ...schedule, days: postingScheduleService.generateSlots(schedule) })
  }

  const removeSlot = (dayKey, time) => {
    persist({ ...schedule, days: postingScheduleService.removeSlot(schedule.days, dayKey, time) })
  }

  const clearAll = () => {
    persist({ ...schedule, days: postingScheduleService.clearAll(schedule.days) })
  }

  const addSlot = () => {
    const time = `${String(to24Hour(addHour, addPeriod)).padStart(2, '0')}:${addMinute}`
    const dayKeys = addTarget === 'weekdays'
      ? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      : addTarget === 'weekends'
        ? ['saturday', 'sunday']
        : addTarget === 'everyday'
          ? WEEKDAY_KEYS
          : [addTarget]
    persist({ ...schedule, days: postingScheduleService.addSlot(schedule.days, dayKeys, time) })
  }

  return (
    <section className="sub-panel posting-schedule-panel">
      <div className="list-row">
        <div>
          <h3>Posting Schedule</h3>
          <p className="muted">Set your recurring posting times so "Post to next available slot" can queue a post instantly, on your own rhythm.</p>
        </div>
      </div>

      <div className="posting-goal-row">
        <div>
          <strong>Posting Goal</strong>
          <span className="muted">Choose how often you aim to post each week.</span>
        </div>
        <div className="posting-goal-stepper">
          <button type="button" className="ghost-button" onClick={() => changeGoal(-1)}>−</button>
          <strong>{schedule.weeklyGoal}</strong>
          <button type="button" className="ghost-button" onClick={() => changeGoal(1)}>+</button>
        </div>
      </div>

      <div className="posting-slots-header">
        <div>
          <strong>Posting Slots</strong>
          <span className="muted">These times tell EchoAI when to fill in the next post you send to "next available slot."</span>
        </div>
        <button type="button" className="ghost-button" onClick={generateSlots} disabled={status.saving}>
          🔁 Generate new posting slots
        </button>
      </div>

      <div className="posting-schedule-grid">
        {WEEKDAY_KEYS.map((dayKey) => {
          const day = schedule.days[dayKey]
          return (
            <div key={dayKey} className="posting-schedule-day">
              <div className="posting-schedule-day-header">
                <span>{DAY_LABELS[dayKey]}</span>
                <label className="posting-day-toggle">
                  <input type="checkbox" checked={day.enabled} onChange={() => toggleDay(dayKey)} />
                  <span>{day.enabled ? 'On' : 'Off'}</span>
                </label>
              </div>
              <div className="posting-schedule-times">
                {day.enabled && day.times.length === 0 && <small className="muted">No times yet</small>}
                {day.enabled && day.times.map((time) => (
                  <button key={time} type="button" className="posting-slot-chip" onClick={() => removeSlot(dayKey, time)} title="Remove this time">
                    {formatTime(time)} ✕
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="posting-add-slot-row">
        <span>Add a new posting time for</span>
        <select value={addTarget} onChange={(event) => setAddTarget(event.target.value)}>
          <option value="weekdays">Weekdays</option>
          <option value="weekends">Weekends</option>
          <option value="everyday">Every day</option>
          {WEEKDAY_KEYS.map((key) => <option key={key} value={key}>{DAY_LABELS[key]}</option>)}
        </select>
        <span>at</span>
        <select value={addHour} onChange={(event) => setAddHour(event.target.value)}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}</option>)}
        </select>
        <select value={addMinute} onChange={(event) => setAddMinute(event.target.value)}>
          {['00', '15', '30', '45'].map((minute) => <option key={minute} value={minute}>{minute}</option>)}
        </select>
        <select value={addPeriod} onChange={(event) => setAddPeriod(event.target.value)}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
        <button type="button" className="primary-button" onClick={addSlot} disabled={status.saving}>Add posting slot</button>
        <button type="button" className="text-button" onClick={clearAll}>Clear all</button>
      </div>

      {status.message && <p className="auth-message">{status.message}</p>}
      {status.error && <p className="auth-message auth-error">{status.error}</p>}
    </section>
  )
}
