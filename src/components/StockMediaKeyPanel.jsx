import { useEffect, useState } from 'react'
import { authService } from '../services/authService'
import { isSupabaseConfigured } from '../lib/supabase'

const formatWhen = (value) => (value ? new Date(value).toLocaleString() : '')

// Write-only: the key is sent once to the server and never returned to the browser.
export function StockMediaKeyPanel() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [keyInput, setKeyInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(isSupabaseConfigured ? '' : 'Connect Supabase to manage integration keys.')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    authService.adminUserAction({ action: 'get-stock-media-config' })
      .then((data) => setConfig(data.config))
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false))
  }, [])

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const data = await authService.adminUserAction({ action: 'update-stock-media-key', apiKey: keyInput.trim() })
      setConfig(data.config)
      setKeyInput('')
      setEditing(false)
      setNotice('Key verified with Pixabay and saved. Stock videos are live in the Video Editor.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Remove the Pixabay key saved here? Stock videos will fall back to the server secret if one is set, otherwise they turn off.')) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const data = await authService.adminUserAction({ action: 'clear-stock-media-key' })
      setConfig(data.config)
      setNotice('Saved key removed.')
    } catch (removeError) {
      setError(removeError.message)
    } finally {
      setSaving(false)
    }
  }

  const active = config?.savedInApp || config?.serverSecretSet
  const showForm = config?.canEdit && (editing || !config?.savedInApp)

  return (
    <div className="stock-key-panel">
      <div className="it-row">
        <div>
          <p style={{ fontWeight: 600 }}>Pixabay — stock &amp; transition videos</p>
          <p className="muted">Powers Video Editor → Stock library → Transitions &amp; stock video. Sound effects need no key.</p>
        </div>
        {!loading && config && (
          <span className={`stock-key-badge ${active ? 'on' : 'off'}`}>{active ? 'Connected' : 'Not connected'}</span>
        )}
      </div>

      {loading && <p className="muted">Checking…</p>}

      {config && (
        <ul className="stock-key-status">
          {config.savedInApp && (
            <li>Key ending in <strong>••••{config.keyHint}</strong> saved here{config.updatedBy ? ` by ${config.updatedBy}` : ''}{config.updatedAt ? ` on ${formatWhen(config.updatedAt)}` : ''}. This key is used.</li>
          )}
          {config.serverSecretSet && (
            <li>{config.savedInApp ? 'A backup key is also set as the PIXABAY_API_KEY server secret.' : 'Using the PIXABAY_API_KEY server secret.'}</li>
          )}
          {!active && <li>No key yet. Get a free one at <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer">pixabay.com/api/docs</a> (sign in, then copy the key shown under “Parameters”).</li>}
        </ul>
      )}

      {showForm && (
        <form className="stock-key-form" onSubmit={save}>
          <label htmlFor="pixabay-key">{config.savedInApp ? 'New Pixabay API key' : 'Pixabay API key'}</label>
          <div>
            <input
              id="pixabay-key"
              type="password"
              autoComplete="off"
              spellCheck="false"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="Paste your key"
            />
            <button type="submit" className="primary-button" disabled={saving || keyInput.trim().length < 16}>{saving ? 'Verifying…' : 'Verify & save'}</button>
            {editing && <button type="button" className="ghost-button" onClick={() => { setEditing(false); setKeyInput('') }}>Cancel</button>}
          </div>
          <small className="muted">The key is checked with Pixabay, stored encrypted on the server, and never shown again.</small>
        </form>
      )}

      {config?.canEdit && config.savedInApp && !editing && (
        <div className="stock-key-actions">
          <button type="button" className="ghost-button" onClick={() => setEditing(true)} disabled={saving}>Replace key</button>
          <button type="button" className="ghost-button" onClick={remove} disabled={saving}>Remove</button>
        </div>
      )}
      {config && !config.canEdit && <p className="muted">Ask a Super Admin or IT to change this key.</p>}
      {error && <span className="field-error">{error}</span>}
      {notice && <p className="stock-key-notice">{notice}</p>}
    </div>
  )
}
