import { useState } from 'react'
import {
  BILLING_INTERVALS,
  PLANS,
  PLAN_ORDER,
  getAnnualSavings,
  getPlan,
  getPlanPrice,
} from '../data/plans'

const CORE_FEATURES = [
  'Social Listening intelligence with sentiment, trend, and crisis visibility',
  'Brand mentions, keywords, competitors, hashtags, and conversation tracking',
  'AI-powered recommendations and personal AI agent endpoint sync',
  'Immersive Photo Creator and timeline-based Video Studio',
  'Multi-channel scheduler, repost workflows, and team collaboration',
]

export function PurchasePage({ onBack, onSubmit, validatePromoCode, referralCode, billingLive }) {
  const [step, setStep] = useState('plan')
  const [selectedPlan, setSelectedPlan] = useState('storage_pro')
  const [billingInterval, setBillingInterval] = useState('monthly')
  const [form, setForm] = useState({ fullName: '', email: '' })
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState(null)
  const [promoError, setPromoError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [payError, setPayError] = useState('')

  const plan = getPlan(selectedPlan)
  const price = getPlanPrice(selectedPlan, billingInterval)
  const intervalMeta = BILLING_INTERVALS[billingInterval]
  // Stable reference ID generated once on mount
  const [licenseRef] = useState(() => `ECHOAI-${Date.now().toString(36).toUpperCase()}`)

  const validate = () => {
    const errs = {}
    if (!form.fullName.trim()) errs.fullName = 'Full name is required'
    if (!form.email.trim() || !form.email.includes('@')) errs.email = 'Valid email is required'
    return errs
  }

  const handleProceedToPayment = () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setStep('pay')
  }

  const handleConfirmPayment = async () => {
    setPayError('')
    setProcessing(true)

    try {
      const result = await onSubmit({
        licenseRef,
        plan: selectedPlan,
        billingInterval,
        priceUsd: price,
        storageLimitGb: plan.storageGb,
        fullName: form.fullName,
        email: form.email,
        promoCode: appliedPromo ? appliedPromo.code : null,
      })

      // Paid checkout hands off to the payment provider; the page is unloading.
      if (result?.redirected) return

      setSubmitted(true)
      setStep('done')
    } catch (error) {
      setPayError(error.message || 'We could not complete that. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  const handleApplyPromo = () => {
    setPromoError('')
    if (!promoInput.trim()) return
    const result = validatePromoCode(promoInput)
    if (result.valid) {
      setAppliedPromo(result.codeObj)
      setPromoError('')
    } else {
      setPromoError(result.message)
      setAppliedPromo(null)
    }
  }

  if (submitted && step === 'done') {
    return (
      <div className="purchase-page">
        <div className="purchase-panel">
          <div className="purchase-success-icon">✓</div>
          {appliedPromo ? (
            <>
              <h2>Your free month is activated!</h2>
              <p>
                30 days of full access has been applied to <strong>{form.email}</strong>. Create your
                login with that same email and you&apos;re in — no approval step required.
              </p>
            </>
          ) : billingLive ? (
            <>
              <h2>Payment received — you&apos;re active</h2>
              <p>
                Your subscription <strong>{licenseRef}</strong> is live. Create your login with{' '}
                <strong>{form.email}</strong> to get started — your plan is already attached to that
                address. Renewals, failed payments, and cancellations are handled automatically.
              </p>
            </>
          ) : (
            <>
              <h2>Demo checkout complete</h2>
              <p>
                <strong>No payment was taken and no account was created.</strong> This build is
                running in demo mode, so checkout is simulated locally.
              </p>
              <p>
                To take real payments, connect Supabase and Stripe. Until then, sign in with one of
                the demo accounts.
              </p>
            </>
          )}
          <button type="button" className="primary-button" onClick={() => onBack(billingLive ? 'signup' : 'signin')} style={{ marginTop: '1.5rem' }}>
            {billingLive ? 'Create my login' : 'Back to sign in'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="purchase-page">
      <div className="purchase-panel">
        <button type="button" className="text-button purchase-back" onClick={onBack}>
          ← Back
        </button>

        <div className="purchase-steps">
          {['plan', 'info', 'pay'].map((s, i) => (
            <div
              key={s}
              className={`purchase-step-dot ${step === s ? 'active' : (step === 'pay' && i < 2) || (step === 'info' && i < 1) ? 'done' : ''}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {step === 'plan' && (
          <>
            <h2>Choose your plan</h2>
            <p className="muted">
              Every plan includes the complete EchoAI suite. The only difference is how much
              storage you get.
            </p>

            {referralCode && (
              <div className="promo-applied" style={{ marginTop: '0.75rem' }}>
                <span>
                  🎉 You were referred — <strong>20% off your first month</strong> or{' '}
                  <strong>10% off your first year</strong> is applied at checkout.
                </span>
              </div>
            )}

            <div className="billing-toggle" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              {Object.entries(BILLING_INTERVALS).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  className={billingInterval === key ? 'chip active' : 'chip'}
                  onClick={() => setBillingInterval(key)}
                >
                  {meta.label}
                  {key === 'annual' ? ' — save 15%' : ''}
                </button>
              ))}
            </div>

            <ul className="pricing-features" style={{ marginTop: '0.75rem' }}>
              {CORE_FEATURES.map((item) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>

            <div className="plan-cards">
              {PLAN_ORDER.map((key) => {
                const option = PLANS[key]
                const optionPrice = getPlanPrice(key, billingInterval)
                const savings = getAnnualSavings(key)

                return (
                  <button
                    key={key}
                    type="button"
                    className={`plan-card ${selectedPlan === key ? 'selected' : ''}`}
                    onClick={() => setSelectedPlan(key)}
                  >
                    {option.popular && <span className="plan-card-badge">Most popular</span>}
                    <h3>{option.label}</h3>
                    <div className="plan-price">
                      <span className="plan-price-num">${optionPrice}</span>
                      <span className="plan-price-period">{intervalMeta.suffix}</span>
                    </div>
                    <p className="plan-card-storage">{option.storageGb} GB storage</p>
                    <p className="plan-card-note">{option.tagline}</p>
                    {billingInterval === 'annual' && (
                      <p className="plan-card-note">Save ${savings} a year</p>
                    )}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              className="primary-button"
              style={{ width: '100%', marginTop: '1.5rem' }}
              onClick={() => setStep('info')}
            >
              Continue with {plan.label} — ${price} {intervalMeta.suffix}
            </button>
          </>
        )}

        {step === 'info' && (
          <>
            <h2>Your information</h2>
            <p className="muted">This will be used to create and identify your license for all current EchoAI capabilities.</p>

            <label>
              Full name
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                placeholder="Alex Rivera"
              />
              {errors.fullName && <span className="field-error">{errors.fullName}</span>}
            </label>

            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="you@example.com"
              />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </label>

            <div className="purchase-summary">
              <span>Plan</span><strong>{plan.label}</strong>
              <span>Amount</span><strong>${price} {intervalMeta.suffix}</strong>
              <span>Storage</span><strong>{plan.storageGb} GB</strong>
              <span>Suite access</span><strong>All features enabled</strong>
            </div>

            <button
              type="button"
              className="primary-button"
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={handleProceedToPayment}
            >
              Proceed to payment
            </button>
            <button type="button" className="text-button" onClick={() => setStep('plan')}>
              ← Change plan
            </button>
          </>
        )}

        {step === 'pay' && (
          <>
            <h2>Complete your order</h2>
            <p className="muted">Your purchase unlocks Social Listening, AI agent sync, Photo Creator, Video Studio, and scheduler workflows.</p>

            {/* Promo code section — always shown first */}
            <div className="promo-code-section">
              <p className="promo-code-label">Have a promo code?</p>
              {appliedPromo ? (
                <div className="promo-applied">
                  <span>🎉 <strong>{appliedPromo.code}</strong> — {appliedPromo.description}</span>
                  <button type="button" className="text-button" onClick={() => { setAppliedPromo(null); setPromoInput('') }}>Remove</button>
                </div>
              ) : (
                <div className="promo-input-row">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    placeholder="Enter code (e.g. ECHO-FREE30)"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyPromo() } }}
                  />
                  <button type="button" className="ghost-button" onClick={handleApplyPromo}>Apply</button>
                </div>
              )}
              {promoError && <span className="field-error">{promoError}</span>}
            </div>

            {appliedPromo ? (
              <>
                <div className="promo-free-summary">
                  <span className="promo-free-icon">🎁</span>
                  <div>
                    <strong>Free 30-day access</strong>
                    <p>Your promo code covers one full month. No payment required.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  style={{ width: '100%' }}
                  disabled={processing}
                  onClick={handleConfirmPayment}
                >
                  {processing ? 'Activating…' : 'Activate my free month →'}
                </button>
              </>
            ) : (
              <>
                <div className="purchase-summary">
                  <span>Plan</span><strong>{plan.label}</strong>
                  <span>Billed</span><strong>${price} {intervalMeta.suffix}</strong>
                  <span>Storage</span><strong>{plan.storageGb} GB</strong>
                  {referralCode && (
                    <>
                      <span>Referral</span>
                      <strong>
                        {billingInterval === 'annual' ? '10% off your first year' : '20% off your first month'}
                      </strong>
                    </>
                  )}
                  <span>Renews</span><strong>Automatically until you cancel</strong>
                  <span>Activation</span><strong>Instant on successful payment</strong>
                </div>

                <p className="muted">
                  {billingLive
                    ? `You'll be taken to our secure payment provider. Your account switches on the
                       moment the payment clears, and it switches off automatically if a renewal
                       fails. Card details never touch EchoAI.`
                    : 'Demo mode: no payment provider is connected, so this button only simulates a purchase locally. Nothing is charged and no account is created.'}
                </p>

                <button
                  type="button"
                  className="primary-button"
                  style={{ width: '100%', marginTop: '1rem' }}
                  disabled={processing}
                  onClick={handleConfirmPayment}
                >
                  {processing
                    ? 'Opening secure checkout…'
                    : billingLive
                      ? `Pay $${price} securely →`
                      : `Simulate $${price} purchase (demo)`}
                </button>
              </>
            )}

            {payError && <span className="field-error">{payError}</span>}
          </>
        )}
      </div>
    </div>
  )
}
