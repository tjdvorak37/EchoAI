import { useState } from 'react'
import { HelpCircle, Send, Sparkles, X } from 'lucide-react'
import echoMascot from '../assets/echo-mascot.svg'
import './InPageEchoAssistant.css'

const ECHO_CONTEXT = {
  dashboard: {
    pose: 'modern',
    title: 'Your command center is ready.',
    prompts: ['What should I do first?', 'How do I save time today?'],
    answer: 'Start with Create to turn an idea into a campaign, then use Scheduler to queue the finished work across your connected channels.',
  },
  listening: {
    pose: 'tech',
    title: 'Let’s make sense of the signals.',
    prompts: ['What does sentiment mean?', 'How do I track a competitor?'],
    answer: 'Use tracking terms and sources to focus the listening view, then compare mention volume, sentiment, and share of voice for the signals that matter.',
  },
  repost: {
    pose: 'social',
    title: 'Ready to share the good work?',
    prompts: ['How does approval work?', 'Which channels can I use?'],
    answer: 'Open a company post, customize the caption, choose connected channels, and send it for approval or publish when your permissions allow it.',
  },
  scheduler: {
    pose: 'schedule',
    title: 'Let’s give your week some breathing room.',
    prompts: ['How do I schedule a post?', 'What should I check first?'],
    answer: 'Choose a connected channel, attach your approved media, inspect the preview, and queue the post. You can review the whole queue from one calendar.',
  },
  assistant: {
    pose: 'ai',
    title: 'Bring me a rough idea.',
    prompts: ['Help me write a campaign.', 'What can AI create?'],
    answer: 'Describe the audience, offer, tone, and format you need. EchoAI can turn that brief into copy, visual direction, and an editable campaign starting point.',
  },
  photo: {
    pose: 'photo',
    title: 'Let’s make the image feel intentional.',
    prompts: ['How do I start editing?', 'Can I save this to my workspace?'],
    answer: 'Use layers for non-destructive edits, keep your brand styling consistent, and export or save the finished image back to your workspace.',
  },
  studio: {
    pose: 'video',
    title: 'A clear timeline makes video easier.',
    prompts: ['How do I build a timeline?', 'How do I export?'],
    answer: 'Add clips to the timeline, refine timing and audio, preview the sequence, then export when the story feels right.',
  },
  credits: {
    pose: 'ai',
    title: 'Keep your creative momentum going.',
    prompts: ['What uses tokens?', 'How do rollover tokens work?'],
    answer: 'AI generations use tokens. Monthly allowances refresh with paid access, while purchased rollover tokens are kept separately and used after the monthly balance.',
  },
  integrations: {
    pose: 'social',
    title: 'Let’s connect the places your audience lives.',
    prompts: ['How do I connect a channel?', 'Which platforms are available?'],
    answer: 'Choose a provider, save the account profile, and complete its OAuth approval. EchoAI currently supports six live publishing integrations with more on the roadmap.',
  },
  account: {
    pose: 'modern',
    title: 'Your account should work around you.',
    prompts: ['How do I manage my account?', 'What happens if I cancel?'],
    answer: 'Update your contact details from Manage account. Your EchoAI account remains available even when paid access changes.',
  },
  help: {
    pose: 'modern',
    title: 'I can help you find the next step.',
    prompts: ['Show me a getting-started path.', 'How do I contact support?'],
    answer: 'Search the How To center for a guided article, or contact support when you need a person to look at the details with you.',
  },
}

const DEFAULT_CONTEXT = ECHO_CONTEXT.dashboard

export function InPageEchoAssistant({ activeTab }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const context = ECHO_CONTEXT[activeTab] || DEFAULT_CONTEXT

  const askEcho = (prompt = question) => {
    if (!prompt.trim()) return
    setQuestion(prompt)
    setAnswer(context.answer)
  }

  return (
    <div className={`in-page-echo ${open ? 'is-open' : ''}`}>
      {open && (
        <section className="in-page-echo-panel" role="dialog" aria-label={`Ask Echo about ${activeTab}`}>
          <div className="in-page-echo-header">
            <div><span>Echo assistant · {context.pose}</span><h2>{context.title}</h2></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Echo assistant"><X size={18} /></button>
          </div>
          <div className="in-page-echo-answer">
            <Sparkles size={17} aria-hidden="true" />
            <p>{answer || 'Ask a quick question and I’ll point you toward the next useful step on this page.'}</p>
          </div>
          <div className="in-page-echo-prompts">
            {context.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => askEcho(prompt)}>{prompt}</button>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); askEcho() }} className="in-page-echo-form">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask Echo a question..." aria-label="Ask Echo a question" />
            <button type="submit" aria-label="Ask Echo"><Send size={16} /></button>
          </form>
        </section>
      )}
      <button type="button" className="in-page-echo-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Close Echo assistant' : 'Ask Echo for help'}>
        <img src={echoMascot} alt="" />
        <span><strong>Ask Echo</strong><small>{context.pose} mode</small></span>
        <HelpCircle size={17} aria-hidden="true" />
      </button>
    </div>
  )
}
