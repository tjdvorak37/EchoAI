import { useEffect, useState } from 'react'
import { developerAppService } from '../services/developerAppService'

const PROVIDERS = [
  ['meta', 'Meta (Facebook + Instagram)', 'Live'], ['tiktok', 'TikTok', 'Live'], ['youtube', 'YouTube', 'Live'], ['x', 'X', 'Live'], ['linkedin', 'LinkedIn', 'Live'],
  ['meta_ads', 'Meta Ads', 'Live'], ['google_ads', 'Google Ads', 'Live'], ['tiktok_ads', 'TikTok Ads', 'Live'],
  ['google_drive', 'Google Drive & Calendar', 'Live'], ['microsoft_365', 'Microsoft 365 / OneDrive', 'Live'],
  ['threads', 'Threads', 'Planned'], ['twitch', 'Twitch', 'Planned'], ['google_business', 'Google Business Profile', 'Planned'], ['bluesky', 'Bluesky', 'Planned'], ['pinterest', 'Pinterest', 'Planned'], ['snapchat', 'Snapchat', 'Planned'],
]
const PROVIDER_LABELS = Object.fromEntries(PROVIDERS.map(([key, label]) => [key, label]))
const PROVIDER_STATUS = Object.fromEntries(PROVIDERS.map(([key, , status]) => [key, status]))

const DEFAULT_REDIRECT = 'https://yxmsqrtoghrazfwweqqf.supabase.co/functions/v1/social-oauth'
const ADS_REDIRECT = 'https://yxmsqrtoghrazfwweqqf.supabase.co/functions/v1/ad-analytics'

const draftFromRecord = (record, provider) => ({
  appName: record?.app_name || '',
  clientId: record?.client_id || '',
  clientSecret: '',
  redirectUri: record?.redirect_uri || (provider.endsWith('_ads') ? ADS_REDIRECT : DEFAULT_REDIRECT),
  scopes: (record?.scopes || []).join(', '),
  enabled: record?.enabled !== false,
})

const normalizeRole = (role) => String(role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')

export function DeveloperAppsPanel({ currentUser }) {
  const [records, setRecords] = useState([])
  const [selected, setSelected] = useState('youtube')
  const [draft, setDraft] = useState({ appName: '', clientId: '', clientSecret: '', redirectUri: DEFAULT_REDIRECT, scopes: '', enabled: true })
  const [canEdit, setCanEdit] = useState(false)
  const [status, setStatus] = useState({ loading: true, saving: false, message: '', error: '' })
  const isAdmin = ['admin', 'super_admin'].includes(normalizeRole(currentUser?.role))

  useEffect(() => {
    let active = true
    developerAppService.list().then((result) => {
      if (!active) return
      setRecords(result.records || [])
      setCanEdit(result.canEdit === true)
      setDraft(draftFromRecord((result.records || []).find((item) => item.provider === 'youtube'), 'youtube'))
      setStatus((current) => ({ ...current, loading: false }))
    }).catch((error) => {
      if (active) setStatus({ loading: false, saving: false, message: '', error: error.message })
    })
    return () => { active = false }
  }, [])

  const selectProvider = (provider) => {
    setSelected(provider)
    setDraft(draftFromRecord(records.find((item) => item.provider === provider), provider))
    setStatus((current) => ({ ...current, message: '', error: '' }))
  }

  const save = async (event) => {
    event.preventDefault()
    setStatus({ loading: false, saving: true, message: '', error: '' })
    try {
      const record = await developerAppService.save({
        provider: selected,
        ...draft,
        scopes: draft.scopes.split(',').map((scope) => scope.trim()).filter(Boolean),
      })
      setRecords((current) => [...current.filter((item) => item.provider !== selected), record].sort((a, b) => a.provider.localeCompare(b.provider)))
      setDraft((current) => ({ ...current, clientSecret: '' }))
      setStatus({ loading: false, saving: false, message: 'Developer app configuration saved. Secret values are never displayed.', error: '' })
    } catch (error) {
      setStatus({ loading: false, saving: false, message: '', error: error.message })
    }
  }

  const record = records.find((item) => item.provider === selected)
  return (
    <section className="sub-panel">
      <div className="list-row"><div><h3>Developer Apps &amp; Credentials</h3><p className="muted">Manage provider app settings without editing source code. Secret values are write-only and never shown.</p></div><span className="badge info">{isAdmin ? 'Super Admin' : canEdit ? 'Credential specialist' : 'View only'}</span></div>
      {!status.loading && !canEdit && (
        <div className="panel-note">
          <strong>Editing access is locked.</strong> A Super Admin can grant your account Developer Apps specialist access from People &gt; Employees. Sign out and back in after access is granted.
        </div>
      )}
      {status.loading && <p className="muted">Checking secure credential access...</p>}
      <div className="chip-row">{PROVIDERS.map(([key, label, availability]) => <button key={key} type="button" className={selected === key ? 'chip active' : 'chip'} onClick={() => selectProvider(key)}>{label} {availability === 'Planned' ? '(planned)' : ''}</button>)}</div>
      <div className="list-row"><div><strong>{PROVIDER_LABELS[selected]}</strong><span className="muted">{record?.client_id ? `Client ID configured: ${record.client_id}` : PROVIDER_STATUS[selected] === 'Planned' ? 'Credential record ready; adapter is not released yet' : 'No client ID configured'}</span></div><span className={`badge ${record?.client_id ? 'success' : 'pending'}`}>{record?.client_id ? 'Configured' : PROVIDER_STATUS[selected] === 'Planned' ? 'Planned' : 'Needs setup'}</span></div>
      <form className="auth-form" onSubmit={save}>
        <label>Application name<input disabled={!canEdit} required value={draft.appName} onChange={(event) => setDraft((current) => ({ ...current, appName: event.target.value }))} placeholder="EchoAI production app" /></label>
        <label>Client ID<input disabled={!canEdit} required value={draft.clientId} onChange={(event) => setDraft((current) => ({ ...current, clientId: event.target.value }))} /></label>
        <label>Client secret<input disabled={!canEdit} type="password" value={draft.clientSecret} onChange={(event) => setDraft((current) => ({ ...current, clientSecret: event.target.value }))} placeholder={record?.client_id ? 'Leave blank to keep current secret' : 'Enter secret once'} /></label>
        <label>Redirect URI<input disabled={!canEdit} type="url" value={draft.redirectUri} onChange={(event) => setDraft((current) => ({ ...current, redirectUri: event.target.value }))} /></label>
        <label>Scopes<input disabled={!canEdit} value={draft.scopes} onChange={(event) => setDraft((current) => ({ ...current, scopes: event.target.value }))} placeholder="scope.one, scope.two" /></label>
        <label><input disabled={!canEdit} type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /> Provider enabled</label>
        {status.message && <p className="auth-message">{status.message}</p>}
        {status.error && <p className="auth-message auth-error">{status.error}</p>}
        <button type="submit" className="primary-button" disabled={!canEdit || status.saving}>{status.saving ? 'Saving securely...' : 'Save provider configuration'}</button>
      </form>
    </section>
  )
}