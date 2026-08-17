const steps = [
  ['1', 'Open the OpenAI API Platform', <>Go to <strong>platform.openai.com</strong> and sign in. ChatGPT and the OpenAI API use the same account, but API usage and billing are managed separately.</>],
  ['2', 'Open API Keys', <>Choose <strong>API Keys</strong> from the left menu. Select <strong>+ Create new secret key</strong>.</>],
  ['3', 'Create and copy your key', <>For a simple first setup, use <strong>Owned by: You</strong>, name it <code>Content Agent</code>, choose your project, and grant only the permissions your bridge requires. Copy the key immediately; OpenAI shows the complete secret only once.</>],
  ['4', 'Use an EchoAI-compatible bridge', <>EchoAI sends its creative request format to your configured HTTPS bridge. A bridge securely calls OpenAI on your behalf. Do not paste <code>https://api.openai.com/v1</code> directly unless your bridge explicitly accepts EchoAI requests at that URL.</>],
  ['5', 'Return to EchoAI Integrations', <>Open <strong>Integrations → AI tools</strong>, choose <strong>OpenAI / ChatGPT</strong>, give the tool a name, paste your bridge endpoint, paste the API key, and enter the model or route supported by your bridge.</>],
  ['6', 'Test and save', <>Select <strong>Resync</strong> or <strong>Test connection</strong>. When the status shows <strong>Connected</strong>, save the tool. You can add multiple AI tools and choose which one to use for each Create job.</>],
]

const capabilities = [
  'Writing and strategy',
  'Document intelligence',
  'Image generation',
  'Generative image editing',
  'Characters and personas',
  'Video workflows',
  'Audio and voice',
  'Visual understanding',
  'Safety review',
]

export function OpenAiSetupGuide({ open, onClose }) {
  if (!open) return null

  const printGuide = () => window.print()
  const downloadGuide = () => {
    const guideHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Connect OpenAI to EchoAI</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;line-height:1.6;color:#101827}h1{color:#2357d6}h2{margin-top:28px}code{background:#eef4ff;padding:2px 5px;border-radius:4px}</style></head><body>${document.querySelector('.openai-guide-document')?.innerHTML || ''}</body></html>`
    const blob = new Blob([guideHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'echoai-openai-setup-guide.html'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="openai-guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="openai-guide-title" onClick={onClose}>
      <article className="openai-guide-modal" onClick={(event) => event.stopPropagation()}>
        <header className="openai-guide-toolbar">
          <div><p className="section-label">EchoAI setup guide</p><h2 id="openai-guide-title">Connect OpenAI to your AI Content Agent</h2><span>Setup usually takes about 2–5 minutes.</span></div>
          <button type="button" className="text-button openai-guide-close" onClick={onClose} aria-label="Close setup guide">×</button>
        </header>
        <div className="openai-guide-document">
          <p className="openai-guide-intro">Connect your OpenAI account to use AI-powered writing, images, characters, video workflows, audio, and other creative tools.</p>
          <div className="openai-guide-callout"><strong>Important</strong><span>ChatGPT and the OpenAI API use the same OpenAI account, but API usage and billing are managed separately. Never share your secret key or include it in screenshots.</span></div>
          {steps.map(([number, title, content]) => <section className="openai-guide-step" key={number}><span>{number}</span><div><h3>Step {number} — {title}</h3><p>{content}</p></div></section>)}
          <section className="openai-guide-section"><h3>Creative features</h3><div className="openai-capability-list">{capabilities.map((item) => <span key={item}>✓ {item}</span>)}</div></section>
          <section className="openai-guide-section"><h3>Try your first request</h3><p><strong>Writing:</strong> Create a Facebook post advertising a fictional coffee shop called Morning Grind. Make it friendly and include a call to action.</p><p><strong>Image:</strong> Create a professional Instagram advertisement for Morning Grind Coffee featuring a hot latte on a wooden table during sunrise.</p></section>
          <section className="openai-guide-section"><h3>Troubleshooting</h3><ul><li><strong>Invalid API key:</strong> Copy the entire key or create a new one if the original is lost.</li><li><strong>Permission error:</strong> Confirm the bridge, project, and OpenAI organization are the ones you intend to use.</li><li><strong>Requests fail after connecting:</strong> Check OpenAI billing, usage capacity, bridge logs, and model access.</li><li><strong>Provider URL error:</strong> Use an EchoAI-compatible HTTPS bridge, not the ChatGPT website or a dashboard URL.</li></ul></section>
          <section className="openai-guide-security"><h3>Protect your API key</h3><p>API keys can spend money and access your OpenAI account. Keep them private, never commit them to source code, and rotate the key immediately if it may have been exposed.</p></section>
        </div>
        <footer className="openai-guide-actions"><button type="button" className="ghost-button" onClick={downloadGuide}>Download guide</button><button type="button" className="ghost-button" onClick={printGuide}>Print guide</button><button type="button" className="primary-button" onClick={onClose}>Close</button></footer>
      </article>
    </div>
  )
}
