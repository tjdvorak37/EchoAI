export function LandingPage({ onSignIn, onPurchase }) {
  const features = [
    {
      icon: '🎧',
      title: 'Social Listening Intelligence',
      desc: 'Track mentions, competitors, hashtags, and trend shifts across social, news, blogs, reviews, forums, and broader web sources.',
    },
    {
      icon: '🚨',
      title: 'Crisis + Reputation Alerts',
      desc: 'Surface negative spikes, high-risk conversations, and priority incidents in real time before they turn into brand damage.',
    },
    {
      icon: '📅',
      title: 'Smart Scheduler',
      desc: 'Queue posts to Instagram, TikTok, Facebook & Snapchat. Set exact times, bulk load campaigns, and never miss a drop.',
    },
    {
      icon: '🤖',
      title: 'AI Content Studio',
      desc: 'Generate captions, hooks, CTAs, and full post copy in seconds. Feed it a product idea and watch it write your content.',
    },
    {
      icon: '🖼️',
      title: 'Photo Creator',
      desc: 'Build immersive post images with presets, AI prompts, layer editing, and one-click PNG export.',
    },
    {
      icon: '🎬',
      title: 'Video Editor',
      desc: 'Timeline-based editor with multiple video and audio tracks, transitions, effects, filters, and text overlays.',
    },
    {
      icon: '🔁',
      title: 'Repost Hub',
      desc: 'Broadcast company posts to your whole team. Approve, customize, and queue reposts with one click.',
    },
    {
      icon: '🖥️',
      title: 'Media Workspace',
      desc: '2 GB of cloud storage for your video clips, images, and documents. Organize in folders and drag to editor.',
    },
    {
      icon: '🔌',
      title: 'Integrations',
      desc: 'Connect CRMs, analytics tools, webhooks, and image generation APIs to fully automate your content pipeline.',
    },
    {
      icon: '🧠',
      title: 'Personal AI Agent Sync',
      desc: 'Bring your own AI endpoint and route message, image, and video workflows through your preferred model stack.',
    },
  ]

  const screenshots = [
    { label: 'Dashboard — real-time campaign overview', bg: '#0f172a', icon: '📊' },
    { label: 'Social Listening — sentiment, trend, and crisis visibility', bg: '#112534', icon: '🎧' },
    { label: 'Photo Creator — AI-generated visual compositions', bg: '#111827', icon: '🖼️' },
    { label: 'Video Studio — Filmora-style timeline editor', bg: '#1a1a2e', icon: '🎬' },
    { label: 'Scheduler — multi-channel calendar', bg: '#0f2027', icon: '📅' },
    { label: 'AI Assistant — caption & content generation', bg: '#1a0a2e', icon: '✨' },
  ]

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <span className="brand landing-brand">EchoAI</span>
        <div className="landing-nav-actions">
          <button type="button" className="ghost-button" onClick={onSignIn}>
            Sign in
          </button>
          <button type="button" className="primary-button landing-cta-btn" onClick={onPurchase}>
            Get started
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-badge">All-in-one social media intelligence platform</div>
          <h1 className="landing-headline">
            Publish faster, monitor smarter.<br />
            <span className="landing-headline-accent">Create, listen, and respond from one command center.</span>
          </h1>
          <p className="landing-subhead">
            EchoAI now combines AI content generation, immersive photo/video editing,
            multi-channel scheduling, and advanced social listening intelligence. Track
            sentiment, share of voice, influencer signals, and crisis trends while your team
            ships content at speed.
          </p>
          <div className="landing-hero-actions">
            <button
              type="button"
              className="primary-button landing-hero-btn"
              onClick={onPurchase}
            >
              Start for $15 / month
            </button>
            <button
              type="button"
              className="ghost-button landing-hero-btn"
              onClick={onSignIn}
            >
              Sign in to existing account
            </button>
          </div>
          <p className="landing-fine-print">No contracts. Cancel anytime. Includes listening intelligence and bring-your-own AI agent support.</p>
        </div>

        <div className="landing-hero-visual">
          <div className="landing-app-mockup">
            <div className="mockup-topbar">
              <span className="mockup-dot red" />
              <span className="mockup-dot yellow" />
              <span className="mockup-dot green" />
              <span className="mockup-title">EchoAI Dashboard</span>
            </div>
            <div className="mockup-body">
              <div className="mockup-stat-row">
                {[
                  { label: 'Engagement', val: '+18.4%' },
                  { label: 'Queued posts', val: '12' },
                  { label: 'Channels', val: '4' },
                  { label: 'Delivery', val: '99.2%' },
                ].map((s) => (
                  <div key={s.label} className="mockup-stat">
                    <span className="mockup-stat-val">{s.val}</span>
                    <span className="mockup-stat-label">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="mockup-timeline">
                {['Instagram', 'TikTok', 'Facebook'].map((p) => (
                  <div key={p} className="mockup-track">
                    <span className="mockup-track-label">{p}</span>
                    <div className="mockup-clips">
                      <span className="mockup-clip clip-a" />
                      <span className="mockup-clip clip-b" />
                      <span className="mockup-clip clip-c" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-features">
        <h2>Everything you need to dominate social media</h2>
        <p className="landing-section-sub">
          One subscription. All tools. No extra fees.
        </p>
        <div className="landing-features-grid">
          {features.map((feature) => (
            <div key={feature.title} className="landing-feature-card">
              <span className="feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-screenshots">
        <h2>See it in action</h2>
        <p className="landing-section-sub">A professional-grade tool that actually fits your workflow.</p>
        <div className="landing-screenshots-grid">
          {screenshots.map((shot) => (
            <div key={shot.label} className="landing-screenshot-card" style={{ background: shot.bg }}>
              <span className="screenshot-icon">{shot.icon}</span>
              <p>{shot.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-pricing">
        <h2>Simple, transparent pricing</h2>
        <p className="landing-section-sub">
          Both plans include every feature, Social Listening intelligence, and 2 GB of workspace storage.
        </p>
        <div className="landing-pricing-grid">
          <div className="pricing-card">
            <div className="pricing-badge">Flexible</div>
            <h3>Monthly</h3>
            <div className="pricing-amount">
              <span className="pricing-currency">$</span>
              <span className="pricing-number">15</span>
              <span className="pricing-period">/ month</span>
            </div>
            <ul className="pricing-features">
              <li>✓ All platform features</li>
              <li>✓ 2 GB workspace storage</li>
              <li>✓ Video Studio + AI editor</li>
              <li>✓ Multi-channel scheduling</li>
              <li>✓ Repost Hub</li>
              <li>✓ AI content generation</li>
              <li>✓ Social Listening + crisis alerts</li>
              <li>✓ Share-of-voice and sentiment insights</li>
              <li>✓ Personal AI agent endpoint sync</li>
              <li>✓ Team collaboration</li>
              <li>✓ Email support</li>
            </ul>
            <button type="button" className="ghost-button pricing-btn" onClick={onPurchase}>
              Get monthly access
            </button>
          </div>

          <div className="pricing-card pricing-card-featured">
            <div className="pricing-badge pricing-badge-featured">Best value — save $60</div>
            <h3>Annual</h3>
            <div className="pricing-amount">
              <span className="pricing-currency">$</span>
              <span className="pricing-number">120</span>
              <span className="pricing-period">/ year</span>
            </div>
            <p className="pricing-equiv">Just $10 / month</p>
            <ul className="pricing-features">
              <li>✓ Everything in Monthly</li>
              <li>✓ 33% discount</li>
              <li>✓ Priority support</li>
              <li>✓ Early access to new features</li>
              <li>✓ Earlier access to new listening connectors</li>
            </ul>
            <button type="button" className="primary-button pricing-btn" onClick={onPurchase}>
              Get annual access
            </button>
          </div>
        </div>
        <p className="pricing-note">
          Payments are processed via Venmo. After checkout you will receive a confirmation
          and your account will be activated within 24 hours.
        </p>
      </section>

      <footer className="landing-footer">
        <span className="brand">EchoAI</span>
        <span>© 2026 EchoAI. All rights reserved.</span>
        <button type="button" className="text-button" onClick={onSignIn}>Sign in</button>
      </footer>
    </div>
  )
}
