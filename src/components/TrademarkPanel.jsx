import { useEffect, useState } from 'react'
import { trademarkService } from '../services/trademarkService'
import './TrademarkPanel.css'

const DEFAULT_DOCUMENT = {
  applicant: {
    name: 'Timothy Jason Dvorak',
    address: '314 Arthur Neu Dr.\nCarroll, IA 51401\nUnited States of America',
    email: 'tdvorak37@gmail.com',
    phone: '712-790-7445',
    jurisdiction: 'United States of America',
    website: 'https://www.echoaipro.com',
    availability: 'Private beta testing; not live for general public use',
    firstUseAnywhere: '',
    firstUseCommerce: '',
  },
  marks: 'EchoAI\nEchoAI + Echo mascot\nAI Studio\nIn-house AI\nPhoto + video\nPublish\nListen\nWorkspace',
  assets: 'src/assets/echo-mascot.svg | Primary logo / mascot | Confirm ownership\npublic/favicon.svg | Site icon | Supporting evidence\nsrc/assets/demo-poster.svg | Service specimen | Confirm customer display\nsrc/assets/hero.png | Website visual | Confirm source and license',
  services: 'AI-assisted creation, editing, storage, social publishing, audience insights, and private AI-tool integration.',
  records: 'Copyright assignments\nContractor and contributor agreements\nFont, stock media, icon, and AI asset licenses\nTrade-secret access policy\nPrivacy policy and terms\nDomain and business records',
  checklist: 'Complete applicant and first-use dates\nRun US trademark clearance searches\nConfirm ownership and licenses\nCapture dated HTTPS site screenshots\nConfirm goods/services classes\nAttorney review before filing',
}

const mergeDocument = (value) => ({ ...DEFAULT_DOCUMENT, ...value, applicant: { ...DEFAULT_DOCUMENT.applicant, ...(value?.applicant || {}) } })

const download = (name, content, type) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

const normalizeRole = (role) => String(role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')

export function TrademarkPanel({ currentUser }) {
  const [document, setDocument] = useState(DEFAULT_DOCUMENT)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState({ saving: false, message: '', error: '' })
  const isAdmin = ['admin', 'super_admin'].includes(normalizeRole(currentUser?.role))
  const canEdit = isAdmin || currentUser?.trademarkEditAccess === true

  useEffect(() => {
    let active = true
    trademarkService.load(currentUser?.company).then((saved) => {
      if (active && saved) setDocument(mergeDocument(saved))
    }).catch((error) => {
      if (active) setStatus({ saving: false, message: '', error: error.message })
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [currentUser?.company])

  const update = (section, field) => (event) => setDocument((current) => ({
    ...current,
    [section]: section === 'applicant' ? { ...current.applicant, [field]: event.target.value } : event.target.value,
  }))

  const save = async () => {
    setStatus({ saving: true, message: '', error: '' })
    try {
      await trademarkService.save({ companyKey: currentUser.company, companyName: currentUser.company, userId: currentUser.id, document, canEdit })
      setStatus({ saving: false, message: 'Trademark workspace saved.', error: '' })
    } catch (error) {
      setStatus({ saving: false, message: '', error: error.message })
    }
  }

  const print = () => window.print()
  const exportText = () => download('echoai-trademark-review.txt', `ECHOAI TRADEMARK REVIEW\n\nApplicant\n${document.applicant.name}\n${document.applicant.address}\n${document.applicant.email}\n${document.applicant.phone}\n${document.applicant.website}\n\nCandidate marks\n${document.marks}\n\nServices\n${document.services}\n\nAssets and specimens\n${document.assets}\n\nRelated records\n${document.records}\n\nFiling checklist\n${document.checklist}\n`, 'text/plain;charset=utf-8')
  const exportJson = () => download('echoai-trademark-workspace.json', JSON.stringify(document, null, 2), 'application/json')

  if (loading) return <section className="trademark-panel"><p className="muted">Loading trademark workspace...</p></section>

  return (
    <section className="trademark-panel">
      <header className="trademark-header">
        <div><p className="section-label">Legal operations</p><h2>Trademark &amp; Legal Workspace</h2><p>Prepare brand records, specimens, filing notes, and supporting documents in one controlled workspace.</p></div>
        <span className="trademark-badge">{isAdmin ? 'Super Admin' : 'Technician'} access</span>
      </header>
      <div className="trademark-warning"><strong>Review draft only.</strong> This workspace does not replace a trademark attorney or a government filing. Never add customer data, passwords, API keys, OAuth tokens, or confidential production exports.</div>

      <div className="trademark-grid">
        <article className="trademark-card trademark-wide"><h3>Applicant and filing details</h3><div className="trademark-fields">
          <label>Legal owner<input disabled={!canEdit} value={document.applicant.name} onChange={update('applicant', 'name')} /></label>
          <label>Email<input disabled={!canEdit} type="email" value={document.applicant.email} onChange={update('applicant', 'email')} /></label>
          <label>Phone<input disabled={!canEdit} value={document.applicant.phone} onChange={update('applicant', 'phone')} /></label>
          <label>Filing jurisdiction<input disabled={!canEdit} value={document.applicant.jurisdiction} onChange={update('applicant', 'jurisdiction')} /></label>
          <label>Website<input disabled={!canEdit} value={document.applicant.website} onChange={update('applicant', 'website')} /></label>
          <label>Availability<input disabled={!canEdit} value={document.applicant.availability} onChange={update('applicant', 'availability')} /></label>
          <label>Owner address<textarea disabled={!canEdit} rows="3" value={document.applicant.address} onChange={update('applicant', 'address')} /></label>
          <label>First use anywhere<textarea disabled={!canEdit} rows="2" placeholder="Confirm date or state not yet used" value={document.applicant.firstUseAnywhere} onChange={update('applicant', 'firstUseAnywhere')} /></label>
          <label>First use in commerce<textarea disabled={!canEdit} rows="2" placeholder="Confirm date or state not yet used" value={document.applicant.firstUseCommerce} onChange={update('applicant', 'firstUseCommerce')} /></label>
        </div></article>

        <article className="trademark-card"><h3>Candidate marks</h3><p className="muted">One mark per line. Clear each mark before filing.</p><textarea disabled={!canEdit} rows="10" value={document.marks} onChange={update('marks')} /></article>
        <article className="trademark-card"><h3>Services description</h3><p className="muted">Keep this factual and limited to services actually offered.</p><textarea disabled={!canEdit} rows="10" value={document.services} onChange={update('services')} /></article>
        <article className="trademark-card trademark-wide"><h3>Images, specimens, and ownership notes</h3><p className="muted">Record the exact file, intended use, and license/ownership status. Add dated live-site screenshots as attachments outside this editor.</p><textarea disabled={!canEdit} rows="8" value={document.assets} onChange={update('assets')} /></article>
        <article className="trademark-card"><h3>Supporting legal records</h3><textarea disabled={!canEdit} rows="9" value={document.records} onChange={update('records')} /></article>
        <article className="trademark-card"><h3>Preparation checklist</h3><textarea disabled={!canEdit} rows="9" value={document.checklist} onChange={update('checklist')} /></article>
      </div>

      <footer className="trademark-actions"><div>{status.message && <span className="auth-message">{status.message}</span>}{status.error && <span className="auth-message auth-error">{status.error}</span>}{!canEdit && <span className="muted">View-only access. A Super Admin must grant specialist editing access.</span>}</div><div className="action-row"><button type="button" className="primary-button" onClick={save} disabled={status.saving || !canEdit}>{status.saving ? 'Saving...' : 'Save workspace'}</button><button type="button" className="ghost-button" onClick={print}>Print review</button><button type="button" className="ghost-button" onClick={exportText}>Download text</button><button type="button" className="ghost-button" onClick={exportJson}>Download JSON</button></div></footer>
    </section>
  )
}