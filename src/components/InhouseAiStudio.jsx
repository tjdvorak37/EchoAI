import { useMemo, useRef, useState } from 'react'
import { canUseAgentMode, runCreativeAgentJob } from '../services/aiAgentService'
import './InhouseAiStudio.css'

const CREATIVE_MODES = [
  ['message', 'Writing', 'Campaign copy, scripts, strategy, and structured plans'],
  ['document', 'Documents', 'Analyze and combine workspace source files'],
  ['image', 'Create image', 'Generate an original image from a prompt and references'],
  ['image_edit', 'Edit image', 'Inpaint, outpaint, remove, replace, or restore pixels'],
  ['character', 'Character', 'Create a character sheet or a consistent persona view'],
  ['video', 'Create video', 'Generate a scene or video from text, image, or character references'],
  ['audio', 'Audio & voice', 'Create voiceover, captions, transcription, or sound'],
  ['vision', 'Analyze media', 'Understand images and video frames'],
]

const emptyPersona = () => ({
  name: '',
  description: '',
  visualIdentity: '',
  voice: '',
  requiredTraits: '',
  forbiddenTraits: '',
  referenceAssetIds: [],
})

const fileExtension = (mime, kind) => {
  if (mime?.includes('webm')) return 'webm'
  if (mime?.includes('mp4')) return 'mp4'
  if (mime?.includes('mpeg')) return 'mp3'
  if (mime?.includes('wav')) return 'wav'
  if (mime?.includes('jpeg')) return 'jpg'
  if (mime?.includes('webp')) return 'webp'
  return kind === 'video' ? 'webm' : kind === 'audio' ? 'mp3' : 'png'
}

export function InhouseAiStudio({ agentConfig, assets, onSaveConfig, onAddAsset }) {
  const [mode, setMode] = useState('image')
  const [prompt, setPrompt] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [referenceIds, setReferenceIds] = useState([])
  const [settings, setSettings] = useState({ aspectRatio: '1:1', durationSeconds: 6, quality: 'high', style: agentConfig.defaultStyle || '' })
  const [personaDraft, setPersonaDraft] = useState(emptyPersona)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savingPersona, setSavingPersona] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const personaCounter = useRef(0)

  const personas = agentConfig.personas || []
  const selectedPersona = personas.find((persona) => persona.id === personaId) || null
  const availableReferences = useMemo(
    () => (assets || []).filter((asset) => ['image', 'video', 'document'].includes(asset.type)),
    [assets],
  )
  const enabledModes = CREATIVE_MODES.filter(([key]) => canUseAgentMode(agentConfig, key))

  const toggleReference = (assetId) => {
    setReferenceIds((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId])
  }

  const savePersona = async () => {
    if (!personaDraft.name.trim() || !personaDraft.description.trim()) {
      setError('Give the persona a name and core description.')
      return
    }
    setSavingPersona(true)
    setError('')
    try {
      personaCounter.current += 1
      const persona = {
        ...personaDraft,
        referenceAssetIds: referenceIds,
        id: `persona-${personaCounter.current}-${personaDraft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        name: personaDraft.name.trim(),
        description: personaDraft.description.trim(),
        createdAt: new Date().toISOString(),
      }
      await onSaveConfig({ ...agentConfig, personas: [...personas, persona] })
      setPersonaId(persona.id)
      setPersonaDraft(emptyPersona())
      setPersonaOpen(false)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingPersona(false)
    }
  }

  const deletePersona = async (id) => {
    await onSaveConfig({ ...agentConfig, personas: personas.filter((persona) => persona.id !== id) })
    if (personaId === id) setPersonaId('')
  }

  const runJob = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const resolvedReferenceIds = new Set([...referenceIds, ...(selectedPersona?.referenceAssetIds || [])])
      const references = availableReferences.filter((asset) => resolvedReferenceIds.has(asset.id))
      const output = {
        ...settings,
        negativePrompt: agentConfig.negativePrompt || '',
        returnEditableMetadata: true,
      }
      setResult(await runCreativeAgentJob({ agentConfig, capability: mode, prompt, persona: selectedPersona, references, settings: output }))
    } catch (jobError) {
      setError(jobError.message)
    } finally {
      setBusy(false)
    }
  }

  const saveGeneratedPersona = async () => {
    if (!result?.persona) return
    personaCounter.current += 1
    const generated = result.persona
    const name = generated.name || result.title || 'Generated persona'
    const persona = {
      id: `persona-${personaCounter.current}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      name,
      description: generated.description || generated.summary || prompt,
      visualIdentity: generated.visualIdentity || generated.appearance || '',
      voice: generated.voice || generated.personality || '',
      requiredTraits: generated.requiredTraits || '',
      forbiddenTraits: generated.forbiddenTraits || '',
      referenceAssetIds: referenceIds,
      createdAt: new Date().toISOString(),
    }
    await onSaveConfig({ ...agentConfig, personas: [...personas, persona] })
    setPersonaId(persona.id)
  }

  const saveMedia = (media, index) => {
    const extension = fileExtension(media.mime, media.kind)
    onAddAsset({
      name: `${result?.title || selectedPersona?.name || 'inhouse-ai'}-${index + 1}.${extension}`,
      type: media.kind === 'audio' ? 'document' : media.kind,
      mime: media.mime || `${media.kind}/${extension}`,
      previewUrl: media.src,
      summary: `Created by ${agentConfig.name} using ${mode}.`,
    })
  }

  return (
    <section className="inhouse-ai-studio">
      <header className="inhouse-ai-header">
        <div>
          <p className="small-title">In-house AI Lab</p>
          <h2>Create with your strongest models</h2>
          <p>Route specialized media jobs through your private agent while EchoAI supplies personas, references, output controls, and workspace delivery.</p>
        </div>
        <div className={`inhouse-ai-status ${agentConfig.enabled && agentConfig.endpoint ? 'ready' : ''}`}>
          <span />
          <div><strong>{agentConfig.name}</strong><small>{agentConfig.enabled && agentConfig.endpoint ? 'Connected and ready' : 'Configure the agent in Integrations'}</small></div>
        </div>
      </header>

      <div className="inhouse-ai-mode-strip" aria-label="AI job type">
        {CREATIVE_MODES.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={mode === key ? 'active' : ''}
            disabled={!canUseAgentMode(agentConfig, key)}
            title={!canUseAgentMode(agentConfig, key) ? `Enable ${key} in Integrations` : label}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="inhouse-ai-layout">
        <div className="inhouse-ai-builder">
          <div className="inhouse-ai-block">
            <div className="inhouse-ai-block-heading">
              <div><span>01</span><strong>Creative direction</strong></div>
              <small>{CREATIVE_MODES.find(([key]) => key === mode)?.[2]}</small>
            </div>
            <label>
              Describe the result
              <textarea rows="6" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe subject, action, environment, camera, style, mood, required details, and what must not change." />
            </label>
          </div>

          <div className="inhouse-ai-block">
            <div className="inhouse-ai-block-heading">
              <div><span>02</span><strong>Character or persona</strong></div>
              <button type="button" className="text-button" onClick={() => setPersonaOpen((current) => !current)}>{personaOpen ? 'Close' : '+ New persona'}</button>
            </div>
            <div className="inhouse-persona-list">
              <button type="button" className={!personaId ? 'active' : ''} onClick={() => setPersonaId('')}><strong>No persona</strong><small>Use only the prompt</small></button>
              {personas.map((persona) => (
                <div className={`inhouse-persona-card ${personaId === persona.id ? 'active' : ''}`} key={persona.id}>
                  <button type="button" onClick={() => setPersonaId(persona.id)}><strong>{persona.name}</strong><small>{persona.description}</small></button>
                  <button type="button" title={`Delete ${persona.name}`} onClick={() => deletePersona(persona.id)}>×</button>
                </div>
              ))}
            </div>

            {personaOpen && (
              <div className="inhouse-persona-form">
                <label>Name<input value={personaDraft.name} onChange={(event) => setPersonaDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Maya, product guide" /></label>
                <label>Core description<textarea rows="3" value={personaDraft.description} onChange={(event) => setPersonaDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Role, age range, personality, purpose, and background." /></label>
                <label>Visual identity<textarea rows="3" value={personaDraft.visualIdentity} onChange={(event) => setPersonaDraft((current) => ({ ...current, visualIdentity: event.target.value }))} placeholder="Face, hair, proportions, wardrobe, palette, and distinguishing traits." /></label>
                <label>Voice and behavior<textarea rows="2" value={personaDraft.voice} onChange={(event) => setPersonaDraft((current) => ({ ...current, voice: event.target.value }))} placeholder="Vocabulary, tone, temperament, and communication rules." /></label>
                <div className="inhouse-form-split">
                  <label>Always preserve<textarea rows="2" value={personaDraft.requiredTraits} onChange={(event) => setPersonaDraft((current) => ({ ...current, requiredTraits: event.target.value }))} /></label>
                  <label>Never include<textarea rows="2" value={personaDraft.forbiddenTraits} onChange={(event) => setPersonaDraft((current) => ({ ...current, forbiddenTraits: event.target.value }))} /></label>
                </div>
                <button type="button" className="primary-button" disabled={savingPersona} onClick={savePersona}>{savingPersona ? 'Saving...' : 'Save reusable persona'}</button>
              </div>
            )}
          </div>

          <div className="inhouse-ai-block">
            <div className="inhouse-ai-block-heading"><div><span>03</span><strong>Workspace references</strong></div><small>{referenceIds.length} selected</small></div>
            <div className="inhouse-reference-grid">
              {availableReferences.map((asset) => (
                <label className={referenceIds.includes(asset.id) ? 'active' : ''} key={asset.id}>
                  <input type="checkbox" checked={referenceIds.includes(asset.id)} onChange={() => toggleReference(asset.id)} />
                  {asset.previewUrl && asset.type === 'image' ? <img src={asset.previewUrl} alt="" /> : <span>{asset.type.slice(0, 3).toUpperCase()}</span>}
                  <strong>{asset.name}</strong>
                </label>
              ))}
              {!availableReferences.length && <p className="muted">Upload files to the Workspace drawer to use them as references.</p>}
            </div>
          </div>

          <div className="inhouse-ai-block">
            <div className="inhouse-ai-block-heading"><div><span>04</span><strong>Output controls</strong></div></div>
            <div className="inhouse-settings-grid">
              <label>Aspect ratio<select value={settings.aspectRatio} onChange={(event) => setSettings((current) => ({ ...current, aspectRatio: event.target.value }))}><option>1:1</option><option>4:5</option><option>16:9</option><option>9:16</option></select></label>
              <label>Quality<select value={settings.quality} onChange={(event) => setSettings((current) => ({ ...current, quality: event.target.value }))}><option value="draft">Draft</option><option value="standard">Standard</option><option value="high">High</option></select></label>
              <label>Style<input value={settings.style} onChange={(event) => setSettings((current) => ({ ...current, style: event.target.value }))} placeholder="Photoreal, editorial..." /></label>
              {mode === 'video' && <label>Duration<input type="number" min="2" max="30" value={settings.durationSeconds} onChange={(event) => setSettings((current) => ({ ...current, durationSeconds: Number(event.target.value) }))} /></label>}
            </div>
          </div>

          {error && <p className="auth-message auth-error">{error}</p>}
          <button type="button" className="primary-button inhouse-run-button" disabled={busy || !enabledModes.length || !agentConfig.enabled || !agentConfig.endpoint} onClick={runJob}>
            {busy ? 'Creating with in-house AI...' : `Run ${CREATIVE_MODES.find(([key]) => key === mode)?.[1] || 'AI'} job`}
          </button>
        </div>

        <aside className="inhouse-ai-result">
          <div className="inhouse-ai-result-heading"><div><p className="section-label">Result</p><h3>{result?.title || 'Ready for a creative job'}</h3></div>{result?.usage && <span>{result.usage.totalTokens || result.usage.credits || ''}</span>}</div>
          {!result && <div className="inhouse-result-empty"><span>AI</span><p>Your generated text, character profile, image, video, or audio will appear here.</p></div>}
          {result?.text && <div className="inhouse-result-copy"><p>{result.text}</p></div>}
          {result?.persona && <div className="inhouse-result-persona"><strong>{result.persona.name || 'Generated character'}</strong><pre>{JSON.stringify(result.persona, null, 2)}</pre><button type="button" className="primary-button" onClick={saveGeneratedPersona}>Save as reusable persona</button></div>}
          {result?.scenes?.length > 0 && <ol className="inhouse-result-scenes">{result.scenes.map((scene, index) => <li key={`${scene.title || 'scene'}-${index}`}><strong>{scene.title || `Scene ${index + 1}`}</strong><span>{scene.direction || scene.description}</span></li>)}</ol>}
          {result?.media.map((media, index) => (
            <div className="inhouse-result-media" key={`${media.kind}-${index}`}>
              {media.kind === 'image' && <img src={media.src} alt={result.title || 'AI generated'} />}
              {media.kind === 'video' && <video src={media.src} controls playsInline />}
              {media.kind === 'audio' && <audio src={media.src} controls />}
              {!['image', 'video', 'audio'].includes(media.kind) && <a href={media.src} target="_blank" rel="noreferrer">Open generated file</a>}
              <button type="button" className="primary-button" onClick={() => saveMedia(media, index)}>Save to workspace</button>
            </div>
          ))}
          {result && !result.text && !result.persona && !result.scenes.length && !result.media.length && <p className="muted">The endpoint completed but returned no recognized media or text. Check the contract preview in Integrations.</p>}
        </aside>
      </div>
    </section>
  )
}