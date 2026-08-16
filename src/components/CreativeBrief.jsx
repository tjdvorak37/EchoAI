import { useRef, useState } from 'react'
import { buildCreativeProject, readBriefFile } from '../services/documentBriefService'

const ACCEPTED_FILES = '.pdf,.docx,.pptx,.xlsx,.csv,.json,.txt,.md,image/*,video/*'

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function CreativeBrief({ agentConfig, onEditProject, onUseDraft, onSaveToWorkspace }) {
  const [sources, setSources] = useState([])
  const [instruction, setInstruction] = useState('Create a polished campaign flyer based on this information.')
  const [outputType, setOutputType] = useState('flyer')
  const [busy, setBusy] = useState(false)
  const [readingFiles, setReadingFiles] = useState(false)
  const [error, setError] = useState('')
  const [project, setProject] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dragActive, setDragActive] = useState(false)
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
      setProject(await buildCreativeProject({ instruction, outputType, sources, agentConfig }))
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

  return (
    <div className="creative-brief-layout">
      <article className="sub-panel creative-brief-builder">
        <div>
          <p className="section-label">Source material</p>
          <h3>Build from your documents</h3>
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
                // kind is 'string' when the drag came from a web page (cloud storage,
                // webmail) rather than the filesystem, so there are no bytes to read.
                setError(
                  'That drag carried a link, not a file. Files dragged from a browser tab or cloud storage have no data attached — download it first, then drag it from your file manager, or click this box to browse.',
                )
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
          <span>PowerPoint, Word, Excel, PDF, text, images, or video</span>
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
          What should EchoAI create?
          <textarea rows="4" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        </label>

        <div>
          <p className="small-title">Output</p>
          <div className="brief-output-picker">
            {[
              ['flyer', 'Flyer'],
              ['image', 'Social image'],
              ['video', 'Video plan'],
              ['post', 'Post package'],
            ].map(([value, label]) => (
              <button key={value} type="button" className={outputType === value ? 'chip active' : 'chip'} onClick={() => setOutputType(value)}>{label}</button>
            ))}
          </div>
        </div>

        {error && <p className="auth-message auth-error">{error}</p>}
        <button type="button" className="primary-button" disabled={busy} onClick={generate}>
          {busy ? 'Reading and building...' : 'Create project'}
        </button>
      </article>

      <article className="sub-panel creative-brief-result">
        <div>
          <p className="section-label">Generated project</p>
          <h3>{project?.title || 'Your creative will appear here'}</h3>
        </div>
        {!project && <p className="muted">Combine several files into one grounded brief, then create an editable visual, video plan, or post package.</p>}
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