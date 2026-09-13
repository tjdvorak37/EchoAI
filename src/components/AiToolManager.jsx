import { useState } from 'react'

const PROVIDERS = [
  ['openai', 'OpenAI / ChatGPT'],
  ['openart', 'OpenArt'],
  ['anthropic', 'Anthropic / Claude'],
  ['custom_router', 'Custom AI router'],
]

const emptyTool = {
  name: '',
  provider: 'custom_router',
  endpoint: '',
  apiKey: '',
  model: 'default',
  capabilities: ['message', 'image'],
  enabled: true,
}

export function AiToolManager({ connections, userId, onSave, onDelete, onResync }) {
  const [draft, setDraft] = useState(emptyTool)
  const [editingId, setEditingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const edit = (tool) => {
    setEditingId(tool.id)
    setDraft({ ...emptyTool, ...tool, apiKey: '' })
    setMessage('')
    setError('')
  }

  const reset = () => {
    setEditingId('')
    setDraft(emptyTool)
  }

  const save = async (event) => {
    event.preventDefault()
    if (!draft.name.trim() || !draft.endpoint.trim()) {
      setError('Give this tool a name and an HTTPS bridge endpoint.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await onSave({ ...draft, id: editingId || undefined, userId })
      setMessage('AI tool saved securely.')
      reset()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBusy(false)
    }
  }

  const resync = async (tool) => {
    setBusy(true)
    setError('')
    setMessage('Checking provider...')
    try {
      await onResync(tool)
      setMessage(`${tool.name} connection checked.`)
    } catch (syncError) {
      setError(syncError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="sub-panel ai-tool-manager">
      <div className="list-row">
        <div>
          <h3>AI tools</h3>
          <p className="muted">Add as many tools as you use. API keys are stored server-side and never displayed after saving.</p>
        </div>
        <span className="badge info">{connections.length} connected tools</span>
      </div>

      <div className="ai-tool-list">
        {connections.map((tool) => (
          <article className="list-row" key={tool.id}>
            <div>
              <p>{tool.name}</p>
              <span className="muted">{tool.provider} • {tool.model} • {tool.endpoint}</span>
              {tool.lastError && <small className="field-error">{tool.lastError}</small>}
            </div>
            <div className="action-row">
              <span className={`badge ${tool.status === 'connected' ? 'success' : tool.status === 'error' ? 'risk' : 'pending'}`}>
                {tool.status === 'connected' ? 'Connected' : tool.status === 'error' ? 'Error' : 'Not connected'}
              </span>
              <button type="button" className="ghost-button" disabled={busy} onClick={() => resync(tool)}>Resync</button>
              <button type="button" className="text-button" onClick={() => edit(tool)}>Edit</button>
              <button type="button" className="text-button" onClick={() => onDelete(tool.id)}>Remove</button>
            </div>
          </article>
        ))}
        {!connections.length && <p className="muted">No external AI tools connected yet.</p>}
      </div>

      <form className="auth-form" onSubmit={save}>
        <h4>{editingId ? 'Edit AI tool' : 'Add an AI tool'}</h4>
        <label>Tool name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="My ChatGPT image tool" /></label>
        <label>Provider<select value={draft.provider} onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value }))}>{PROVIDERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>HTTPS bridge endpoint<input type="url" required value={draft.endpoint} onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))} placeholder="https://your-bridge.example.com/echoai-agent" /></label>
        <label>API key<input type="password" value={draft.apiKey} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={editingId ? 'Leave blank to keep existing key' : 'Paste provider key'}/></label>
        <label>Model or route<input value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} placeholder="default" /></label>
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving...' : editingId ? 'Update tool' : 'Save tool securely'}</button>
          {editingId && <button type="button" className="ghost-button" onClick={reset}>Cancel</button>}
        </div>
        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-message auth-error">{error}</p>}
      </form>
    </section>
  )
}
