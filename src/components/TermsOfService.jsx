import echoMascot from '../assets/echo-mascot.svg'
import './PrivacyPolicy.css'

const TERMS_UPDATED = 'September 21, 2026'

export function TermsOfService() {
  return (
    <main className="privacy-page">
      <header className="privacy-header">
        <a className="privacy-brand" href="/" aria-label="EchoAI home">
          <img src={echoMascot} alt="" />
          <span>EchoAI</span>
        </a>
        <a className="privacy-home-link" href="/">Back to EchoAI</a>
      </header>

      <article className="privacy-document">
        <div className="privacy-eyebrow">Legal</div>
        <h1>Terms of Service</h1>
        <p className="privacy-updated">Last updated: {TERMS_UPDATED}</p>
        <p className="privacy-lede">
          These Terms govern your access to and use of EchoAI, a workspace for creating, managing, and publishing content.
        </p>

        <section>
          <h2>1. Using EchoAI</h2>
          <p>You may use EchoAI only if you can legally enter into these Terms. You are responsible for your account, the accuracy of information you provide, and activity performed through your account.</p>
        </section>

        <section>
          <h2>2. Your content and connected accounts</h2>
          <p>You retain ownership of content you submit or create through EchoAI. You authorize EchoAI to process that content to provide the features you request, including scheduling and publishing to connected services.</p>
          <p>You must have the rights and permissions needed for content you upload and for every Facebook Page, Instagram account, or other service you connect. You can disconnect a service or revoke its authorization through that service.</p>
        </section>

        <section>
          <h2>3. Acceptable use</h2>
          <p>You may not use EchoAI to break the law, infringe another person&apos;s rights, distribute malicious code, abuse connected services, bypass access controls, or interfere with the service or another user&apos;s workspace.</p>
        </section>

        <section>
          <h2>4. Plans, payments, and availability</h2>
          <p>Paid features are subject to the plan and pricing presented at purchase. Taxes, renewals, cancellations, and refunds are handled according to the applicable order or subscription terms. EchoAI may change, suspend, or discontinue features with reasonable notice when practical.</p>
        </section>

        <section>
          <h2>5. Third-party services</h2>
          <p>EchoAI connects to third-party services at your direction. Those services have their own terms, policies, availability, and permission requirements. EchoAI is not responsible for changes or actions taken by a third-party service.</p>
        </section>

        <section>
          <h2>6. Termination</h2>
          <p>You may stop using EchoAI at any time. We may suspend or terminate access if necessary to protect the service, comply with law, address abuse, or enforce these Terms. You may request deletion of your data using the <a href="/data-deletion">data deletion instructions</a>.</p>
        </section>

        <section>
          <h2>7. Disclaimers and liability</h2>
          <p>EchoAI is provided as available. To the extent permitted by law, EchoAI disclaims warranties and will not be liable for indirect, incidental, special, consequential, or lost-profit damages arising from use of the service.</p>
        </section>

        <section>
          <h2>8. Contact</h2>
          <p>Questions about these Terms can be submitted through the <a href="/?support=legal">support form</a>. Our <a href="/privacy-policy">Privacy Policy</a> explains how information is handled.</p>
        </section>
      </article>
    </main>
  )
}