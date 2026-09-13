import { useDeferredValue, useMemo, useState } from 'react'
import { HELP_ARTICLES, HELP_CATEGORIES } from '../data/helpArticles'
import './HelpCenter.css'

const COMMON_QUESTIONS = [
  ['How do I connect an AI tool?', 'multiple AI tools'],
  ['How do I use the In-house AI Lab?', 'in-house AI lab'],
  ['How do I use my brand kit?', 'brand kit'],
  ['How do I schedule a post?', 'schedule a post'],
  ['How do I sync Google Calendar?', 'Google Calendar sync'],
  ['How do I link cloud files?', 'link cloud files'],
]

const searchableText = (article) => [
  article.title,
  article.summary,
  article.category,
  ...(article.keywords ?? []),
  ...(article.steps ?? []),
  ...(article.notes ?? []),
  article.example ?? '',
].join(' ').toLowerCase()

export function HelpCenter({ onContactSupport }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All topics')
  const [expandedId, setExpandedId] = useState('start-workspace')
  const deferredQuery = useDeferredValue(query)

  const articles = useMemo(() => {
    const terms = deferredQuery.toLowerCase().trim().split(/\s+/).filter(Boolean)
    return HELP_ARTICLES.filter((article) => {
      if (category !== 'All topics' && article.category !== category) return false
      if (!terms.length) return true
      const text = searchableText(article)
      return terms.every((term) => text.includes(term))
    })
  }, [category, deferredQuery])

  const chooseQuestion = (value) => {
    setQuery(value)
    setCategory('All topics')
  }

  return (
    <section className="help-center">
      <header className="help-hero">
        <div>
          <p className="small-title">EchoAI Help Center</p>
          <h2>How can we help?</h2>
          <p>Search every feature, follow complete instructions, or browse by workflow.</p>
        </div>
        <div className="help-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask a question, such as “How do I clean up a photo?”"
            aria-label="Search EchoAI help"
          />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear help search">Clear</button>}
        </div>
        <div className="help-common-questions">
          {COMMON_QUESTIONS.map(([label, value]) => (
            <button type="button" key={label} onClick={() => chooseQuestion(value)}>{label}</button>
          ))}
        </div>
      </header>

      <div className="help-layout">
        <aside className="help-categories" aria-label="Help categories">
          {['All topics', ...HELP_CATEGORIES].map((item) => {
            const count = item === 'All topics'
              ? HELP_ARTICLES.length
              : HELP_ARTICLES.filter((article) => article.category === item).length
            return (
              <button
                type="button"
                key={item}
                className={category === item ? 'active' : ''}
                onClick={() => setCategory(item)}
              >
                <span>{item}</span><small>{count}</small>
              </button>
            )
          })}
        </aside>

        <div className="help-results">
          <div className="help-results-heading">
            <div>
              <p className="section-label">{category}</p>
              <h3>{articles.length} {articles.length === 1 ? 'guide' : 'guides'}</h3>
            </div>
            {deferredQuery && <span>Results for “{deferredQuery}”</span>}
          </div>

          {articles.length === 0 && (
            <div className="help-empty">
              <h3>No exact answer found</h3>
              <p>Try fewer words, browse a category, or send the question to support.</p>
              <button type="button" className="primary-button" onClick={onContactSupport}>Contact support</button>
            </div>
          )}

          <div className="help-article-list">
            {articles.map((article) => {
              const expanded = expandedId === article.id
              return (
                <article className={`help-article ${expanded ? 'expanded' : ''}`} key={article.id}>
                  <button
                    type="button"
                    className="help-article-toggle"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? '' : article.id)}
                  >
                    <span>
                      <small>{article.category}</small>
                      <strong>{article.title}</strong>
                      <em>{article.summary}</em>
                    </span>
                    <i aria-hidden="true">{expanded ? '−' : '+'}</i>
                  </button>
                  {expanded && (
                    <div className="help-article-body">
                      <ol>
                        {article.steps.map((step) => <li key={step}>{step}</li>)}
                      </ol>
                      {article.example && (
                        <div className="help-example"><strong>Example</strong><p>{article.example}</p></div>
                      )}
                      {article.notes?.length > 0 && (
                        <div className="help-notes">
                          <strong>Good to know</strong>
                          {article.notes.map((note) => <p key={note}>{note}</p>)}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          <footer className="help-support-footer">
            <div><strong>Still need help?</strong><span>Send the support team a detailed question from inside EchoAI.</span></div>
            <button type="button" className="primary-button" onClick={onContactSupport}>Contact support</button>
          </footer>
        </div>
      </div>
    </section>
  )
}