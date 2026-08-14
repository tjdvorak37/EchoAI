import { useRef, useState } from 'react'
import { buildCreativeProject, readBriefFile } from '../services/documentBriefService'

const ACCEPTED_FILES = '.pdf,.docx,.pptx,.xlsx,.csv,.json,.txt,.md,image/*,video/*'

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function CreativeBrief({ agentConfig, onEditProject, onUseDraft }) {
  const [sources, setSources] = useState([])
  const [instruction, setInstruction] = useState('Create a polished campaign flyer based on this information.')
  const [outputType, setOutputType] = useState('flyer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [project, setProject] = useState(null)
  const inputRef = useRef(null)

  const addFiles = async (files) => {
    setError('')
    const nextFiles = Array.from(files)
    if (!nextFiles.length) return
    setBusy(true)
    try {
      const parsed = await Promise.all(nextFiles.map(readBriefFile))
      setSources((current) => [...current, ...parsed.filter((item) => !current.some((source) => source.id === item.id))])
    } catch (readError) {
      setError(readError.message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
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

  return (
    <div className="creative-brief-layout">
      <article className="sub-panel creative-brief-builder">
        <div>
          <p className="section-label">Source material</p>
          <h3>Build from your documents</h3>
        </div>

        <label
          className="brief-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            addFiles(event.dataTransfer.files)
          }}
        >
          <strong>Add campaign files</strong>
          <span>PowerPoint, Word, Excel, PDF, text, images, or video</span>
          <input ref={inputRef} type="file" accept={ACCEPTED_FILES} multiple onChange={(event) => addFiles(event.target.files)} />
        </label>

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
              <button type="button" className="ghost-button" onClick={() => onUseDraft(project)}>Use copy in scheduler</button>
            </div>
          </>
        )}
      </article>
    </div>
  )
}