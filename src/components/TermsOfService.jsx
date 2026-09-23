import echoMascot from '../assets/echo-mascot.svg'
import './PrivacyPolicy.css'

const TERMS_UPDATED = 'September 23, 2026'

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
          These Terms of Service ("Terms") govern your access to and use of EchoAI, including our website, applications,
          and related services (the "Service"). By creating an account or using the Service, you agree to these Terms.
        </p>

        <section>
          <h2>1. Your account</h2>
          <p>You must provide accurate information when creating an account and keep your login credentials confidential. You are responsible for activity that occurs under your account. Notify us right away if you suspect unauthorized use.</p>
        </section>

        <section>
          <h2>2. Acceptable use</h2>
          <p>You agree not to use the Service to: violate any law or third-party right; publish or generate content that is unlawful, infringing, or fraudulent; attempt to gain unauthorized access to accounts, systems, or data; interfere with or disrupt the Service; or use the Service to send spam or abusive content through a connected social or communication channel.</p>
        </section>

        <section>
          <h2>3. Your content</h2>
          <p>You retain ownership of the files, briefs, brand assets, and other content you upload or create in your workspace ("Your Content"). You grant EchoAI a limited license to host, process, transform, and transmit Your Content solely to provide the Service you request, including publishing to social accounts you connect and authorize.</p>
          <p>You are responsible for having the rights necessary to upload, edit, and publish Your Content, including any required licenses for media, fonts, or third-party material.</p>
        </section>

        <section>
          <h2>4. Connected accounts and third-party services</h2>
          <p>Features that connect to third-party services (including Facebook, Instagram, YouTube, X, LinkedIn, Google Drive, and Microsoft services) are subject to that provider's own terms and policies. EchoAI is not responsible for the availability, accuracy, or actions of third-party platforms, including changes to their APIs, review processes, or feature availability.</p>
        </section>

        <section>
          <h2>5. Subscriptions and billing</h2>
          <p>Paid plans are billed in advance on a monthly or annual basis through our payment provider. Fees are non-refundable except where required by law. We may change plan pricing or features going forward with notice; continued use after a change constitutes acceptance of the updated terms for that plan.</p>
          <p>Free accounts are provided on an as-available basis and may have reduced features or limits compared to paid plans.</p>
        </section>

        <section>
          <h2>6. Suspension and termination</h2>
          <p>We may suspend or terminate access to the Service if you violate these Terms, create risk or legal exposure for EchoAI, or if required by law. You may stop using the Service and request account deletion at any time.</p>
        </section>

        <section>
          <h2>7. Disclaimers</h2>
          <p>The Service is provided "as is" and "as available" without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee that AI-generated content, analytics, or scheduled publishing will be error-free or uninterrupted.</p>
        </section>

        <section>
          <h2>8. Limitation of liability</h2>
          <p>To the maximum extent permitted by law, EchoAI will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, data, or goodwill, arising from your use of the Service.</p>
        </section>

        <section>
          <h2>9. Changes to these terms</h2>
          <p>We may update these Terms as EchoAI changes. We will post the updated version here and revise the date above. Continued use of the Service after an update means the revised Terms apply to your use of the Service.</p>
        </section>

        <section>
          <h2>10. Contact us</h2>
          <p>For questions about these Terms, contact EchoAI through the <a href="/?support=privacy">support form</a> on our landing page. See our <a href="/privacy-policy">Privacy Policy</a> for how we handle your information.</p>
        </section>
      </article>
    </main>
  )
}
