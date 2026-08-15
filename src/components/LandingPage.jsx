import demoPosterImage from '../assets/demo-poster.svg'
import echoMascot from '../assets/echo-mascot.svg'
import { PLAN_ORDER, PLANS, getAnnualSavings } from '../data/plans'
import './LandingPage.css'

const workflow = [
  ['01', 'Bring the source material', 'Add PowerPoint, Word, Excel, PDF, images, video, or a written brief.', 'blue'],
  ['02', 'Choose what to make', 'Ask for a flyer, social image, video plan, or a complete post package.', 'coral'],
  ['03', 'Refine every detail', 'Edit layers, heal image pixels, trim footage, adjust copy, and stay on brand.', 'yellow'],
  ['04', 'Schedule and learn', 'Publish across channels and turn audience signals into the next brief.', 'green'],
]

const capabilities = [
  ['Create', 'One brief, every format', 'Transform mixed documents into campaign copy, editable images, flyers, and video storyboards.', '#ff6b5e'],
  ['Edit', 'Real media tools', 'Clean image pixels, crop, recolor, build layers, trim clips, add transitions, and export.', '#2364d8'],
  ['Publish', 'A calmer content calendar', 'Prepare channel-specific posts, schedule campaigns, and keep approvals moving.', '#11866f'],
  ['Listen', 'Know what happens next', 'Track sentiment, competitors, trends, influencers, and reputation risk.', '#d58b00'],
]

const Brand = () => (
  <span className="landing-brand-lockup">
    <img src={echoMascot} alt="" />
    <span>EchoAI</span>
  </span>
)

export function LandingPage({ onSignIn, onPurchase, onEmployeeAccess, onAdminAccess }) {
  return (
    <div className="landing-page" id="top">
      <header className="landing-nav">
        <a href="#top" aria-label="EchoAI home"><Brand /></a>
        <nav className="landing-nav-links" aria-label="Landing page">
          <a href="#workflow">How it works</a>
          <a href="#tools">Tools</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="landing-login" onClick={onSignIn}>Sign in</button>
          <button type="button" className="landing-primary-action" onClick={onPurchase}>Start creating</button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-content">
            <div className="landing-badge"><span /> AI content workspace for growing teams</div>
            <h1 className="landing-headline">EchoAI turns your source files into ready-to-publish content.</h1>
            <p className="landing-subhead">
              Bring the deck, spreadsheet, notes, photos, and clips. EchoAI finds the story,
              builds the creative, and keeps every post editable from brief to publish.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-primary-action landing-hero-btn" onClick={onPurchase}>
                Create your first project <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="landing-secondary-action landing-hero-btn" onClick={onSignIn}>
                Open your workspace
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
            <strong>AI Content Studio</strong>
            <strong>Photo + video editors</strong>
            <strong>Scheduler</strong>
            <strong>Social listening</strong>
          </div>
          <p className="landing-pricing-note">Annual billing saves 15%. Secure checkout powered by Stripe. Cancel anytime.</p>
        </section>
      </main>

      <section className="landing-admin-cta" aria-label="Employee login and admin center">
        <div className="landing-admin-copy">
          <p>Internal access</p>
          <h2>Employee login &amp; admin center</h2>
          <span>Built for staff, managers, and super admins to bypass the public subscription flow and manage company access without going through customer checkout.</span>
        </div>
        <div className="landing-admin-actions">
          <button type="button" className="landing-secondary-action" onClick={onEmployeeAccess}>Employee login</button>
          <button type="button" className="landing-primary-action" onClick={onAdminAccess}>Admin center</button>
        </div>
      </section>

      <footer className="landing-footer">
        <a href="#top"><Brand /></a>
        <span>AI content creation, editing, publishing, and listening in one workspace.</span>
        <button type="button" className="landing-login" onClick={onSignIn}>Sign in</button>
      </footer>
    </div>
  )
}
