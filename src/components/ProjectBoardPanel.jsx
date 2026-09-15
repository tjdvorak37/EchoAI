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
const PRIORITIES = ['low', 'medium', 'high', 'critical']

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : 'No due date'

const brief = (value, max = 92) => {
  const text = String(value || '').trim()
  if (!text) return 'No summary yet.'
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

export function ProjectBoardPanel({ currentUser, teamMembers = [] }) {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [projectDraft, setProjectDraft] = useState({ title: '', summary: '', priority: 'medium', ownerId: '', dueAt: '' })
  const [taskDraft, setTaskDraft] = useState({ title: '', assigneeId: '' })
  const [noteDraft, setNoteDraft] = useState('')
  const [filter, setFilter] = useState({ view: 'all', status: 'all' })
  const [status, setStatus] = useState({ loading: true, saving: false, error: '', message: '' })

  const staffMembers = teamMembers.filter((member) => STAFF_ROLES.includes(member.role))
  const canApproveCompletion = ['admin', 'manager'].includes(currentUser?.role)

  const getMemberName = (memberId) => {
    const member = staffMembers.find((item) => item.id === memberId)
    return member?.fullName || member?.email || ''
  }

  const tasksByProject = useMemo(() => tasks.reduce((groups, task) => {
    groups[task.projectId] = groups[task.projectId] || []
    groups[task.projectId].push(task)
    return groups
  }, {}), [tasks])

  const filteredProjects = useMemo(() => projects.filter((project) => {
    if (filter.status !== 'all' && project.status !== filter.status) return false
    if (filter.view === 'mine' && project.ownerId !== currentUser?.id) return false
    if (filter.view === 'unassigned' && project.ownerId) return false
    return true
  }), [currentUser?.id, filter.status, filter.view, projects])

  const activeProject = filteredProjects.find((project) => project.id === activeProjectId)
    || projects.find((project) => project.id === activeProjectId)
    || filteredProjects[0]
    || projects[0]
    || null
  const activeProjectTasks = tasksByProject[activeProject?.id] || []
  const activeProjectNotes = notes.filter((note) => note.projectId === activeProject?.id)

  const myProjectCount = projects.filter((project) => project.ownerId === currentUser?.id).length

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
    <div className="project-workspace-page">
      {(status.error || status.message) && (
        <div className={`workspace-feedback ${status.error ? 'auth-error' : ''}`}>
          {status.error || status.message}
        </div>
      )}

      <div className="project-workspace-shell">
        <div className="workspace-tabs project-workspace-tabs">
          <button type="button" className="workspace-tab workspace-tab-active">Queue</button>
          <button type="button" className="workspace-tab">{activeProject ? activeProject.title : 'No project selected'}</button>
          <button type="button" className="workspace-reset-btn" onClick={() => setFilter({ view: 'all', status: 'all' })}>Reset view</button>
        </div>

        <div className="project-workspace-body">
          <aside className="workspace-pane project-workspace-left">
            <div className="workspace-pane-header">
              <strong>Project queue</strong>
              <span>{filteredProjects.length}</span>
            </div>
            <div className="workspace-pane-content workspace-block-stack">
              <div className="project-metric-row">
                <span className="project-inline-chip">All {projects.length}</span>
                <span className="project-inline-chip">Mine {myProjectCount}</span>
              </div>
              <div className="workspace-field-grid">
                <label>View<select value={filter.view} onChange={(event) => setFilter((current) => ({ ...current, view: event.target.value }))}><option value="all">All projects</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
                <label>Status<select value={filter.status} onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value }))}><option value="all">All statuses</option>{PROJECT_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
              </div>
              <div className="workspace-list project-queue-list">
                {filteredProjects.length === 0 ? <p className="muted">No projects match this view.</p> : filteredProjects.map((project) => {
                  const projectTasks = tasksByProject[project.id] || []
                  const doneTasks = projectTasks.filter((task) => task.status === 'done').length
                  return (
                    <button key={project.id} type="button" className={`project-queue-item ${activeProject?.id === project.id ? 'active' : ''}`} onClick={() => setActiveProjectId(project.id)}>
                      <span>{project.title}</span>
                      <small>{project.ownerName || 'Unassigned'} / {formatDate(project.dueAt)}</small>
                      <em>{doneTasks}/{projectTasks.length} tasks done</em>
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>

          <main className="workspace-pane project-workspace-center">
            <div className="workspace-pane-header">
              <strong>{activeProject?.title || 'Project board'}</strong>
              {activeProject && <span>{activeProject.priority}</span>}
            </div>
            <div className="workspace-pane-content workspace-pane-content-center">
              {!activeProject ? (
                <p className="muted project-empty-state">Create or select a project to begin.</p>
              ) : (
                <div className="project-detail-workspace">
                  <section className="workspace-conversation-head project-detail-head">
                    <div>
                      <h2>{activeProject.title}</h2>
                      <p>{brief(activeProject.summary, 180)}</p>
                    </div>
                    <div className="project-quick-actions">
                      <select value={activeProject.status} onChange={(event) => updateProject(activeProject.id, { status: event.target.value })}>
                        {PROJECT_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
                      </select>
                      <select value={activeProject.ownerId} onChange={(event) => updateProject(activeProject.id, { ownerId: event.target.value, ownerName: getMemberName(event.target.value) })}>
                        <option value="">Unassigned</option>
                        {staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}
                      </select>
                    </div>
                  </section>

                  <div className="project-metric-row">
                    <span className="metric-chip"><strong>{activeProject.status}</strong><small>Status</small></span>
                    <span className="metric-chip"><strong>{activeProject.ownerName || 'Unassigned'}</strong><small>Owner</small></span>
                    <span className="metric-chip"><strong>{formatDate(activeProject.dueAt)}</strong><small>Due</small></span>
                    <span className="metric-chip"><strong>{activeProjectTasks.length}</strong><small>Tasks</small></span>
                  </div>

                  <div className="project-kanban-grid">
                    {TASK_COLUMNS.map((column) => (
                      <section key={column.id} className="project-kanban-column">
                        <header><strong>{column.label}</strong><span>{activeProjectTasks.filter((task) => task.status === column.id).length}</span></header>
                        <div className="project-task-stack">
                          {activeProjectTasks.filter((task) => task.status === column.id).map((task) => (
                            <article key={task.id} className="task-card project-task-card">
                              <div className="task-head"><strong>{task.title}</strong></div>
                              <span>{task.assigneeName || 'Unassigned'}</span>
                              <select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })}>
                                {TASK_COLUMNS.map((taskColumn) => <option key={taskColumn.id} value={taskColumn.id}>{taskColumn.label}</option>)}
                              </select>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>

                  <div className="project-quick-actions">
                    {!activeProject.completionRequestedAt && activeProject.status !== 'done' && (
                      <button type="button" className="ghost-button" onClick={() => updateProject(activeProject.id, { status: 'review', completionRequestedAt: new Date().toISOString() })}>Request completion review</button>
                    )}
                    {activeProject.completionRequestedAt && !activeProject.completionApprovedAt && canApproveCompletion && (
                      <button type="button" className="primary-button" onClick={() => updateProject(activeProject.id, { status: 'done', completionApprovedAt: new Date().toISOString() })}>Approve completion</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </main>

          <aside className="workspace-pane project-workspace-right">
            <div className="workspace-pane-header"><strong>Create and notes</strong></div>
            <div className="workspace-pane-content workspace-block-stack">
              <section className="workspace-block">
                <h2>Create project</h2>
                <form className="workspace-field-grid" onSubmit={saveProject}>
                  <label>Title<input value={projectDraft.title} onChange={(event) => setProjectDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                  <label>Summary<textarea rows="3" value={projectDraft.summary} onChange={(event) => setProjectDraft((current) => ({ ...current, summary: event.target.value }))} /></label>
                  <label>Priority<select value={projectDraft.priority} onChange={(event) => setProjectDraft((current) => ({ ...current, priority: event.target.value }))}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
                  <label>Owner<select value={projectDraft.ownerId} onChange={(event) => setProjectDraft((current) => ({ ...current, ownerId: event.target.value }))}><option value="">Unassigned</option>{staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}</select></label>
                  <label>Due<input type="date" value={projectDraft.dueAt} onChange={(event) => setProjectDraft((current) => ({ ...current, dueAt: event.target.value }))} /></label>
                  <button type="submit" className="primary-button" disabled={status.saving}>{status.saving ? 'Creating...' : 'Create project'}</button>
                </form>
              </section>

              {activeProject && (
                <>
                  <section className="workspace-block">
                    <h2>Add task</h2>
                    <form className="workspace-field-grid" onSubmit={addTask}>
                      <label>Task<input value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                      <label>Assignee<select value={taskDraft.assigneeId} onChange={(event) => setTaskDraft((current) => ({ ...current, assigneeId: event.target.value }))}><option value="">Unassigned</option>{staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}</select></label>
                      <button type="submit" className="primary-button" disabled={status.saving}>Add task</button>
                    </form>
                  </section>

                  <section className="workspace-block">
                    <h2>Project notes</h2>
                    <form className="workspace-field-grid" onSubmit={addNote}>
                      <label>Note<textarea rows="4" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /></label>
                      <button type="submit" className="primary-button" disabled={status.saving}>Add note</button>
                    </form>
                    <div className="task-notes-list">
                      {activeProjectNotes.length === 0 ? <p className="muted">No notes yet.</p> : activeProjectNotes.map((note) => (
                        <article key={note.id} className="task-note-item">
                          <strong>{note.authorName}</strong>
                          <small>{new Date(note.createdAt).toLocaleString()}</small>
                          <p>{note.body}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}