import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// A stale index.html points at asset hashes from a prior deploy. Reload once so
// the browser fetches the current index.html instead of white-screening.
const RELOAD_FLAG = 'echoai:chunk-reload'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (sessionStorage.getItem(RELOAD_FLAG)) return
  sessionStorage.setItem(RELOAD_FLAG, '1')
  window.location.reload()
})

window.addEventListener('load', () => {
  sessionStorage.removeItem(RELOAD_FLAG)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
