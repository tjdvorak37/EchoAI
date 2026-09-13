import { useState } from 'react'
import demoPosterImage from '../assets/demo-poster.svg'
import echoMascot from '../assets/echo-mascot.svg'
import { PLAN_ORDER, PLANS, getAnnualSavings } from '../data/plans'
import { authService } from '../services/authService'
import { AnnouncementBanner } from './AnnouncementBanner'
import './LandingPage.css'

const SUPPORT_CATEGORIES = [
  'Cannot sign in',
  'Password reset',
  'Billing question',
  'Account access',
  'Something else',
]

const workflow = [
  ['01', 'Bring your source material', 'Upload presentations, spreadsheets, PDFs, or sync seamlessly from Google Drive, OneDrive, and SharePoint.', 'blue'],
  ['02', 'Create with Hosted & In-House AI', 'Generate structured briefs, captions, photoreal 4K images, timeline video plans, and voiceovers using EchoAI tokens.', 'coral'],
  ['03', 'Refine in Real Studio Editors', 'Edit photo layers with non-destructive pixel healing, shape masks, multi-track video timelines, and brand kit typography.', 'yellow'],
  ['04', 'Publish, Repost & Listen', 'Schedule across Instagram, Facebook, X, TikTok, YouTube, LinkedIn, sync calendars, and track market sentiment in real time.', 'green'],
]

const capabilities = [
  ['AI Content Studio', 'One brief, every format', 'Transform scattered slide decks, spreadsheets, and docs into campaign copy, flyers, video plans, and post packages.', '#ff6b5e'],
  ['Creative Studio Suite', 'Real multi-track media editors', 'Build branded image layers, retouch with pixel healing, arrange timeline video clips, mix audio tracks, and export WebM/PNG.', '#2364d8'],
  ['Social Listening Hub', 'Google-style market intelligence', 'Track mentions, net sentiment (-100 to +100), competitor share of voice, product feature requests, and ChatGPT search citations.', '#d58b00'],
  ['Multi-Channel Scheduler', 'Stay synced and automated', 'Queue multi-channel campaigns, mirror Google Calendar events, and move approved company broadcasts through team repost flows.', '#11866f'],
  ['Two-Bucket Token Engine', 'Permanent rollover protection', 'Monthly plan tokens replenish each billing cycle. Top-up add-on tokens (500 to 5,000) never expire and carry over indefinitely.', '#7b4bc9'],
  ['Brand Kit & Cloud Drives', 'Unified creative assets', 'Centralize company color palettes, licensed web fonts, approved logos, and link external cloud storage with zero quota overhead.', '#c24f72'],
]

const FEATURE_FAQS = [
  {
    q: 'How do monthly plan tokens vs purchased rollover tokens work?',
    a: 'Each subscription package comes with a generous monthly token allowance (500 to 7,500 tokens) that renews each billing cycle. If you ever purchase additional top-up tokens (500, 1,000, 2,500, or 5,000), they are stored in a separate permanent rollover balance that NEVER expires and carries over month-to-month until used.',
  },
  {
    q: 'Can I connect my company’s private AI keys or custom models?',
    a: 'Yes! EchoAI provides full backend and frontend management for OpenAI, Runway ML, Anthropic Claude, Replicate, Google Gemini, and custom AI router gateways with live 1-click credential testing.',
  },
  {
    q: 'Which social media channels can I publish to?',
    a: 'EchoAI natively connects to Instagram, Facebook, TikTok, YouTube, X (Twitter), LinkedIn, and Snapchat with multi-channel queueing, scheduled deployments, and company repost syndication.',
  },
  {
    q: 'Are payments secure and can I cancel anytime?',
    a: 'All transactions are processed through 256-bit encrypted Stripe Checkout with automatic tax compliance. Subscriptions can be paused, upgraded, or cancelled anytime with 1 click.',
  },
]

const Brand = () => (
  <span className="landing-brand-lockup">
    <img src={echoMascot} alt="" />
    <span>EchoAI</span>
  </span>
)

function SupportDialog({ onClose }) {
  const [form, setForm] = useState({ name: '', email: '', category: SUPPORT_CATEGORIES[0], details: '' })
  const [status, setStatus] = useState({ sending: false, error: '', sent: false })

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setStatus({ sending: true, error: '', sent: false })
    try {
      await authService.submitPublicSupportTicket(form)
      setStatus({ sending: false, error: '', sent: true })
    } catch (error) {
      setStatus({ sending: false, error: error.message, sent: false })
    }
  }

  return (
    <div className="landing-support-backdrop" role="dialog" aria-modal="true" aria-labelledby="landing-support-title" onClick={onClose}>
      <div className="landing-support-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="landing-support-close" onClick={onClose} aria-label="Close">×</button>

        {status.sent ? (
          <>
            <h2 id="landing-support-title">Request received</h2>
            <p>
              Our team will reply to <strong>{form.email}</strong>. If you are locked out, watch that
              inbox — we will never ask you for your password.
            </p>
            <button type="button" className="landing-primary-action" onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <h2 id="landing-support-title">Contact support</h2>
            <p className="landing-support-intro">
              Having trouble signing in? Send us the details and we will help you recover your account.
            </p>
            <form onSubmit={submit} className="landing-support-form">
              <label>
                Your name
                <input type="text" value={form.name} onChange={update('name')} autoComplete="name" />
              </label>
              <label>
                Email address <span aria-hidden="true">*</span>
                <input type="email" required value={form.email} onChange={update('email')} autoComplete="email" />
              </label>
              <label>
                Topic
                <select value={form.category} onChange={update('category')}>
                  {SUPPORT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>
                What is happening? <span aria-hidden="true">*</span>
                <textarea rows={5} required minLength={20} value={form.details} onChange={update('details')} placeholder="Tell us what you tried and any error message you saw." />
              </label>
              <p className="landing-support-note">Never include your password in this form.</p>
              {status.error && <p className="landing-support-error">{status.error}</p>}
              <button type="submit" className="landing-primary-action" disabled={status.sending}>
                {status.sending ? 'Sending…' : 'Send request'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export function LandingPage({ announcement, onSignIn, onPurchase, children }) {
  const [supportOpen, setSupportOpen] = useState(() => new URLSearchParams(window.location.search).get('support') === 'privacy')
  const [openFaqIndex, setOpenFaqIndex] = useState(0)

  return (
    <div className="landing-page" id="top">
      <AnnouncementBanner
        key={announcement.updatedAt}
        notice={announcement}
        audience="landing"
      />
      <header className="landing-nav">
        <a href="#top" aria-label="EchoAI home"><Brand /></a>
        <nav className="landing-nav-links" aria-label="Landing page">
          <a href="#workflow">How it works</a>
          <a href="#tools">Features</a>
          <a href="#pricing">Pricing &amp; Tokens</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="landing-support-link" onClick={() => setSupportOpen(true)}>
            Need help signing in?
          </button>
          <button type="button" className="landing-login" onClick={onSignIn}>Sign in</button>
          <button type="button" className="landing-primary-action" onClick={onPurchase}>Get started</button>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="landing-hero">
          <div className="landing-hero-content">
            <div className="landing-badge"><span /> AI Marketing &amp; Creative Operating System</div>
            <h1 className="landing-headline">Create, edit, publish, and listen in one connected AI workspace.</h1>
            <p className="landing-subhead">
              Transform raw documents, presentations, and brand files into campaign-ready creative. Refine in non-destructive photo and timeline video editors, schedule across major social channels, and track real-time audience sentiment.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-primary-action landing-hero-btn" onClick={onPurchase}>
                Start free trial / Create project <span aria-hidden="true">→</span>
              </button>
              <a href="#pricing" className="landing-secondary-action landing-hero-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                View pricing ($29–$129)
              </a>
            </div>
            <div className="landing-proof-row" aria-label="Plan highlights">
              <span><strong>$29/mo</strong> starting tier</span>
              <span><strong>500–7,500</strong> monthly tokens</span>
              <span><strong>Permanent</strong> token rollover</span>
              <span><strong>Complete</strong> creative suite</span>
            </div>
          </div>

          <div className="landing-hero-visual" aria-label="EchoAI document to flyer workflow preview">
            <img className="landing-mascot-float" src={echoMascot} alt="Echo, the EchoAI mascot" />
            <div className="landing-visual-shell">
              <div className="landing-visual-header">
                <span className="landing-visual-brand"><i /> Creative Brief &amp; Studio Lab</span>
                <span className="landing-visual-status">⚡ 2,500 Tokens Active</span>
              </div>
              <div className="landing-visual-body">
                <div className="landing-source-column">
                  <p>Source files &amp; references</p>
                  {[
                    ['PPTX', 'Q3 Launch Deck.pptx', '18 slides'],
                    ['XLSX', 'Feature Specs & Pricing.xlsx', '4 sheets'],
                    ['PDF', 'Brand Voice Guide.pdf', '12 pages'],
                  ].map(([type, name, detail]) => (
                    <div className="landing-source-file" key={name}>
                      <span>{type}</span>
                      <div><strong>{name}</strong><small>{detail}</small></div>
                    </div>
                  ))}
                  <div className="landing-prompt-preview">
                    <small>AI Campaign Directive</small>
                    <p>Build 4:5 launch flyer, 3 Instagram captions &amp; 15s video storyboard.</p>
                  </div>
                </div>
                <div className="landing-result-column">
                  <div className="landing-result-toolbar"><span>Multi-Layer Output</span><span>4:5 Studio Ready</span></div>
                  <div className="landing-poster-wrap">
                    <img src={demoPosterImage} alt="Editable campaign flyer generated in EchoAI" />
                    <span className="landing-layer-tag tag-copy">Headline · Brand Font</span>
                    <span className="landing-layer-tag tag-image">4K AI Visual · 10 tokens</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow 4-Step Grid */}
        <section className="landing-workflow" id="workflow">
          <div className="landing-section-heading">
            <p>From scattered source files to unified campaigns</p>
            <h2>A seamless creative pipeline built for velocity.</h2>
          </div>
          <div className="landing-workflow-grid">
            {workflow.map(([number, title, description, tone]) => (
              <article className={`landing-workflow-step tone-${tone}`} key={number}>
                <span>{number}</span>
                <div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </section>

        {/* Core Capabilities */}
        <section className="landing-tools" id="tools">
          <div className="landing-section-heading landing-section-heading-inline">
            <div><p>Complete product capability</p><h2>Everything your team needs to dominate content.</h2></div>
            <p className="landing-section-copy">No exporting between disconnected tools just to finish one campaign.</p>
          </div>
          <div className="landing-capability-grid">
            {capabilities.map(([label, title, description, accent]) => (
              <article className="landing-capability" key={label} style={{ '--capability-accent': accent }}>
                <span>{label}</span><h3>{title}</h3><p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Pricing Tiers */}
        <section className="landing-pricing" id="pricing">
          <div className="landing-pricing-copy">
            <p>Predictable subscription tiers</p>
            <h2>Choose the right workspace for your scale.</h2>
            <span>Every package includes the complete EchoAI creative suite, social listening, and monthly token allocations.</span>
          </div>
          <div className="landing-pricing-grid">
            {PLAN_ORDER.map((planKey) => {
              const plan = PLANS[planKey]
              const savings = getAnnualSavings(planKey)
              return (
                <article className={`landing-price-panel ${plan.popular ? 'is-popular' : ''}`} key={plan.key}>
                  <div className="landing-price-topline">
                    <span>{plan.label}</span>
                    <span>{plan.popular ? 'Most popular' : `${plan.storageGb} GB`}</span>
                  </div>
                  <div className="landing-price">
                    <strong>${plan.monthlyPrice}</strong><span>per month</span>
                  </div>
                  <div className="landing-annual-price">
                    <strong>${plan.annualPrice}</strong>
                    <span>per year · save ${savings}</span>
                  </div>
                  <p>{plan.tagline}</p>
                  <div className="landing-plan-storage">
                    <strong>{plan.includedAiCredits.toLocaleString()} Tokens</strong>
                    <span>included monthly · {plan.storageGb} GB space</span>
                  </div>
                  <button type="button" className={plan.popular ? 'landing-primary-action' : 'landing-secondary-action'} onClick={() => onPurchase(plan.key)}>
                    Choose {plan.label}
                  </button>
                </article>
              )
            })}
          </div>

          {/* Top-up Token Add-ons Section */}
          <div className="landing-addons-spotlight" style={{ marginTop: '2.5rem', background: '#ffffff', border: '1.5px solid #bfdbfe', borderRadius: '16px', padding: '1.5rem 2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <span className="section-label">Permanent Token Rollover</span>
                <h3 style={{ margin: '0.2rem 0', fontSize: '1.25rem', color: '#0f172a' }}>⚡ Need extra tokens? Top-up add-on packs never expire.</h3>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Purchase add-on packages anytime. They carry over month-to-month and are only tapped after your monthly plan tokens reach zero.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {[
                { tokens: '500', price: '$9.99', tag: 'Starter' },
                { tokens: '1,000', price: '$18.99', tag: 'Creator' },
                { tokens: '2,500', price: '$39.99', tag: 'Most Popular', popular: true },
                { tokens: '5,000', price: '$74.99', tag: 'Best Value (Save 25%)', best: true },
              ].map((pack) => (
                <div
                  key={pack.tokens}
                  style={{
                    background: pack.best ? '#f0fdf4' : pack.popular ? '#eff6ff' : '#f8fafc',
                    border: `1.5px solid ${pack.best ? '#86efac' : pack.popular ? '#93c5fd' : '#cbd5e1'}`,
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                  }}
                >
                  <small style={{ fontWeight: 800, color: pack.best ? '#15803d' : pack.popular ? '#1d4ed8' : '#64748b', textTransform: 'uppercase', fontSize: '0.72rem' }}>{pack.tag}</small>
                  <strong style={{ display: 'block', fontSize: '1.35rem', margin: '0.2rem 0', color: '#0f172a' }}>{pack.tokens} Tokens</strong>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{pack.price} <small style={{ fontWeight: 500, fontSize: '0.75rem', color: '#64748b' }}>one-time</small></span>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-included-row" style={{ marginTop: '2rem' }}>
            <span>Included with every package</span>
            <strong>AI Studio + private AI tools</strong>
            <strong>Photo + video editors</strong>
            <strong>Scheduler + reposting</strong>
            <strong>Listening + cloud workspace</strong>
          </div>
          <p className="landing-pricing-note">Annual billing saves 15%. Secure 256-bit checkout powered by Stripe. Cancel anytime.</p>
        </section>

        {/* FAQ Section */}
        <section className="landing-faq" id="faq" style={{ maxWidth: '1000px', margin: '4rem auto 0', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
          <div className="landing-section-heading">
            <p>Frequently Asked Questions</p>
            <h2>Everything you need to know about EchoAI.</h2>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
            {FEATURE_FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx
              return (
                <div
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '1.15rem 1.4rem',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                  onClick={() => setOpenFaqIndex(isOpen ? -1 : idx)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <strong style={{ fontSize: '1.02rem', color: '#0f172a' }}>{faq.q}</strong>
                    <span style={{ fontSize: '1.2rem', color: '#3b82f6', fontWeight: 800 }}>{isOpen ? '−' : '+'}</span>
                  </div>
                  {isOpen && (
                    <p style={{ margin: '0.75rem 0 0', color: '#475569', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      {faq.a}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {children}
      </main>

      <footer className="landing-footer">
        <a href="#top"><Brand /></a>
        <span>AI content creation, editing, publishing, and listening in one workspace.</span>
        <div className="landing-footer-actions">
          <button type="button" className="landing-support-link" onClick={() => setSupportOpen(true)}>
            Contact support
          </button>
          <a className="landing-support-link" href="/privacy-policy">Privacy policy</a>
          <button type="button" className="landing-admin-cta" onClick={onSignIn}>
            Admin Center
          </button>
        </div>
      </footer>

      {supportOpen && <SupportDialog onClose={() => setSupportOpen(false)} />}
    </div>
  )
}
