import echoMascot from '../assets/echo-mascot.svg'
import './PrivacyPolicy.css'

const POLICY_UPDATED = 'August 17, 2026'

export function PrivacyPolicy() {
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
        <h1>Privacy Policy</h1>
        <p className="privacy-updated">Last updated: {POLICY_UPDATED}</p>
        <p className="privacy-lede">
          EchoAI helps teams turn source material into editable creative, scheduled posts, and audience insights.
          This Privacy Policy explains what information we collect, how we use it, and the choices available to you.
        </p>

        <section>
          <h2>1. Information we collect</h2>
          <h3>Account information</h3>
          <p>When you create or use an EchoAI account, we may collect your name, email address, company details, authentication information, access status, and subscription or billing status.</p>
          <h3>Workspace content</h3>
          <p>We process files, images, videos, documents, briefs, brand assets, prompts, generated content, scheduled posts, and other content you choose to store or process in your workspace.</p>
          <h3>Connected services</h3>
          <p>If you connect a social or cloud service, we receive the account identifiers, profile details, permissions, and tokens needed to provide the requested integration. For Facebook Pages and Instagram Professional accounts, this can include the connected Page, Instagram account, publishing permissions, and provider-issued access tokens.</p>
          <h3>Support and usage information</h3>
          <p>We collect information you provide to support, including your name, email, issue details, and attachments. We may also receive basic technical information such as browser, device, IP address, timestamps, and feature activity needed for security, troubleshooting, and service operation.</p>
        </section>

        <section>
          <h2>2. How we use information</h2>
          <p>We use information to:</p>
          <ul>
            <li>provide, maintain, secure, and improve EchoAI;</li>
            <li>authenticate accounts and enforce access, storage, and subscription limits;</li>
            <li>store, transform, generate, edit, schedule, and publish content at your direction;</li>
            <li>connect to services you authorize, including Facebook, Instagram, YouTube, Google Drive, and Microsoft services;</li>
            <li>respond to support requests and communicate about the service;</li>
            <li>detect abuse, fraud, unauthorized access, and security incidents; and</li>
            <li>process payments and manage subscriptions through our payment provider.</li>
          </ul>
        </section>

        <section>
          <h2>3. Social integrations</h2>
          <p>EchoAI only accesses a social account after you start an authorization flow and approve the requested permissions. Facebook and Instagram connections use Meta OAuth and are limited to the pages or Instagram Professional accounts made available by your Meta account.</p>
          <p>OAuth credentials are stored on the server and are not exposed to the browser. EchoAI uses them to perform actions you request, such as publishing an approved scheduled post. You can disconnect an account or revoke access through the applicable provider. A provider may continue to retain information according to its own privacy policy.</p>
        </section>

        <section>
          <h2>4. Sharing and service providers</h2>
          <p>We do not sell personal information. We may share information with service providers that process it on our behalf, such as hosting and database providers, payment processors, authentication providers, cloud storage providers, AI or media-processing providers you choose to use, social networks you connect, and support or monitoring providers.</p>
          <p>We may also disclose information when required by law, to protect rights and safety, to investigate fraud or security issues, or as part of a merger, acquisition, financing, or sale of assets.</p>
        </section>

        <section>
          <h2>5. Data retention and security</h2>
          <p>We retain information for as long as needed to provide the service, meet legal and accounting obligations, resolve disputes, and enforce agreements. You may request deletion of your account and personal information, subject to information we must retain by law or for legitimate security purposes.</p>
          <p>We use access controls, row-level authorization, encrypted connections, and server-side handling for sensitive credentials. No method of storage or transmission is completely secure, so please protect your password and do not submit secrets in support requests.</p>
        </section>

        <section>
          <h2>6. Your choices and rights</h2>
          <p>Depending on where you live, you may have rights to access, correct, export, delete, or restrict processing of your personal information, and to object to or withdraw consent for certain processing. You may manage connected-account permissions through the provider and contact us to exercise applicable rights.</p>
        </section>

        <section>
          <h2>7. Children</h2>
          <p>EchoAI is intended for business and general audiences and is not directed to children under 13. We do not knowingly collect personal information from children under 13.</p>
        </section>

        <section>
          <h2>8. Changes to this policy</h2>
          <p>We may update this policy as EchoAI changes. We will post the updated version here and revise the date above. Your continued use of EchoAI after an update means the revised policy applies to your use of the service.</p>
        </section>

        <section>
          <h2>9. Contact us</h2>
          <p>For privacy questions or requests, contact EchoAI through the <a href="/?support=privacy">support form</a> on our landing page. Do not include passwords, access tokens, API keys, or other secrets in your message.</p>
        </section>
      </article>
    </main>
  )
}
