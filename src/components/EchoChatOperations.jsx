import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { testEchoGateway } from '../services/echoChatService'

const DEFAULT_SETTINGS = {
  enabled: false,
  gateway_url: '',
  gateway_token: '',
  model: 'amazon.nova-lite-v1:0',
  daily_message_limit: 25,
  max_response_tokens: 600,
  system_prompt: '',
}

export function EchoChatOperations() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [status, setStatus] = useState({ loading: false, saving: false, testing: false, message: '', error: '' })
  const [showToken, setShowToken] = useState(false)

  const loadSettings = async () => {
    if (!isSupabaseConfigured) return
    setStatus((current) => ({ ...current, loading: true, message: '', error: '' }))
    try {
      const { data, error } = await supabase.from('echo_chat_settings').select('*').eq('id', true).maybeSingle()
      if (error) throw error
      if (data) setSettings((current) => ({ ...current, ...data }))
      setStatus({ loading: false, saving: false, testing: false, message: '', error: '' })
    } catch (error) {
      setStatus({ loading: false, saving: false, testing: false, message: '', error: error.message })
    }
  }

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) return undefined
    supabase.from('echo_chat_settings').select('*').eq('id', true).maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return
        setSettings((current) => ({ ...current, ...data }))
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const updateSetting = (field, value) => setSettings((current) => ({ ...current, [field]: value }))

  const saveSettings = async () => {
    if (!isSupabaseConfigured) {
      setStatus({ loading: false, saving: false, testing: false, message: 'Demo mode: connect Supabase to save Ask Echo settings.', error: '' })
      return
    }

    if (settings.enabled && (!settings.gateway_url.startsWith('https://') || !settings.gateway_token.trim())) {
      setStatus({ loading: false, saving: false, testing: false, message: '', error: 'A secure HTTPS gateway URL and gateway token are required before enabling Ask Echo.' })
      return
    }

    setStatus({ loading: false, saving: true, testing: false, message: '', error: '' })
    try {
      const { error } = await supabase.from('echo_chat_settings').update({
        enabled: settings.enabled,
        gateway_url: settings.gateway_url.trim(),
        gateway_token: settings.gateway_token.trim(),
        model: settings.model.trim(),
        daily_message_limit: Number(settings.daily_message_limit),
        max_response_tokens: Number(settings.max_response_tokens),
        system_prompt: settings.system_prompt.trim(),
        updated_at: new Date().toISOString(),
      }).eq('id', true)
      if (error) throw error
      setStatus({ loading: false, saving: false, testing: false, message: 'Ask Echo settings saved. Users can chat only while the service is enabled.', error: '' })
    } catch (error) {
      setStatus({ loading: false, saving: false, testing: false, message: '', error: error.message })
    }
  }

  const testGateway = async () => {
    setStatus({ loading: false, saving: false, testing: true, message: '', error: '' })
    try {
      const result = await testEchoGateway()
      setStatus({ loading: false, saving: false, testing: false, message: result.text || 'Gateway connection verified.', error: '' })
    } catch (error) {
      setStatus({ loading: false, saving: false, testing: false, message: '', error: error.message })
    }
  }

  return (
    <section className="sub-panel" style={{ marginBottom: '1.25rem' }}>
      <div className="inhouse-engine-heading">
        <div>
          <h3>Ask Echo: Self-hosted Chat</h3>
          <p className="muted">Premium-only idea and workflow support routed through your private AWS Bedrock gateway.</p>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={settings.enabled} onChange={(event) => updateSetting('enabled', event.target.checked)} />
          <span>{settings.enabled ? 'Live for Premium' : 'Offline'}</span>
        </label>
      </div>

      <div className="inhouse-settings-grid">
        <label>
          Secure gateway URL
          <input type="url" value={settings.gateway_url} onChange={(event) => updateSetting('gateway_url', event.target.value)} placeholder="https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com/default/echoai-bedrock-gateway" />
        </label>
        <label>
          Bedrock model ID
          <input value={settings.model} onChange={(event) => updateSetting('model', event.target.value)} placeholder="amazon.nova-lite-v1:0" />
        </label>
        <label>
          Daily messages per Premium user
          <input type="number" min="1" max="1000" value={settings.daily_message_limit} onChange={(event) => updateSetting('daily_message_limit', event.target.value)} />
        </label>
        <label>
          Maximum response tokens
          <input type="number" min="64" max="4096" value={settings.max_response_tokens} onChange={(event) => updateSetting('max_response_tokens', event.target.value)} />
        </label>
      </div>

      <label style={{ display: 'block', marginTop: '0.85rem' }}>
        Gateway token
        <div className="ai-key-input-wrapper">
          <input type={showToken ? 'text' : 'password'} value={settings.gateway_token} onChange={(event) => updateSetting('gateway_token', event.target.value)} placeholder="Shared secret accepted by your private gateway" autoComplete="off" />
          <button type="button" className="key-toggle-btn" onClick={() => setShowToken((value) => !value)}>{showToken ? 'Hide' : 'Show'}</button>
        </div>
      </label>

      <label style={{ display: 'block', marginTop: '0.85rem' }}>
        Echo system guidance
        <textarea rows="4" value={settings.system_prompt} onChange={(event) => updateSetting('system_prompt', event.target.value)} placeholder="Leave blank to use the safe EchoAI default. Add product-specific guidance here, never private credentials." />
      </label>

      <div className="action-row" style={{ marginTop: '0.85rem' }}>
        <button type="button" className="ghost-button" onClick={loadSettings} disabled={status.loading}>{status.loading ? 'Refreshing...' : 'Refresh'}</button>
        <button type="button" className="ghost-button" onClick={testGateway} disabled={status.testing}>{status.testing ? 'Testing gateway...' : 'Test gateway'}</button>
        <button type="button" className="primary-button" onClick={saveSettings} disabled={status.saving}>{status.saving ? 'Saving...' : 'Save Ask Echo settings'}</button>
      </div>
      {status.message && <p className="auth-message tone-positive">{status.message}</p>}
      {status.error && <p className="auth-message auth-error">{status.error}</p>}
    </section>
  )
}