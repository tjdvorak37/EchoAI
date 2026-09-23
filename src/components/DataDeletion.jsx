import echoMascot from '../assets/echo-mascot.svg'
import './PrivacyPolicy.css'

const INSTRUCTIONS_UPDATED = 'September 21, 2026'

export function DataDeletion() {
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
        <div className="privacy-eyebrow">Account support</div>
        <h1>Data Deletion Instructions</h1>
        <p className="privacy-updated">Last updated: {INSTRUCTIONS_UPDATED}</p>
        <p className="privacy-lede">
          You can request deletion of your EchoAI account and personal information at any time.
        </p>

        <section>
          <h2>Request deletion</h2>
          <p>Submit a request through the <a href="/?support=privacy">EchoAI support form</a> and choose the privacy or account-deletion subject. Include the email address associated with your EchoAI account and identify the connected Facebook or Instagram account you want removed. Do not include passwords, access tokens, API keys, or other secrets.</p>
        </section>

        <section>
          <h2>What happens next</h2>
          <p>We will verify the request, disconnect authorized social accounts, delete or anonymize account data and workspace content where applicable, and confirm completion. Some information may be retained when required by law, for accounting, fraud prevention, security, or to resolve disputes.</p>
          <p>Revoking EchoAI&apos;s access in Facebook or Instagram will stop future access through that provider. To revoke access immediately, use the connected-app settings in your Meta account as well as submitting the EchoAI request.</p>
        </section>

        <section>
          <h2>Privacy information</h2>
          <p>For more information about collection, use, retention, and rights, read the <a href="/privacy-policy">EchoAI Privacy Policy</a>.</p>
        </section>
      </article>
    </main>
  )
}