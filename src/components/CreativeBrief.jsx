import { useRef, useState } from 'react'
import { briefSourceFromAsset, buildCreativeProject, readBriefFile } from '../services/documentBriefService'

const ACCEPTED_FILES = '.pdf,.docx,.pptx,.xlsx,.csv,.json,.txt,.md,image/*,video/*'

const OUTPUT_TYPES = [
  ['flyer', 'Flyer', 'A single polished graphic with headline, offer, and design — ready to post or print.'],
  ['image', 'Social image', 'A square or vertical image sized for Instagram or Facebook.'],
  ['video', 'Video plan', 'A scene-by-scene storyboard you can open and build out in the Video Studio.'],
  ['post', 'Post package', 'A caption, headline, and image bundled together, ready to send to the Scheduler.'],
]

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function CreativeBrief({ agentConfig, workspaceAssets = [], onEditProject, onSaveToWorkspace }) {
  const [sources, setSources] = useState([])
  const [instruction, setInstruction] = useState('Create a polished campaign flyer based on this information.')
  const [outputType, setOutputType] = useState('flyer')
  const [busy, setBusy] = useState(false)
  const [readingFiles, setReadingFiles] = useState(false)
  const [error, setError] = useState('')
  const [project, setProject] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const inputRef = useRef(null)

  const addFiles = async (files) => {
    setError('')
    setDragActive(false)
    const nextFiles = Array.from(files || [])

    if (!nextFiles.length) return

    setReadingFiles(true)
    try {
      const parsed = await Promise.all(nextFiles.map((file) => readBriefFile(file)))
      setSources((current) => {
        const filtered = parsed.filter((item) => !current.some((source) => source.id === item.id))
        return [...current, ...filtered]
      })
    } catch (readError) {
      setError(`Error reading files: ${readError.message}`)
    } finally {
      setReadingFiles(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  const addAssets = (assetIds) => {
    setError('')
    const picked = assetIds
      .map((assetId) => workspaceAssets.find((asset) => asset.id === assetId))
      .filter(Boolean)
      .map(briefSourceFromAsset)

    if (!picked.length) return

    setSources((current) => [
      ...current,
      ...picked.filter((item) => !current.some((source) => source.id === item.id)),
    ])
  }

  const generate = async () => {
    if (!instruction.trim()) {
      setError('Describe what you want EchoAI to create.')
      return
    }
    if (!sources.length) {
      setError('Add at least one source file.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const generatedProject = await buildCreativeProject({
        instruction,
        outputType,
        sources,
        agentConfig,
          })
          setProject(generatedProject)
          await onSaveToWorkspace(generatedProject)
          setAutoSaved(true)
    } catch (generationError) {
      setError(generationError.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSaveToWorkspace = async () => {
    if (!project) return
    setSaving(true)
    try {
      await onSaveToWorkspace(project)
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerateWithNewKeywords = () => {
    // Just re-run generation with current instruction and outputType
    generate()
  }

  const handleBrowseClick = () => {
    if (inputRef.current) {
      inputRef.current.click()
    }
  }

  const hasSources = sources.length > 0
  const hasInstruction = instruction.trim().length > 0
  const isReady = hasSources && hasInstruction
  const selectedOutput = OUTPUT_TYPES.find(([value]) => value === outputType)

  return (
    <div className="creative-brief-layout">
      <article className="sub-panel creative-brief-builder">
        <ol className="creative-brief-steps">
          <li className={hasSources ? 'done' : 'current'}><span>1</span> Add your files</li>
          <li className={!hasSources ? 'pending' : hasInstruction ? 'done' : 'current'}><span>2</span> Describe what to make</li>
          <li className={!isReady ? 'pending' : 'current'}><span>3</span> Pick a format &amp; generate</li>
        </ol>

        <div>
          <p className="section-label">Step 1 · Source material</p>
          <h3>Build from your documents</h3>
          <p className="panel-note">Add anything relevant — a flyer draft, a price list, product photos, or notes. EchoAI reads them and grounds the result in your real details.</p>
        </div>

        <div className="creative-provider-status">
          <strong>Generation tool</strong>
          <span>EchoAI Hosted AI</span>
          <small>EchoAI manages provider accounts, routing, credits, and API security for this campaign.</small>
        </div>

        <div
          className="brief-dropzone"
          onDragEnter={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragActive(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            event.stopPropagation()
            // Only set dragActive to false if leaving the dropzone entirely
            if (event.target === event.currentTarget) {
              setDragActive(false)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragActive(false)

            // Cards in the media library drag their id, not file bytes.
            const assetId = event.dataTransfer.getData('assetId')
            if (assetId) {
              addAssets([assetId])
              return
            }

            // dataTransfer must be read synchronously; it is cleared once the event ends.
            const items = event.dataTransfer.items
            if (items?.length > 0) {
              const draggedFiles = []
              for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                  const file = items[i].getAsFile()
                  if (file) draggedFiles.push(file)
                }
              }

              if (draggedFiles.length > 0) {
                addFiles(draggedFiles)
              } else {
                setError('That drag did not carry a file. Drag from your file manager or the media library, or click this box to browse.')
              }
            } else if (event.dataTransfer.files?.length > 0) {
              addFiles(Array.from(event.dataTransfer.files))
            } else {
              setError('No files detected in that drop. Click this box to browse instead.')
            }
          }}
          onClick={handleBrowseClick}
          style={{ 
            cursor: 'pointer',
            borderColor: dragActive ? 'rgb(59, 130, 246)' : undefined,
            backgroundColor: dragActive ? 'rgba(59, 130, 246, 0.05)' : undefined,
            transition: 'all 0.2s ease'
          }}
        >
          <strong>Add campaign files</strong>
          <span>Drag in media library assets, or click to browse for PowerPoint, Word, Excel, PDF, text, images, or video</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_FILES}
            multiple
            onChange={(event) => {
              if (event.target.files?.length) {
                addFiles(Array.from(event.target.files))
              }
            }}
            style={{ display: 'none' }}
          />
        </div>

        {readingFiles && (
          <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', marginBottom: '16px', borderLeft: '4px solid rgb(59, 130, 246)' }}>
            <p style={{ margin: 0, color: 'rgb(59, 130, 246)', fontSize: '14px', fontWeight: '500' }}>📖 Reading and parsing files...</p>
          </div>
        )}

        {sources.length > 0 && (
          <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', borderLeft: '4px solid rgb(34, 197, 94)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <p style={{ margin: 0, color: 'rgb(34, 197, 94)', fontSize: '14px', fontWeight: '600' }}>✓ {sources.length} file{sources.length === 1 ? '' : 's'} added</p>
              <button
                type="button"
                className="text-button"
                style={{ fontSize: '12px', color: '#ef4444' }}
                onClick={() => setSources([])}
              >
                Clear all
              </button>
            </div>
            <div className="brief-source-list">
              {sources.map((source) => (
                <div className="brief-source" key={source.id}>
                  <div>
                    <strong>{source.name}</strong>
                    <span>{formatSize(source.size)} · {source.text ? `${source.text.length.toLocaleString()} characters read` : 'reference attached'}</span>
                  </div>
                  <button type="button" className="text-button" title={`Remove ${source.name}`} onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!sources.length && !readingFiles && (
          <p style={{ padding: '12px', fontSize: '13px', color: '#94a3b8', textAlign: 'center', margin: '16px 0' }}>
            No files added yet. Drag files here or click to browse.
          </p>
        )}

        {error && (
          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', borderLeft: '4px solid rgb(239, 68, 68)', marginTop: '12px' }}>
            <p style={{ margin: 0, color: 'rgb(239, 68, 68)', fontSize: '13px' }}>❌ {error}</p>
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
              💡 <strong>Debug tip:</strong> Open the browser console (F12) to see detailed logs. Check that files are not already in the list above.
            </p>
          </div>
        )}

        <label>
          <p className="section-label">Step 2 · What should EchoAI create?</p>
          Describe the goal in plain language — the more detail, the better the result.
          <textarea rows="4" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Example: Create a flyer for our weekend sale, 20% off all shoes, casual and upbeat tone." />
        </label>

        <div>
          <p className="section-label">Step 3 · Choose an output format</p>
          <div className="brief-output-picker">
            {OUTPUT_TYPES.map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                className={outputType === value ? 'chip active' : 'chip'}
                title={description}
                onClick={() => setOutputType(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {selectedOutput && <p className="muted creative-output-hint">{selectedOutput[2]}</p>}
        </div>

        {!isReady && (
          <ul className="creative-brief-checklist">
            <li className={hasSources ? 'done' : ''}>{hasSources ? '✓' : '○'} Add at least one file</li>
            <li className={hasInstruction ? 'done' : ''}>{hasInstruction ? '✓' : '○'} Describe what to create</li>
          </ul>
        )}

        <button type="button" className="primary-button" disabled={busy} onClick={generate}>
          {busy ? 'Reading and building...' : 'Create project'}
        </button>
      </article>

      <article className="sub-panel creative-brief-result">
        <div>
          <p className="section-label">Step 4 · Your result</p>
          <h3>{project?.title || 'Your creative will appear here'}</h3>
        </div>
        {!project && <p className="muted">Once you add files and describe what to create, your generated flyer, image, video plan, or post package will appear here — ready to edit, save, or send to the Scheduler.</p>}
        {project?.imageSrc && <img src={project.imageSrc} alt={project.headline} className="brief-result-image" />}
        {project && (
          <>
            <div className="brief-copy-block">
              <small>Headline</small>
              <strong>{project.headline}</strong>
              <p>{project.caption}</p>
            </div>
            {project.scenes?.length > 0 && (
              <ol className="brief-scenes">
                {project.scenes.map((scene, index) => (
                  <li key={`${scene.title}-${index}`}><strong>{scene.title}</strong><span>{scene.direction}</span></li>
                ))}
              </ol>
            )}
            {project.warning && <p className="muted">{project.warning}</p>}
            {autoSaved && <p className="creative-auto-save-note">✓ Saved automatically to AI Generations</p>}
            <div className="brief-result-actions">
              {(project.outputType === 'flyer' || project.outputType === 'image') && (
                <button type="button" className="primary-button" onClick={() => onEditProject(project)}>Edit visual</button>
              )}
              {project.outputType === 'video' && (
                <button type="button" className="primary-button" onClick={() => onEditProject(project)}>Open video editor</button>
              )}
              <button type="button" className="ghost-button" disabled={saving} onClick={handleSaveToWorkspace}>
                {saving ? 'Saving...' : 'Save to workspace'}
              </button>
              <button type="button" className="ghost-button" disabled={busy} onClick={handleRegenerateWithNewKeywords}>
                {busy ? 'Regenerating...' : 'Regenerate with new keywords'}
              </button>
            </div>
          </>
        )}
      </article>
    </div>
  )
}