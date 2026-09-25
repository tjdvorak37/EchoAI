import echoMascot from '../assets/echo-mascot.svg'
import './PrivacyPolicy.css'

const POLICY_UPDATED = 'September 25, 2026'

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
          <h2>4. Google and YouTube user data</h2>
          <h3>Data we access</h3>
          <p>When you voluntarily connect a Google or YouTube account, EchoAI may receive basic Google account information needed for authentication, including an account identifier and email address. For YouTube publishing, EchoAI requests the <code>youtube.upload</code> permission, which allows EchoAI to upload video content you select to your connected YouTube account.</p>
          <p>EchoAI does not request access to read, edit, or delete your existing YouTube videos, ratings, comments, or captions.</p>
          <h3>How we use Google user data</h3>
          <p>Google and YouTube user data is used only to provide user-facing features you request. For YouTube, this means connecting your account and publishing a video only when you explicitly select it and direct EchoAI to upload it. EchoAI does not automatically publish videos.</p>
          <h3>Sharing and transfer of Google user data</h3>
          <p>EchoAI does not sell Google user data or use it for advertising. We do not transfer Google user data to third parties except as necessary to provide or secure EchoAI&apos;s user-facing services, when you direct us to do so, or when required by law. Service providers process this data only as needed to operate and secure the service.</p>
          <p>EchoAI does not allow Google user data to be used by third parties for advertising, data brokerage, or unrelated purposes.</p>
          <h3>Data protection, retention, and deletion</h3>
          <p>Google OAuth access and refresh credentials are handled server-side and are not exposed to your browser. EchoAI uses encrypted connections, access controls, and server-side authorization to protect credentials and Google user data.</p>
          <p>We retain Google account connection information and authorization credentials only as long as needed to provide the connected service or meet legitimate legal and security requirements. You may disconnect your Google or YouTube account from EchoAI, revoke EchoAI&apos;s access through your Google Account settings, or request deletion of your EchoAI account and associated personal information through support, subject to limited retention required for legal, security, fraud-prevention, or accounting purposes.</p>
          <p>Content successfully published to YouTube is stored and controlled by YouTube under your YouTube account settings and Google&apos;s policies. Disconnecting or deleting an EchoAI account does not automatically delete content previously published to YouTube.</p>
          <h3>Google API Services User Data Policy</h3>
          <p>EchoAI&apos;s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Google user data is used only to provide or improve user-facing features you request and is not used to train generalized artificial intelligence or machine-learning models.</p>
        </section>

        <section>
          <h2>5. Sharing and service providers</h2>
          <p>We do not sell personal information. We may share information with service providers that process it on our behalf, such as hosting and database providers, payment processors, authentication providers, cloud storage providers, AI or media-processing providers you choose to use, social networks you connect, and support or monitoring providers.</p>
          <p>We may also disclose information when required by law, to protect rights and safety, to investigate fraud or security issues, or as part of a merger, acquisition, financing, or sale of assets.</p>
        </section>

        <section>
          <h2>6. Data retention and security</h2>
          <p>We retain information for as long as needed to provide the service, meet legal and accounting obligations, resolve disputes, and enforce agreements. You may request deletion of your account and personal information, subject to information we must retain by law or for legitimate security purposes.</p>
          <p>We use access controls, row-level authorization, encrypted connections, and server-side handling for sensitive credentials. No method of storage or transmission is completely secure, so please protect your password and do not submit secrets in support requests.</p>
        </section>

        <section>
          <h2>7. Your choices and rights</h2>
          <p>Depending on where you live, you may have rights to access, correct, export, delete, or restrict processing of your personal information, and to object to or withdraw consent for certain processing. You may manage connected-account permissions through the provider and contact us to exercise applicable rights.</p>
        </section>

        <section>
          <h2>8. Children</h2>
          <p>EchoAI is intended for business and general audiences and is not directed to children under 13. We do not knowingly collect personal information from children under 13.</p>
        </section>

        <section>
          <h2>9. Changes to this policy</h2>
          <p>We may update this policy as EchoAI changes. We will post the updated version here and revise the date above. Your continued use of EchoAI after an update means the revised policy applies to your use of the service.</p>
        </section>

        <section>
          <h2>10. Contact us</h2>
          <p>For privacy questions or requests, contact EchoAI through the <a href="/?support=privacy">support form</a> on our landing page. Do not include passwords, access tokens, API keys, or other secrets in your message.</p>
        </section>
      </article>
    </main>
  )
}
