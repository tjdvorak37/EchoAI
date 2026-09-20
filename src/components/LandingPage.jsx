import { useState } from 'react'
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CirclePlay,
  ChartNoAxesCombined,
  Image,
  Layers3,
  Link2,
  Menu,
  Megaphone,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Video,
  X,
} from 'lucide-react'
import demoPosterImage from '../assets/demo-poster.svg'
import uploadedHeroArt from '../assets/woking-landing.png'
import echoModern from '../assets/echo-poses/echo-modern-friendly.png'
import echoCreator from '../assets/echo-poses/echo-creator-mode.png'
import echoSocial from '../assets/echo-poses/echo-social-media.png'
import echoAiTools from '../assets/echo-poses/echo-ai-tools.png'
import echoPhoto from '../assets/echo-poses/echo-photo-editor.png'
import echoVideo from '../assets/echo-poses/echo-video-editor.png'
import echoScheduler from '../assets/echo-poses/echo-scheduler.png'
import echoAnalytics from '../assets/echo-poses/echo-analytics.png'
import { SOCIAL_PLATFORMS } from '../data/socialPlatforms'
import { authService } from '../services/authService'
import { PRIVACY_STORAGE_KEY } from '../services/analyticsService'
import { AnnouncementBanner } from './AnnouncementBanner'
import './LandingPage.css'
import './LandingPageRefresh.css'

const SUPPORT_CATEGORIES = [
  'Cannot sign in',
  'Password reset',
  'Billing question',
  'Account access',
  'Something else',
]

const PRODUCT_LINKS = [
  ['Workspace files', '#tools'],
  ['Photo Creator', '#tools'],
  ['Video Editor', '#tools'],
  ['Post Scheduler', '#workflow'],
  ['Social Listening', '#tools'],
  ['Brand & Cloud Workspace', '#tools'],
]

const toolRibbon = [
  ['social', Send, 'Social Media', echoSocial],
  ['workspace', Layers3, 'Workspace', echoAiTools],
  ['photo', Image, 'Photo Editor', echoPhoto],
  ['video', Video, 'Video Editor', echoVideo],
  ['schedule', CalendarDays, 'Scheduler', echoScheduler],
  ['analytics', BarChart3, 'Analytics', echoAnalytics],
]

const showcaseFeatures = [
  [Layers3, 'Advanced photo and video editors', 'Refine layers, timelines, text, audio, and brand styling.'],
  [CalendarDays, 'Multi-platform scheduling', 'Plan approved posts and keep every connected channel in view.'],
  [Users, 'Team collaboration', 'Share assets, coordinate reposts, and keep work organized.'],
  [BarChart3, 'Analytics and insights', 'Follow performance, listening signals, and campaign activity.'],
]

const workflowSteps = [
  [Link2, 'Connect', 'Link the channels and ad accounts your team already manages.', 'Connections'],
  [Image, 'Create', 'Bring an image from your device into Image Lab and refine it.', 'Image Lab'],
  [CalendarDays, 'Queue', 'Write the post, inspect each social preview, and choose the right moment.', 'Queue Studio'],
  [ChartNoAxesCombined, 'Improve', 'Use audience signals and paid-media results to guide the next campaign.', 'Signal Watch + Ads'],
]

const premiumHighlights = [
  ['Publish with confidence', 'Queue Studio, live social previews, and connected-channel publishing.'],
  ['Create without the clutter', 'Image Lab and Motion Lab work directly with files from your device.'],
  ['Make sharper decisions', 'Signal Watch and Ads show the conversations and outcomes worth acting on.'],
]

const audiences = [
  [Image, 'Content creators', ['Edit your own media', 'Publish consistently', 'Keep your account for free'], 'violet'],
  [Store, 'Small businesses', ['Plan consistently', 'Keep brand assets together', 'Share work easily'], 'blue'],
  [Users, 'Marketing teams', ['Collaborate around campaigns', 'Manage multiple channels', 'Streamline approvals'], 'green'],
  [BriefcaseBusiness, 'Agencies', ['Organize client work', 'Build repeatable workflows', 'Scale paid tools when ready'], 'coral'],
]

const FEATURE_FAQS = [
  {
    q: 'Can I use my own images and videos?',
    a: 'Yes. Upload your own media, refine it in the photo or video editor, organize it in your workspace, and schedule it across your connected channels.',
  },
  {
    q: 'Which social media channels can I publish to?',
    a: 'EchoAI currently publishes to Instagram, Facebook, TikTok, YouTube, X, and LinkedIn. Threads, Twitch, Google Business Profile, Bluesky, and Pinterest are visible on our integration roadmap and will open as each provider connection is completed.',
  },
  {
    q: 'Are payments secure and can I cancel anytime?',
    a: 'All transactions are processed through 256-bit encrypted Stripe Checkout with automatic tax compliance. Subscriptions can be paused, upgraded, or cancelled anytime with 1 click.',
  },
]

const Brand = () => (
  <span className="landing-brand-lockup">
    <img src={echoModern} alt="" />
    <span>EchoAI</span>
  </span>
)

function NavDropdown({ label, children, wide = false, isOpen, onOpenChange }) {
  return (
    <div
      className={`landing-nav-dropdown ${wide ? 'is-wide' : ''} ${isOpen ? 'is-open' : ''}`}
      onMouseEnter={() => onOpenChange(true)}
      onMouseLeave={() => onOpenChange(false)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false) }}
    >
      <button type="button" className="landing-nav-dropdown-trigger" onClick={() => onOpenChange(!isOpen)} aria-expanded={isOpen}>
        {label}<ChevronDown size={15} aria-hidden="true" />
      </button>
      <div className="landing-nav-menu" onClick={() => onOpenChange(false)}>{children}</div>
    </div>
  )
}

function PrivacyChoices() {
  const [choices, setChoices] = useState(() => {
    try {
      const saved = window.localStorage.getItem(PRIVACY_STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [panelOpen, setPanelOpen] = useState(false)
  const [analyticsAllowed, setAnalyticsAllowed] = useState(choices?.analytics ?? false)

  const saveChoices = (analytics) => {
    const nextChoices = { necessary: true, analytics, savedAt: new Date().toISOString() }
    try {
      window.localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(nextChoices))
    } catch {
      // The choice still applies for this page view when storage is unavailable.
    }
    setChoices(nextChoices)
    setAnalyticsAllowed(analytics)
    setPanelOpen(false)
  }

  return (
    <>
      {!choices && !panelOpen && (
        <aside className="landing-privacy-prompt" aria-labelledby="privacy-prompt-title">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong id="privacy-prompt-title">Your privacy choices</strong>
            <p>Choose whether EchoAI may use optional analytics. Essential storage keeps your account and preferences working.</p>
            <a href="/privacy-policy">Read our privacy policy</a>
          </div>
          <div className="landing-privacy-actions">
            <button type="button" className="landing-secondary-action" onClick={() => saveChoices(false)}>Decline optional</button>
            <button type="button" className="landing-primary-action" onClick={() => saveChoices(true)}>Accept all</button>
            <button type="button" className="landing-privacy-manage" onClick={() => setPanelOpen(true)}>Manage choices</button>
          </div>
        </aside>
      )}

      {panelOpen && (
        <div className="landing-privacy-backdrop" role="dialog" aria-modal="true" aria-labelledby="privacy-panel-title">
          <section className="landing-privacy-panel">
            <div className="landing-privacy-panel-header">
              <div><span>Privacy center</span><h2 id="privacy-panel-title">Control your data choices</h2></div>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close privacy choices"><X size={20} /></button>
            </div>
            <p>Essential technologies are always active because they support security, authentication, and saved preferences.</p>
            <div className="landing-privacy-option">
              <div><strong>Essential</strong><span>Required for account security and core site operation.</span></div>
              <span className="landing-privacy-required"><Check size={14} /> Always active</span>
            </div>
            <label className="landing-privacy-option">
              <div><strong>Optional analytics</strong><span>Helps us understand feature usage and improve EchoAI.</span></div>
              <input type="checkbox" checked={analyticsAllowed} onChange={(event) => setAnalyticsAllowed(event.target.checked)} />
            </label>
            <div className="landing-privacy-panel-actions">
              <a href="/privacy-policy">Full privacy policy</a>
              <button type="button" className="landing-primary-action" onClick={() => saveChoices(analyticsAllowed)}>Save choices</button>
            </div>
          </section>
        </div>
      )}

      {choices && !panelOpen && (
        <button type="button" className="landing-privacy-launcher" onClick={() => setPanelOpen(true)} aria-label="Open privacy choices">
          <ShieldCheck size={18} /> Privacy
        </button>
      )}
    </>
  )
}

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

export function LandingPage({ announcement, onSignIn, onCreateAccount, onPurchase }) {
  const [supportOpen, setSupportOpen] = useState(() => new URLSearchParams(window.location.search).get('support') === 'privacy')
  const [openFaqIndex, setOpenFaqIndex] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState('')

  return (
    <div className="landing-page" id="top">
      <AnnouncementBanner
        key={announcement.updatedAt}
        notice={announcement}
        audience="landing"
      />
      <header className="landing-nav">
        <a href="#top" aria-label="EchoAI home"><Brand /></a>
        <nav className={`landing-nav-links ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Landing page">
          <NavDropdown label="Product" isOpen={openDropdown === 'product'} onOpenChange={(open) => setOpenDropdown(open ? 'product' : '')}>
            <div className="landing-product-links">
              {PRODUCT_LINKS.map(([label, href]) => <a href={href} key={label} onClick={() => setMobileMenuOpen(false)}>{label}<span>Explore</span></a>)}
            </div>
          </NavDropdown>
          <NavDropdown label="Social media" wide isOpen={openDropdown === 'social'} onOpenChange={(open) => setOpenDropdown(open ? 'social' : '')}>
            <div className="landing-social-links">
              {SOCIAL_PLATFORMS.map((platform) => <a href="#workflow" key={platform.key} onClick={() => setMobileMenuOpen(false)}>{platform.label}</a>)}
            </div>
            <p className="landing-menu-note">One calendar for your connected channels. New integrations are released as provider access becomes available.</p>
          </NavDropdown>
          <a href="#get-started" onClick={() => setMobileMenuOpen(false)}>Plans</a>
          <NavDropdown label="Resources" isOpen={openDropdown === 'resources'} onOpenChange={(open) => setOpenDropdown(open ? 'resources' : '')}>
            <a href="#workflow" onClick={() => setMobileMenuOpen(false)}>How it works</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
            <button type="button" onClick={() => { setSupportOpen(true); setMobileMenuOpen(false) }}>Contact support</button>
          </NavDropdown>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="landing-login" onClick={onSignIn}>Sign in</button>
          <button type="button" className="landing-primary-action" onClick={onCreateAccount}>Create free account</button>
          <button type="button" className="landing-menu-toggle" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle navigation" aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero landing-showcase-hero">
          <div className="landing-hero-content">
            <div className="landing-badge"><Sparkles size={14} /> All-in-one creator workspace</div>
            <h1 className="landing-headline">Create. Plan.<br />Edit. Post.<br /><em>Grow</em></h1>
            <p className="landing-subhead">
              Bring your content and team together in one bright, practical workspace. Edit photos and videos, schedule across your channels, and follow what resonates.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-primary-action landing-hero-btn" onClick={onCreateAccount}>
                Start your free account <span aria-hidden="true">→</span>
              </button>
              <a href="#tools" className="landing-secondary-action landing-hero-btn"><CirclePlay size={18} /> Explore the workspace</a>
            </div>
            <div className="landing-proof-row" aria-label="Account highlights">
              <span><Check size={15} /> No card required</span>
              <span><Check size={15} /> Free account available</span>
              <span><Check size={15} /> Upgrade anytime</span>
            </div>
            <div className="landing-premium-offer" aria-label="Premium pricing">
              <div><strong>Premium</strong><span>Full EchoAI access</span></div>
              <div><strong>$39</strong><span>per month</span></div>
              <div><strong>$390</strong><span>per year</span></div>
            </div>
          </div>

          <div className="landing-hero-visual" aria-label="EchoAI creative workspace illustration">
            <img className="landing-uploaded-hero-art" src={uploadedHeroArt} alt="EchoAI mascot creating content with social media icons, plants, laptop, coffee, and a planning board" />
          </div>
        </section>

        <nav className="landing-tool-ribbon" aria-label="EchoAI tools">
          {toolRibbon.map(([key, Icon, label, pose]) => (
            <a href="#tools" className={`landing-tool-tile tone-${key}`} key={key}>
              <img src={pose} alt="" />
              <span><Icon size={18} />{label}</span>
            </a>
          ))}
        </nav>

        <section className="landing-product-showcase" id="tools">
          <div className="landing-workspace-preview" aria-label="EchoAI workspace preview">
            <div className="landing-workspace-topbar"><span><i /> Your creative workspace</span><Sparkles size={16} /></div>
            <div className="landing-workspace-body">
              <aside>
                {['Home', 'Media', 'Photo', 'Video', 'Schedule', 'Analytics', 'Team'].map((item, index) => <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>)}
              </aside>
              <div className="landing-workspace-canvas">
                <div className="landing-media-row">
                  <img src={demoPosterImage} alt="Campaign artwork inside EchoAI" />
                  <div className="landing-media-swatch swatch-coral" />
                  <div className="landing-media-swatch swatch-blue" />
                </div>
                  <div className="landing-ai-prompt"><Layers3 size={20} /><div><strong>Campaign workspace</strong><span>Keep your media, edits, and schedule together...</span></div><i aria-hidden="true">→</i></div>
                <div className="landing-editor-row">
                  <div><Image size={24} /><strong>Photo editor</strong><span>Layers · color · type</span></div>
                  <div><Video size={24} /><strong>Video editor</strong><span>Timeline · audio · export</span></div>
                </div>
              </div>
            </div>
          </div>
          <div className="landing-showcase-copy">
            <p className="landing-kicker">Everything you need</p>
            <h2>One place to <em>create</em> and <span>grow.</span></h2>
            <p>Move from source material to finished content without losing time between disconnected apps.</p>
            <div className="landing-showcase-list">
              {showcaseFeatures.map(([Icon, title, description], index) => (
                <div key={title} style={{ '--feature-index': index }}>
                  <span><Icon size={20} /></span><p><strong>{title}</strong><small>{description}</small></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-workflow-story" id="workflow">
          <div className="landing-workflow-intro">
            <p className="landing-kicker">Built around your real workflow</p>
            <h2>From a rough idea to a smarter next move.</h2>
            <p>EchoAI keeps the steps that usually live across separate tools in one practical rhythm: connect, create, queue, learn, repeat.</p>
            <button type="button" className="landing-primary-action" onClick={onCreateAccount}>Create your account <span aria-hidden="true">→</span></button>
          </div>
          <div className="landing-workflow-board" aria-label="EchoAI workflow preview">
            {workflowSteps.map(([Icon, title, description, app], index) => (
              <article className={`landing-workflow-step step-${index + 1}`} key={title}>
                <span className="landing-workflow-number">0{index + 1}</span>
                <div className="landing-workflow-icon"><Icon size={22} /></div>
                <div><small>{app}</small><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
            <div className="landing-workflow-result"><Megaphone size={19} /><span>Campaign ready to move</span><strong>Review, publish, learn</strong></div>
          </div>
        </section>

        <section className="landing-premium-section">
          <div className="landing-premium-copy">
            <p className="landing-kicker">Premium unlocks the work</p>
            <h2>The tools to turn consistency into growth.</h2>
            <p>Keep a Standard account for free. Upgrade when you are ready to create, publish, monitor, and optimize from the same workspace.</p>
            <div className="landing-premium-highlights">
              {premiumHighlights.map(([title, detail]) => <div key={title}><Check size={18} /><p><strong>{title}</strong><span>{detail}</span></p></div>)}
            </div>
          </div>
          <aside className="landing-premium-card">
            <span className="landing-premium-card-label">EchoAI Premium</span>
            <h3>One plan. Full momentum.</h3>
            <div className="landing-premium-price"><strong>$39</strong><span>per month</span></div>
            <div className="landing-premium-price annual"><strong>$390</strong><span>per year · save $78</span></div>
            <button type="button" className="landing-primary-action" onClick={() => onPurchase('premium')}>Buy Premium now <span aria-hidden="true">→</span></button>
            <button type="button" className="landing-secondary-action" onClick={onCreateAccount}>Start with a free account instead</button>
            <small>No card required to start. Upgrade when you are ready.</small>
          </aside>
        </section>

        <section className="landing-color-cta" id="get-started">
          <img src={echoCreator} alt="Echo in creator mode" />
          <div><h2>Let Echo do the heavy lifting.</h2><p>More creativity. Less busy work. Get your campaign ready, then enjoy the rest of your day.</p></div>
          <button type="button" className="landing-color-cta-button" onClick={onCreateAccount}>Start creating free <span>→</span></button>
        </section>

        <section className="landing-platform-section">
          <div className="landing-centered-heading"><p>Publish with confidence</p><h2>Meet your audience across their favorite platforms.</h2><span>Six live publishing integrations with five more clearly tracked on the roadmap.</span></div>
          <div className="landing-platform-strip">
            {SOCIAL_PLATFORMS.map((platform) => (
              <div key={platform.key} className={platform.releaseStatus === 'available' ? 'is-live' : 'is-planned'} style={{ '--platform-color': platform.color, '--platform-bg': platform.bg }}>
                <span>{platform.icon}</span><strong>{platform.label}</strong><small>{platform.releaseStatus === 'available' ? 'Available' : 'Planned'}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-audiences">
          <div className="landing-centered-heading"><p>Built to flex with you</p><h2>For creators, businesses, and teams.</h2><span>Start with a permanent free account, then unlock paid tools as your workflow grows.</span></div>
          <div className="landing-audience-grid">
            {audiences.map(([Icon, title, benefits, tone]) => (
              <article className={`landing-audience-card tone-${tone}`} key={title}>
                <Icon size={30} /><h3>{title}</h3>
                <ul>{benefits.map((benefit) => <li key={benefit}><Check size={15} /> {benefit}</li>)}</ul>
              </article>
            ))}
          </div>
          <div className="landing-trust-row">
            <div><strong>Free</strong><span>Permanent account access</span></div>
            <div><strong>11</strong><span>Social destinations</span></div>
            <div><strong>2</strong><span>Flexible token balances</span></div>
            <div><strong>1</strong><span>Connected workspace</span></div>
          </div>
        </section>

        <section className="landing-closing-cta">
          <div>
            <p>Ready to bring your ideas to life?</p>
            <h2>Create, share, grow. Happier.</h2>
            <span>Your account stays with you, even when your subscription changes.</span>
            <div className="landing-hero-actions">
              <button type="button" className="landing-primary-action" onClick={onCreateAccount}>Create free account <span>→</span></button>
              <a href="#tools" className="landing-secondary-action"><CirclePlay size={17} /> Explore tools</a>
            </div>
            <div className="landing-closing-proof"><span><Check size={14} /> No card required</span><span><Check size={14} /> Free account available</span><span><Check size={14} /> Upgrade anytime</span></div>
          </div>
          <img src={echoModern} alt="Echo celebrating a finished campaign" />
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

      </main>

      <footer className="landing-footer">
        <a href="#top"><Brand /></a>
        <span>Editing, publishing, analytics, and collaboration in one workspace.</span>
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
      <PrivacyChoices />
    </div>
  )
}
