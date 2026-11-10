import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  ACTIVITY_METRICS, PLAN_LIMITS, PROVIDER_METRICS, callInfrastructureRpc,
  capacityStatus, formatBytes, growthForecast, projectMonthlyUsage, providerAllowance, readingStatus,
} from '../services/infrastructureUsage'
import './InfrastructureUsagePanel.css'

const utcToday = () => new Date().toISOString().slice(0, 10)
const count = (value) => Number(value).toLocaleString()

function Health({ level, children }) {
  return <span className={`infra-health infra-${level}`}><span aria-hidden="true" className="infra-dot" />{children}</span>
}

function CapacityCard({ title, used, limit, detail, forecast, incomplete = false }) {
  const status = capacityStatus(used, limit)
  return (
    <article className="it-stat-card infra-capacity">
      <h4>{title}</h4>
      <strong>{formatBytes(used)} / {formatBytes(limit)}</strong>
      <Health level={incomplete && status.level === 'good' ? 'unknown' : status.level}>{incomplete && status.level === 'good' ? 'Partial measurement' : status.label} ({status.percent.toFixed(1)}%{incomplete ? ' known minimum' : ''})</Health>
      <progress aria-label={`${title} used`} value={Math.min(status.percent, 100)} max="100" />
      <small>{formatBytes(Math.max(0, limit - used))} remaining</small>
      <small className="muted">{detail}</small>
      <small>{incomplete ? 'Complete object metadata is required for a reliable capacity forecast.' : forecast
        ? `Estimated ${forecast.daysToWarning} days to 70%, using ${forecast.sampleDays} days of recorded net growth.`
        : 'Growth forecast needs at least two daily snapshots and positive net growth.'}</small>
    </article>
  )
}

function PlanSettings({ settings, onSaved, client }) {
  const [plan, setPlan] = useState(settings.supabase_plan)
  const [awsPlan, setAwsPlan] = useState(settings.aws_plan)
  const [expires, setExpires] = useState(settings.aws_expires_on || '')
  const [status, setStatus] = useState({ busy: false, error: '', message: '' })
  const save = async (event) => {
    event.preventDefault()
    setStatus({ busy: true, error: '', message: '' })
    try {
      await callInfrastructureRpc(client, 'save_infrastructure_settings', {
        p_supabase_plan: plan, p_aws_plan: awsPlan, p_aws_expires_on: expires || null,
      })
      setStatus({ busy: false, error: '', message: 'Plan settings saved. Limits, remaining capacity and warnings recalculate after refresh. Actual consumption and history are preserved; this does not change your provider subscription.' })
      onSaved()
    } catch (error) {
      setStatus({ busy: false, error: error.message, message: '' })
    }
  }
  return (
    <form className="infra-form" onSubmit={save}>
      <label>Supabase plan<select aria-label="Supabase plan" value={plan} onChange={(event) => setPlan(event.target.value)}>
        <option value="free">Free</option><option value="pro">Pro (from $25/month)</option>
      </select></label>
      <label>AWS account plan<select aria-label="AWS account plan" value={awsPlan} onChange={(event) => setAwsPlan(event.target.value)}>
        <option value="unknown">Not confirmed</option><option value="free">Free account plan</option><option value="paid">Paid / pay-as-you-go</option>
      </select></label>
      <label>AWS free-plan / credits expiration<input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} /></label>
      <button className="primary-button" disabled={status.busy}>{status.busy ? 'Saving...' : 'Confirm plan settings'}</button>
      {status.error && <p role="alert" className="field-error">{status.error}</p>}
      {status.message && <p role="status">{status.message}</p>}
    </form>
  )
}

function ProviderReadingForm({ onSaved, client }) {
  const [metric, setMetric] = useState(PROVIDER_METRICS[0].id)
  const [value, setValue] = useState('')
  const [start, setStart] = useState(() => `${utcToday().slice(0, 7)}-01`)
  const [end, setEnd] = useState(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  })
  const [status, setStatus] = useState({ busy: false, error: '', message: '' })
  const definition = PROVIDER_METRICS.find((item) => item.id === metric)
  const save = async (event) => {
    event.preventDefault()
    setStatus({ busy: true, error: '', message: '' })
    try {
      const numericValue = Number(value)
      if (!value.trim() || !Number.isFinite(numericValue) || numericValue < 0) throw new Error('Enter a nonnegative usage value.')
      await callInfrastructureRpc(client, 'save_infrastructure_reading', {
        p_metric: metric, p_value: numericValue * definition.multiplier,
        p_period_start: start, p_period_end: end,
      })
      setStatus({ busy: false, error: '', message: 'Provider reading saved with the current timestamp.' })
      onSaved()
    } catch (error) {
      setStatus({ busy: false, error: error.message, message: '' })
    }
  }
  return (
    <form className="infra-form" onSubmit={save}>
      <label>Provider metric<select aria-label="Provider metric" value={metric} onChange={(event) => { setMetric(event.target.value); setValue('') }}>
        {PROVIDER_METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>Current usage ({definition.unit})<input type="number" min="0" step="any" required value={value} onChange={(event) => setValue(event.target.value)} /></label>
      <label>Billing period start (UTC)<input type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <label>Billing period end (UTC, inclusive)<input type="date" required value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      <button className="primary-button" disabled={status.busy}>{status.busy ? 'Saving...' : 'Save provider reading'}</button>
      {status.error && <p role="alert" className="field-error">{status.error}</p>}
      {status.message && <p role="status">{status.message}</p>}
    </form>
  )
}

export function InfrastructureUsagePanel({ client = supabase }) {
  const [day, setDay] = useState(utcToday)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState({ loading: true, error: '' })

  useEffect(() => {
    let active = true
    let busy = false
    const load = async () => {
      if (busy) return
      busy = true
      setStatus((current) => ({ ...current, loading: true }))
      try {
        const result = await callInfrastructureRpc(client, 'get_infrastructure_usage', { p_day: day })
        if (!result?.settings || !PLAN_LIMITS[result.settings.supabase_plan]) throw new Error('Infrastructure usage returned an unsupported snapshot. Check the deployed migration.')
        if (active) {
          setSummary(result)
          setStatus({ loading: false, error: '' })
        }
      } catch (error) {
        if (active) setStatus({ loading: false, error: error.message })
      } finally {
        busy = false
      }
    }
    load()
    const timer = autoRefresh ? window.setInterval(load, 60_000) : null
    return () => { active = false; if (timer !== null) window.clearInterval(timer) }
  }, [client, day, autoRefresh, refresh])

  const reload = () => setRefresh((current) => current + 1)
  const limits = summary ? PLAN_LIMITS[summary.settings.supabase_plan] : null
  const totals = new Map((summary?.activity || []).map((item) => [item.metric, item]))
  const queue = summary?.queue
  const expirationDays = summary?.settings.aws_expires_on
    ? Math.ceil((new Date(`${summary.settings.aws_expires_on}T00:00:00Z`) - new Date(`${utcToday()}T00:00:00Z`)) / 86400000)
    : null
  const historyDays = [...new Set((summary?.history || []).map((item) => item.day))].sort().reverse()
  const settingsKey = summary ? JSON.stringify([
    summary.settings.supabase_plan, summary.settings.aws_plan, summary.settings.aws_expires_on,
  ]) : ''

  return (
    <div className="it-overview infrastructure-panel">
      <header className="it-section">
        <h3 className="it-section-title">Infrastructure &amp; Usage</h3>
        <p>Upgrade planning for Supabase and AWS Amplify. Green: below 70%. Yellow: 70–89%. Red: 90% or more. Unknown metrics never mean zero or healthy.</p>
        <div className="infra-toolbar">
          <label>Activity day (UTC)<input type="date" max={utcToday()} value={day} onChange={(event) => { if (event.target.value) setDay(event.target.value) }} /></label>
          <label><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Live refresh every 60 seconds</label>
          <button type="button" className="ghost-button" onClick={reload} disabled={status.loading}>{status.loading ? 'Refreshing...' : 'Refresh now'}</button>
        </div>
        <p role="status">{summary ? `Last successful snapshot: ${new Date(summary.measuredAt).toLocaleString()}` : 'No successful snapshot yet.'}</p>
        {status.error && <p role="alert" className="auth-message auth-error">{status.error} {summary && 'Displayed data is stale; do not treat it as current.'}</p>}
      </header>

      {summary && <>
        <section className="it-section">
          <h3 className="it-section-title">Capacity &amp; upgrade timeline</h3>
          <p>Configured Supabase plan: <strong>{summary.settings.supabase_plan === 'pro' ? 'Pro' : 'Free'}</strong>. Provider plan auto-detection is not connected. After upgrading at the provider, confirm your new plan below; every successful refresh recalculates limits, remaining capacity, percentages, warnings and forecasts.</p>
          <p>Upgrades do not erase stored files, database usage, all-time activity or current billing-period consumption. A new billing period requires a new provider reading—not an assumed zero.</p>
          {!summary.settings.plan_confirmed && <p><Health level="warning">Plan not confirmed</Health> Free limits are assumed. Confirm your actual plan below.</p>}
          <div className="it-stat-grid">
            <CapacityCard title="Database" used={Number(summary.databaseBytes)} limit={limits.database}
              detail="Live PostgreSQL database size, including indexes and system overhead. Provider billing measurements may differ."
              forecast={growthForecast(summary.snapshots, 'database_bytes', limits.database)} />
            <CapacityCard title="Stored files" used={Number(summary.storageBytes)} limit={limits.storage}
              incomplete={summary.buckets.some((bucket) => Number(bucket.unknown_size) > 0)}
              detail="Live object metadata across all buckets; not database size or lifetime uploaded bytes."
              forecast={growthForecast(summary.snapshots, 'storage_bytes', limits.storage)} />
          </div>
          <p>Forecasts are linear estimates, not guarantees. Snapshots are collected while this page is open; gaps are not daily measurements.</p>
          <p><Health level={summary.settings.supabase_plan === 'free' ? 'warning' : 'good'}>
            {summary.settings.supabase_plan === 'free' ? 'Free upload limit: 50 MB per file' : 'Pro: configure project and bucket upload limits'}
          </Health> EchoAI accepts up to 2 GB per media file. Free cannot support that full range; bucket settings alone cannot bypass the project limit.</p>
          <p><Health level={summary.settings.aws_plan === 'paid' ? 'good' : expirationDays === null ? 'unknown' : expirationDays <= 7 ? 'danger' : expirationDays <= 30 ? 'warning' : 'good'}>
            {summary.settings.aws_plan === 'paid' ? 'AWS Paid: no Free-account shutdown deadline' : expirationDays === null ? 'AWS expiration not recorded' : expirationDays < 0 ? `AWS expiration passed ${Math.abs(expirationDays)} days ago` : `AWS expiration in ${expirationDays} days`}
          </Health> {summary.settings.aws_plan === 'paid' ? 'Remaining credit expiration still affects charges; check AWS Billing. Paid usage is not a fixed capacity package.' : 'Confirm the account plan and credit terms in AWS Billing.'}</p>
        </section>

        <section className="it-section">
          <h3 className="it-section-title">Accounts &amp; publishing health</h3>
          <div className="it-stat-grid">
            {[['Registered users', summary.users], ['Beta testers', summary.betaUsers], ['Active subscriptions', summary.activeSubscriptions],
              ['Scheduled posts', queue.scheduled], ['Publishing now', queue.publishing], ['Failed posts (retained)', queue.failed]].map(([label, value]) => (
              <div className="it-stat-card" key={label}><strong className="it-stat-val">{count(value)}</strong><span>{label}</span></div>
            ))}
          </div>
          <p>Active subscriptions are billing records, not a verified count of paying customers; trials, testers and free access are not revenue.</p>
          <p><Health level={Number(queue.overdue) || Number(queue.stuck) ? 'danger' : 'good'}>
            {count(queue.overdue)} posts overdue by 5+ minutes; {count(queue.stuck)} publishing for 10+ minutes
          </Health> Investigate worker and provider errors before assuming more hosting capacity will fix delays.</p>
        </section>

        <section className="it-section">
          <h3 className="it-section-title">Processing &amp; content activity</h3>
          <p>“Processed” is separated into uploads, published posts and Echo Creator AI jobs recorded in the job ledger. Browser-only edits/exports and AI requests outside that ledger are not tracked. A post counts once, not once per social channel; mixed media is classified video first, then image.</p>
          <p>All-time means retained history seeded at deployment plus events captured since {new Date(summary.settings.tracking_started_at).toLocaleString()}. Earlier deleted records cannot be recovered. New counters survive content deletion. Current month uses UTC calendar dates, not provider billing periods.</p>
          <div className="infra-table-scroll"><table className="infra-table">
            <thead><tr><th>Activity</th><th>{day} (UTC)</th><th>Current month</th><th>All-time captured</th><th>Daily / all-time uploaded</th></tr></thead>
            <tbody>{ACTIVITY_METRICS.map(([metric, label]) => {
              const row = totals.get(metric)
              return <tr key={metric}><th scope="row">{label}</th><td>{count(row?.daily || 0)}</td><td>{count(row?.month || 0)}</td><td>{count(row?.total || 0)}</td>
                <td>{metric.startsWith('uploaded_') ? `${formatBytes(row?.daily_bytes || 0)} / ${formatBytes(row?.bytes || 0)}` : '—'}</td></tr>
            })}</tbody>
          </table></div>
        </section>

        <section className="it-section">
          <h3 className="it-section-title">Last 30 days: daily workload</h3>
          <p>Days without captured events have zero activity. Select a day for the detailed breakdown above.</p>
          <div className="infra-table-scroll"><table className="infra-table">
            <thead><tr><th>UTC day</th><th>Uploads</th><th>Published posts</th><th>AI completed</th><th>AI failed / refunded</th></tr></thead>
            <tbody>{historyDays.map((historyDay) => {
              const entries = summary.history.filter((item) => item.day === historyDay)
              const sum = (prefix) => entries.filter((item) => item.metric.startsWith(prefix)).reduce((total, item) => total + Number(item.quantity), 0)
              return <tr key={historyDay}><th scope="row"><button type="button" className="ghost-button" onClick={() => setDay(historyDay)}>{historyDay}</button></th>
                <td>{count(sum('uploaded_'))}</td><td>{count(sum('published_'))}</td><td>{count(sum('ai_completed_'))}</td><td>{count(sum('ai_failed'))}</td></tr>
            })}</tbody>
          </table>{!historyDays.length && <p>No captured activity in the last 30 days.</p>}</div>
        </section>

        <section className="it-section">
          <h3 className="it-section-title">Storage by bucket &amp; largest database tables</h3>
          <div className="infra-table-scroll"><table className="infra-table">
            <thead><tr><th>Bucket</th><th>Objects</th><th>Used</th><th>Bucket file limit</th><th>Missing size metadata</th></tr></thead>
            <tbody>{summary.buckets.map((bucket) => <tr key={bucket.id}><th scope="row">{bucket.id}</th><td>{count(bucket.objects)}</td><td>{formatBytes(bucket.bytes)}</td>
              <td>{bucket.file_size_limit === null ? 'Project limit applies' : formatBytes(bucket.file_size_limit)}</td><td>{count(bucket.unknown_size)}</td></tr>)}</tbody>
          </table></div>
          <p>Storage totals exclude unknown sizes and incomplete uploads. A configured bucket limit does not override the provider’s project limit.</p>
          <div className="infra-table-scroll"><table className="infra-table">
            <thead><tr><th>Public table (top 10)</th><th>Table + index size</th></tr></thead>
            <tbody>{summary.tables.map((table) => <tr key={table.name}><th scope="row">{table.name}</th><td>{formatBytes(table.bytes)}</td></tr>)}</tbody>
          </table></div>
        </section>

        <section className="it-section">
          <h3 className="it-section-title">Provider quotas: Supabase &amp; AWS</h3>
          <p><Health level="unknown">Provider billing APIs not connected</Health> App activity is not a substitute for billed transfer, function invocations, MAU or Amplify usage. These values require dated readings from the provider dashboards. Readings older than 24 hours or outside the current billing period cannot show green.</p>
          <div className="infra-table-scroll"><table className="infra-table">
            <thead><tr><th>Resource</th><th>Recorded usage</th><th>Included allowance</th><th>Status</th><th>Period / updated</th><th>Projected period usage</th></tr></thead>
            <tbody>{PROVIDER_METRICS.map((metric) => {
              const reading = summary.readings.find((item) => item.metric === metric.id)
              const freshness = readingStatus(reading)
              const current = freshness === 'Manual provider reading'
              const limit = providerAllowance(metric, summary.settings)
              const health = capacityStatus(current ? Number(reading.value) : null, limit)
              const isAws = metric.id.startsWith('aws_')
              const outsidePeriod = freshness === 'Outside current billing period'
              const healthLabel = isAws && current
                ? limit === null ? 'Pay-as-you-go / verify billing allowances' : health.level === 'good' ? 'Below conditional free allowance' : health.level === 'warning' ? 'Nearing conditional free allowance' : 'Review charges / conditional allowance'
                : health.label
              const projection = ['supabase_mau', 'aws_storage'].includes(metric.id) ? null : projectMonthlyUsage(reading)
              const projectedHealth = capacityStatus(projection, limit)
              const show = (value) => metric.unit === 'GB' ? formatBytes(value) : `${count(value)} ${metric.unit}`
              return <tr key={metric.id}><th scope="row">{metric.label}</th><td>{outsidePeriod ? <>Awaiting current-period reading<small>Previous period: {show(reading.value)}</small></> : reading ? show(reading.value) : 'Not connected'}</td>
                <td>{limit === null ? 'No confirmed fixed allowance' : show(limit)}{metric.allowance && limit !== null && <small>Conditional Free Tier allowance; verify eligibility</small>}</td>
                <td><Health level={health.level}>{current ? healthLabel : outsidePeriod ? 'Billing period changed / new reading needed' : freshness}</Health>{current && <small>{health.percent === null ? 'No fixed capacity percentage' : `${health.percent.toFixed(1)}%`} · manual reading</small>}</td>
                <td>{reading ? <>{reading.period_start} – {reading.period_end}<small>{new Date(reading.measured_at).toLocaleString()}</small></> : 'No reading'}</td>
                <td>{projection === null ? 'Not available' : <><span>{show(projection)}</span><small><Health level={projectedHealth.level}>{isAws ? 'Projected conditional allowance usage' : projectedHealth.label}</Health></small></>}</td></tr>
            })}</tbody>
          </table></div>
          <p>Projections use the pace at the recorded timestamp and need at least one full day in the billing period. They do not predict unique users or point-in-time CDN storage. AWS allowances are cost thresholds, not hosting capacity limits.</p>
          <details><summary>Record usage from a provider dashboard</summary><ProviderReadingForm client={client} onSaved={reload} /></details>
        </section>

        <section className="it-section">
          <h3 className="it-section-title">Upgrade playbook</h3>
          <ul>
            <li><strong>Supabase Free → Pro:</strong> before paid launch, when larger-than-50 MB uploads are needed, or at 70% of a resource allowance—whichever comes first. Red at 90% means act now, not wait for failures.</li>
            <li><strong>Pro baseline:</strong> from $25/month for one Micro project with included compute credit; 8 GB database disk, 100 GB files, 250 GB uncached plus 250 GB cached transfer, 2 million function invocations and 100,000 MAU. Extra projects, compute, add-ons and overages cost more.</li>
            <li><strong>Reliability:</strong> Pro includes daily database backups retained for seven days and no inactivity pausing. Uploaded media is not included in database backups; arrange separate file backups. Pro is not a guarantee of zero downtime or sufficient compute.</li>
            <li><strong>Compute:</strong> investigate slow queries, indexes, CPU, memory, connection pressure and peak load before increasing database compute. Team is for organizational/compliance needs, not a 50- or 100-customer milestone.</li>
            <li><strong>AWS:</strong> keep Amplify static hosting. If using the newer Free account plan, convert to Paid before six months/credit exhaustion according to your account’s terms. Older accounts differ. Pay-as-you-go does not speed up Supabase.</li>
            <li><strong>AWS cost planning:</strong> published standard rates include $0.01/build minute, $0.15/GB served and $0.023/GB-month stored, before eligible credits/allowances. Other services and build sizes differ. Set AWS Billing budgets and alerts; alerts are not hard spending caps.</li>
            <li><strong>50 and 100 paying customers:</strong> review measured costs and run peak-load tests, not automatic package upgrades. AI/social-provider quotas, browser video rendering and job architecture remain separate constraints.</li>
          </ul>
          <p>Reference limits checked November 10, 2026; verify current pricing and your account’s billing period. GB/MB here use decimal bytes.</p>
          <div className="infra-links">
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase dashboard</a>
            <a href="https://supabase.com/pricing" target="_blank" rel="noreferrer">Supabase pricing</a>
            <a href="https://supabase.com/docs/guides/storage/uploads/file-limits" target="_blank" rel="noreferrer">Upload limits</a>
            <a href="https://supabase.com/docs/guides/platform/backups" target="_blank" rel="noreferrer">Backup coverage</a>
            <a href="https://console.aws.amazon.com/billing/" target="_blank" rel="noreferrer">AWS Billing</a>
            <a href="https://aws.amazon.com/amplify/pricing/" target="_blank" rel="noreferrer">Amplify pricing</a>
            <a href="https://aws.amazon.com/free/" target="_blank" rel="noreferrer">AWS Free Tier terms</a>
          </div>
        </section>
        <section className="it-section">
          <h3 className="it-section-title">Plan configuration</h3>
          <p>Administrator / IT only. Confirm upgrades here after changing the provider subscription. Saved settings change planning thresholds for everyone, not your actual provider plans. Consumption is never zeroed on upgrade or downgrade. AWS Paid removes Free-account deadline and assumed free-allowance capacity warnings; credits and service allowances still need verification in AWS Billing.</p>
          <PlanSettings key={settingsKey} settings={summary.settings} onSaved={reload} client={client} />
        </section>
      </>}
    </div>
  )
}
