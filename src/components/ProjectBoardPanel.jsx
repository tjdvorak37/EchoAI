import { useEffect, useMemo, useState } from 'react'
import { projectBoardService } from '../services/projectBoardService'

const STAFF_ROLES = ['admin', 'manager', 'it', 'accountant', 'board_member']
const PROJECT_COLUMNS = [
  { id: 'planned', label: 'Planned' },
  { id: 'working', label: 'Working' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]
const TASK_COLUMNS = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
]

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : 'No due date'

export function ProjectBoardPanel({ currentUser, teamMembers = [] }) {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [projectDraft, setProjectDraft] = useState({ title: '', summary: '', priority: 'medium', ownerId: '', dueAt: '' })
  const [taskDraft, setTaskDraft] = useState({ title: '', assigneeId: '' })
  const [noteDraft, setNoteDraft] = useState('')
  const [status, setStatus] = useState({ loading: true, saving: false, error: '', message: '' })

  const staffMembers = teamMembers.filter((member) => STAFF_ROLES.includes(member.role))
  const activeProject = projects.find((project) => project.id === activeProjectId) || projects[0] || null
  const activeProjectTasks = tasks.filter((task) => task.projectId === activeProject?.id)
  const activeProjectNotes = notes.filter((note) => note.projectId === activeProject?.id)
  const canApproveCompletion = ['admin', 'manager'].includes(currentUser?.role)

  const projectCounts = useMemo(() => PROJECT_COLUMNS.reduce((counts, column) => {
    counts[column.id] = projects.filter((project) => project.status === column.id).length
    return counts
  }, {}), [projects])

  useEffect(() => {
    let active = true
    projectBoardService.list().then((result) => {
      if (!active) return
      setProjects(result.projects)
      setTasks(result.tasks)
      setNotes(result.notes)
      setActiveProjectId(result.projects[0]?.id || '')
      setStatus({ loading: false, saving: false, error: '', message: '' })
    }).catch((error) => {
      if (active) setStatus({ loading: false, saving: false, error: error.message, message: '' })
    })
    return () => { active = false }
  }, [])

  const getMemberName = (memberId) => {
    const member = staffMembers.find((item) => item.id === memberId)
    return member?.fullName || member?.email || ''
  }

  const saveProject = async (event) => {
    event.preventDefault()
    setStatus((current) => ({ ...current, saving: true, error: '', message: '' }))
    try {
      const created = await projectBoardService.createProject({
        ...projectDraft,
        ownerName: getMemberName(projectDraft.ownerId),
        currentUser,
      })
      setProjects((current) => [created, ...current])
      setActiveProjectId(created.id)
      setProjectDraft({ title: '', summary: '', priority: 'medium', ownerId: '', dueAt: '' })
      setStatus({ loading: false, saving: false, error: '', message: 'Project created.' })
    } catch (error) {
      setStatus((current) => ({ ...current, saving: false, error: error.message, message: '' }))
    }
  }

  const updateProject = async (projectId, patch) => {
    setStatus((current) => ({ ...current, error: '', message: '' }))
    try {
      const updated = await projectBoardService.updateProject(projectId, patch)
      setProjects((current) => current.map((project) => project.id === projectId ? updated : project))
    } catch (error) {
      setStatus((current) => ({ ...current, error: error.message }))
    }
  }

  const addTask = async (event) => {
    event.preventDefault()
    if (!activeProject) return
    setStatus((current) => ({ ...current, saving: true, error: '', message: '' }))
    try {
      const created = await projectBoardService.createTask({
        projectId: activeProject.id,
        title: taskDraft.title,
        assigneeId: taskDraft.assigneeId,
        assigneeName: getMemberName(taskDraft.assigneeId),
        currentUser,
      })
      setTasks((current) => [...current, created])
      setTaskDraft({ title: '', assigneeId: '' })
      setStatus({ loading: false, saving: false, error: '', message: 'Task added.' })
    } catch (error) {
      setStatus((current) => ({ ...current, saving: false, error: error.message, message: '' }))
    }
  }

  const updateTask = async (taskId, patch) => {
    setStatus((current) => ({ ...current, error: '', message: '' }))
    try {
      const updated = await projectBoardService.updateTask(taskId, patch)
      setTasks((current) => current.map((task) => task.id === taskId ? updated : task))
    } catch (error) {
      setStatus((current) => ({ ...current, error: error.message }))
    }
  }

  const addNote = async (event) => {
    event.preventDefault()
    if (!activeProject) return
    setStatus((current) => ({ ...current, saving: true, error: '', message: '' }))
    try {
      const created = await projectBoardService.addNote({ projectId: activeProject.id, body: noteDraft, currentUser })
      setNotes((current) => [created, ...current])
      setNoteDraft('')
      setStatus({ loading: false, saving: false, error: '', message: 'Project note added.' })
    } catch (error) {
      setStatus((current) => ({ ...current, saving: false, error: error.message, message: '' }))
    }
  }

  if (status.loading) return <p className="muted">Loading project board...</p>

  return (
    <div className="it-overview">
      {status.error && <p className="auth-message auth-error">{status.error}</p>}
      {status.message && <p className="auth-message">{status.message}</p>}

      <div className="it-stat-grid">
        {PROJECT_COLUMNS.map((column) => (
          <div key={column.id} className="it-stat-card">
            <span className="it-stat-val">{projectCounts[column.id] || 0}</span>
            <span className="it-stat-label">{column.label}</span>
          </div>
        ))}
      </div>

      <div className="it-section">
        <h3 className="it-section-title">Create project</h3>
        <form className="auth-form" onSubmit={saveProject}>
          <label>Project title<input value={projectDraft.title} onChange={(event) => setProjectDraft((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>Summary<textarea rows="3" value={projectDraft.summary} onChange={(event) => setProjectDraft((current) => ({ ...current, summary: event.target.value }))} /></label>
          <label>Priority<select value={projectDraft.priority} onChange={(event) => setProjectDraft((current) => ({ ...current, priority: event.target.value }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          <label>Owner<select value={projectDraft.ownerId} onChange={(event) => setProjectDraft((current) => ({ ...current, ownerId: event.target.value }))}><option value="">Unassigned</option>{staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}</select></label>
          <label>Due date<input type="date" value={projectDraft.dueAt} onChange={(event) => setProjectDraft((current) => ({ ...current, dueAt: event.target.value }))} /></label>
          <button type="submit" className="primary-button" disabled={status.saving}>{status.saving ? 'Creating...' : 'Create project'}</button>
        </form>
      </div>

      <div className="it-section">
        <h3 className="it-section-title">Project board</h3>
        {projects.length === 0 ? <p className="muted">No projects yet.</p> : (
          <div className="it-ticket-stats" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', alignItems: 'stretch' }}>
            {PROJECT_COLUMNS.map((column) => (
              <div key={column.id} className="it-verify-block" style={{ display: 'grid', gap: '0.65rem', alignContent: 'start' }}>
                <strong>{column.label}</strong>
                {projects.filter((project) => project.status === column.id).map((project) => (
                  <button key={project.id} type="button" className={activeProject?.id === project.id ? 'primary-button' : 'ghost-button'} style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => setActiveProjectId(project.id)}>
                    {project.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeProject && (
        <div className="it-section">
          <h3 className="it-section-title">{activeProject.title}</h3>
          <p className="muted">{activeProject.summary || 'No summary yet.'}</p>
          <div className="it-ticket-meta-grid">
            <div><span>Status</span><strong>{activeProject.status}</strong></div>
            <div><span>Priority</span><strong>{activeProject.priority}</strong></div>
            <div><span>Owner</span><strong>{activeProject.ownerName || 'Unassigned'}</strong></div>
            <div><span>Due</span><strong>{formatDate(activeProject.dueAt)}</strong></div>
          </div>

          <div className="it-ticket-actions-inline">
            <select value={activeProject.status} onChange={(event) => updateProject(activeProject.id, { status: event.target.value })}>
              {PROJECT_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
            </select>
            <select value={activeProject.ownerId} onChange={(event) => updateProject(activeProject.id, { ownerId: event.target.value, ownerName: getMemberName(event.target.value) })}>
              <option value="">Unassigned</option>
              {staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}
            </select>
            {!activeProject.completionRequestedAt && activeProject.status !== 'done' && (
              <button type="button" className="ghost-button" onClick={() => updateProject(activeProject.id, { status: 'review', completionRequestedAt: new Date().toISOString() })}>Request completion review</button>
            )}
            {activeProject.completionRequestedAt && !activeProject.completionApprovedAt && canApproveCompletion && (
              <button type="button" className="primary-button" onClick={() => updateProject(activeProject.id, { status: 'done', completionApprovedAt: new Date().toISOString() })}>Approve completion</button>
            )}
          </div>

          <div className="it-section" style={{ marginTop: '1rem' }}>
            <h3 className="it-section-title">Tasks</h3>
            <form className="composer" onSubmit={addTask}>
              <label>Task<input value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Assignee<select value={taskDraft.assigneeId} onChange={(event) => setTaskDraft((current) => ({ ...current, assigneeId: event.target.value }))}><option value="">Unassigned</option>{staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}</select></label>
              <button type="submit" className="primary-button" disabled={status.saving}>Add task</button>
            </form>

            <div className="it-ticket-stats" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', alignItems: 'stretch' }}>
              {TASK_COLUMNS.map((column) => (
                <div key={column.id} className="it-verify-block" style={{ display: 'grid', gap: '0.65rem', alignContent: 'start' }}>
                  <strong>{column.label}</strong>
                  {activeProjectTasks.filter((task) => task.status === column.id).map((task) => (
                    <div key={task.id} className="it-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <p>{task.title}</p>
                      <span>{task.assigneeName || 'Unassigned'}</span>
                      <select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })}>
                        {TASK_COLUMNS.map((taskColumn) => <option key={taskColumn.id} value={taskColumn.id}>{taskColumn.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="it-section" style={{ marginTop: '1rem' }}>
            <h3 className="it-section-title">Project notes</h3>
            <form className="composer" onSubmit={addNote}>
              <label>Note<textarea rows="3" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /></label>
              <button type="submit" className="primary-button" disabled={status.saving}>Add note</button>
            </form>
            {activeProjectNotes.length === 0 ? <p className="muted">No notes yet.</p> : activeProjectNotes.map((note) => (
              <div key={note.id} className="it-row">
                <div>
                  <p>{note.authorName}</p>
                  <span>{new Date(note.createdAt).toLocaleString()}</span>
                  <p className="muted" style={{ marginTop: '0.45rem', whiteSpace: 'pre-wrap' }}>{note.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}