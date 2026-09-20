import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// A stale index.html or cached chunk manifest can point at asset hashes from a
// previous deploy. Force a single reload so the browser fetches the current
// bundle set instead of white-screening on a mismatched module graph.
const RELOAD_FLAG = 'echoai:chunk-reload'
const STALE_BUNDLE_PATTERNS = [
  '__BUNDLED_DEV__',
  'Failed to fetch dynamically imported module',
  'Loading chunk',
  'Unexpected token',
  'vite:preloadError',
]

const performReload = () => {
  if (sessionStorage.getItem(RELOAD_FLAG)) return
  sessionStorage.setItem(RELOAD_FLAG, '1')
  window.location.reload()
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  performReload()
})

window.addEventListener('error', (event) => {
  const message = event?.error?.message || event?.message || ''
  if (STALE_BUNDLE_PATTERNS.some((pattern) => message.includes(pattern))) {
    event.preventDefault()
    performReload()
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const message = String(event?.reason ?? '')
  if (STALE_BUNDLE_PATTERNS.some((pattern) => message.includes(pattern))) {
    event.preventDefault()
    performReload()
  }
})

window.addEventListener('load', () => {
  sessionStorage.removeItem(RELOAD_FLAG)
})

class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('EchoAI render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ maxWidth: 720, margin: '4rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1>EchoAI could not load this workspace</h1>
          <p>Refresh the page once. If the problem continues, send Support the error below.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload workspace</button>
          <details style={{ marginTop: '1rem' }}>
            <summary>Technical details</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          </details>
        </main>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
