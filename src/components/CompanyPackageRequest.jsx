import { useState } from 'react'
import './CompanyPackageRequest.css'

export function CompanyPackageRequest({ onSubmit, submitted = false }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    company: '',
    seatCount: '10',
    details: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const seatCount = Number(form.seatCount)
    if (!form.fullName.trim() || !form.email.trim() || !form.company.trim()) {
      setError('Name, work email, and company are required.')
      return
    }
    if (!Number.isInteger(seatCount) || seatCount < 1) {
      setError('Enter a whole number of seats.')
      return
    }

    setBusy(true)
    try {
      await onSubmit({ ...form, seatCount })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <section className="company-package-request is-submitted" id="company-packages">
        <p className="landing-section-label">Company packages</p>
        <h2>Request received.</h2>
        <p>Your request is now in the support queue. We will reply with seat pricing and package options.</p>
      </section>
    )
  }

  return (
    <section className="company-package-request" id="company-packages">
      <div className="company-package-copy">
        <p className="landing-section-label">Company packages</p>
        <h2>Bring your whole team into one workspace.</h2>
        <p>Tell us how many seats you need. We will review the request, reply with pricing, and create the approved package for your company.</p>
        <span>No partial refunds. Package changes apply to future billing or the next approved invoice.</span>
      </div>
      <form className="company-package-form" onSubmit={submit}>
        <label>Full name<input value={form.fullName} onChange={(event) => update('fullName', event.target.value)} placeholder="Alex Rivera" /></label>
        <label>Work email<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="alex@company.com" /></label>
        <label>Company<input value={form.company} onChange={(event) => update('company', event.target.value)} placeholder="Company name" /></label>
        <label>Seats needed<input type="number" min="1" step="1" value={form.seatCount} onChange={(event) => update('seatCount', event.target.value)} /></label>
        <label className="company-package-form-wide">Notes<textarea value={form.details} onChange={(event) => update('details', event.target.value)} placeholder="Team size, timing, or anything we should know." rows="3" /></label>
        {error && <p className="company-package-error company-package-form-wide">{error}</p>}
        <button type="submit" className="landing-primary-action company-package-form-wide" disabled={busy}>{busy ? 'Sending request...' : 'Request company package'}</button>
      </form>
    </section>
  )
}
