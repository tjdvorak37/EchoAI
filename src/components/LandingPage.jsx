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
  ['01', 'Bring your source material', 'Upload documents and media, or link files from Google Drive, OneDrive, and SharePoint.', 'blue'],
  ['02', 'Create with the right AI', 'Build briefs and copy, or route image, video, audio, character, and analysis jobs to your private AI tools.', 'coral'],
  ['03', 'Refine every detail', 'Edit photo layers, heal pixels, build branded layouts, trim footage, and mix timeline effects.', 'yellow'],
  ['04', 'Publish and learn', 'Schedule connected social channels, sync your calendar, manage reposts, and monitor audience signals.', 'green'],
]

const capabilities = [
  ['AI Studio', 'One brief, every format', 'Combine documents into campaign copy, flyers, social concepts, video plans, and complete post packages.', '#ff6b5e'],
  ['In-house AI', 'Bring your strongest models', 'Connect multiple private AI tools for writing, image editing, characters, video, audio, and media analysis.', '#7b4bc9'],
  ['Photo + video', 'Real media editors', 'Build branded image layers, heal and paint pixels, arrange timeline clips, add effects, and export.', '#2364d8'],
  ['Publish', 'Social scheduling that stays connected', 'Authorize social accounts, queue multi-channel posts, sync Google Calendar, and move company reposts through approvals.', '#11866f'],
  ['Listen', 'Know what happens next', 'Track sentiment, competitors, trends, influencers, share of voice, and reputation risk.', '#d58b00'],
  ['Workspace', 'Files and brand assets together', 'Organize media, link cloud drives, and reuse company colors, licensed fonts, logos, and guidelines.', '#c24f72'],
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
          <a href="#tools">Tools</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="landing-support-link" onClick={() => setSupportOpen(true)}>
            Need help signing in?
          </button>
          <button type="button" className="landing-primary-action" onClick={onPurchase}>Start creating</button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-content">
            <div className="landing-badge"><span /> AI content workspace for growing teams</div>
            <h1 className="landing-headline">EchoAI brings creation, editing, publishing, and listening into one workspace.</h1>
            <p className="landing-subhead">
              Bring documents, cloud files, brand assets, and your preferred AI models. Build the
              creative, refine it in real editors, publish to connected channels, and learn from the response.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-primary-action landing-hero-btn" onClick={onPurchase}>
                Create your first project <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="landing-secondary-action landing-hero-btn" onClick={onPurchase}>
                See plans
              </button>
            </div>
            <div className="landing-proof-row" aria-label="Plan highlights">
              <span><strong>$15</strong> monthly</span>
              <span><strong>2 GB</strong> workspace</span>
              <span><strong>All</strong> creation tools</span>
            </div>
          </div>

          <div className="landing-hero-visual" aria-label="EchoAI document to flyer workflow preview">
            <img className="landing-mascot-float" src={echoMascot} alt="Echo, the EchoAI mascot" />
            <div className="landing-visual-shell">
              <div className="landing-visual-header">
                <span className="landing-visual-brand"><i /> Creative brief</span>
                <span className="landing-visual-status">Project ready</span>
              </div>
              <div className="landing-visual-body">
                <div className="landing-source-column">
                  <p>Source files</p>
                  {[
                    ['PPT', 'Launch deck.pptx', '18 slides'],
                    ['XLS', 'Product details.xlsx', '4 sheets'],
                    ['DOC', 'Campaign notes.docx', '2 pages'],
                  ].map(([type, name, detail]) => (
                    <div className="landing-source-file" key={name}>
                      <span>{type}</span>
                      <div><strong>{name}</strong><small>{detail}</small></div>
                    </div>
                  ))}
                  <div className="landing-prompt-preview">
                    <small>Instruction</small>
                    <p>Create a colorful launch flyer from these files.</p>
                  </div>
                </div>
                <div className="landing-result-column">
                  <div className="landing-result-toolbar"><span>Editable flyer</span><span>4:5</span></div>
                  <div className="landing-poster-wrap">
                    <img src={demoPosterImage} alt="Editable campaign flyer generated in EchoAI" />
                    <span className="landing-layer-tag tag-copy">Headline</span>
                    <span className="landing-layer-tag tag-image">Image</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-workflow" id="workflow">
          <div className="landing-section-heading">
            <p>From scattered files to one clear campaign</p>
            <h2>A workflow people understand at a glance.</h2>
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

        <section className="landing-tools" id="tools">
          <div className="landing-section-heading landing-section-heading-inline">
            <div><p>One connected content system</p><h2>Make the work. Manage the response.</h2></div>
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

        <section className="landing-pricing" id="pricing">
          <div className="landing-pricing-copy">
            <p>Simple pricing</p>
            <h2>Every package. Every tool.</h2>
            <span>Choose storage for the way you work. All five packages include the complete EchoAI workspace.</span>
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
                    <strong>{plan.storageGb} GB</strong>
                    <span>workspace storage</span>
                  </div>
                  <button type="button" className={plan.popular ? 'landing-primary-action' : 'landing-secondary-action'} onClick={() => onPurchase(plan.key)}>
                    Choose {plan.label}
                  </button>
                </article>
              )
            })}
          </div>
          <div className="landing-included-row">
            <span>Included with every package</span>
            <strong>AI Studio + private AI tools</strong>
            <strong>Photo + video editors</strong>
            <strong>Scheduler + reposting</strong>
            <strong>Listening + cloud workspace</strong>
          </div>
          <p className="landing-pricing-note">Annual billing saves 15%. Secure checkout powered by Stripe. Cancel anytime.</p>
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
