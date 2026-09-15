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

const formatDateTime = (value) => value ? new Date(value).toLocaleString() : 'Never'

const brief = (value, max = 92) => {
  const text = String(value || '').trim()
  if (!text) return 'No summary yet.'
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function StatusPill({ value }) {
  return <span className={`project-status-pill project-status-${value}`}>{value}</span>
}

export function ProjectBoardPanel({ currentUser, teamMembers = [] }) {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [workspaceProjectId, setWorkspaceProjectId] = useState('')
  const [projectDraft, setProjectDraft] = useState({ title: '', summary: '', priority: 'medium', ownerId: '', dueAt: '' })
  const [taskDraft, setTaskDraft] = useState({ title: '', assigneeId: '' })
  const [noteDraft, setNoteDraft] = useState('')
  const [filter, setFilter] = useState({ view: 'all', status: 'all' })
  const [status, setStatus] = useState({ loading: true, saving: false, error: '', message: '' })

  const staffMembers = teamMembers.filter((member) => STAFF_ROLES.includes(member.role))
  const canApproveCompletion = ['admin', 'manager'].includes(currentUser?.role)
  const workspaceOpen = Boolean(workspaceProjectId)

  const getMemberName = (memberId) => {
    const member = staffMembers.find((item) => item.id === memberId)
    return member?.fullName || member?.email || ''
  }

  const tasksByProject = useMemo(() => tasks.reduce((groups, task) => {
    groups[task.projectId] = groups[task.projectId] || []
    groups[task.projectId].push(task)
    return groups
  }, {}), [tasks])

  const notesByProject = useMemo(() => notes.reduce((groups, note) => {
    groups[note.projectId] = groups[note.projectId] || []
    groups[note.projectId].push(note)
    return groups
  }, {}), [notes])

  const filteredProjects = useMemo(() => projects.filter((project) => {
    if (filter.status !== 'all' && project.status !== filter.status) return false
    if (filter.view === 'mine' && project.ownerId !== currentUser?.id) return false
    if (filter.view === 'unassigned' && project.ownerId) return false
    return true
  }), [currentUser?.id, filter.status, filter.view, projects])

  const selectedProject = projects.find((project) => project.id === selectedProjectId)
    || filteredProjects[0]
    || projects[0]
    || null
  const workspaceProject = projects.find((project) => project.id === workspaceProjectId) || selectedProject
  const activeProject = workspaceOpen ? workspaceProject : selectedProject
  const activeProjectTasks = tasksByProject[activeProject?.id] || []
  const activeProjectNotes = notesByProject[activeProject?.id] || []
  const myProjectCount = projects.filter((project) => project.ownerId === currentUser?.id).length
  const workingCount = projects.filter((project) => project.status === 'working').length
  const openCount = projects.filter((project) => project.status !== 'done').length

  useEffect(() => {
    let active = true
    projectBoardService.list().then((result) => {
      if (!active) return
      setProjects(result.projects)
      setTasks(result.tasks)
      setNotes(result.notes)
      setSelectedProjectId(result.projects[0]?.id || '')
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
      setSelectedProjectId(created.id)
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
    if (!workspaceProject) return
    setStatus((current) => ({ ...current, saving: true, error: '', message: '' }))
    try {
      const created = await projectBoardService.createTask({
        projectId: workspaceProject.id,
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
    if (!workspaceProject) return
    setStatus((current) => ({ ...current, saving: true, error: '', message: '' }))
    try {
      const created = await projectBoardService.addNote({ projectId: workspaceProject.id, body: noteDraft, currentUser })
      setNotes((current) => [created, ...current])
      setNoteDraft('')
      setStatus({ loading: false, saving: false, error: '', message: 'Project note added.' })
    } catch (error) {
      setStatus((current) => ({ ...current, saving: false, error: error.message, message: '' }))
    }
  }

  if (status.loading) return <p className="muted">Loading project board...</p>

  return (
    <div className="project-workspace-page sms-project-workspace">
      {(status.error || status.message) && <div className={`workspace-feedback ${status.error ? 'auth-error' : ''}`}>{status.error || status.message}</div>}

      <div className="project-workspace-shell">
        <div className="workspace-tabs project-workspace-tabs">
          <button type="button" className={`workspace-tab ${!workspaceOpen ? 'workspace-tab-active' : ''}`} onClick={() => setWorkspaceProjectId('')}>Queue</button>
          {workspaceOpen && workspaceProject && <button type="button" className="workspace-tab workspace-tab-active">{workspaceProject.title}</button>}
          <button type="button" className="workspace-reset-btn" onClick={() => { setWorkspaceProjectId(''); setFilter({ view: 'all', status: 'all' }) }}>Reset Workspace</button>
        </div>

        <div className="project-workspace-body">
          <aside className="workspace-pane project-workspace-left">
            <div className="workspace-pane-header"><strong>{workspaceOpen ? 'Project Controls' : 'Filters'}</strong></div>
            <div className="workspace-pane-content workspace-block-stack">
              {!workspaceOpen && <section className="workspace-block">
                <div className="project-filter-stat"><span>Total</span><strong>{projects.length}</strong></div>
                <div className="project-filter-stat"><span>Open</span><strong>{openCount}</strong></div>
                <div className="project-filter-stat"><span>Working</span><strong>{workingCount}</strong></div>
                <div className="project-filter-stat"><span>Mine</span><strong>{myProjectCount}</strong></div>
                <div className="workspace-field-grid">
                  <label>View<select value={filter.view} onChange={(event) => setFilter((current) => ({ ...current, view: event.target.value }))}><option value="all">All projects</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
                  <label>Status<select value={filter.status} onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value }))}><option value="all">All statuses</option>{PROJECT_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
                </div>
              </section>}

              {workspaceOpen && workspaceProject && <section className="workspace-block">
                <h2>{workspaceProject.title}</h2>
                <div className="workspace-field-grid">
                  <label>Status<select value={workspaceProject.status} onChange={(event) => updateProject(workspaceProject.id, { status: event.target.value })}>{PROJECT_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
                  <label>Priority<select value={workspaceProject.priority} onChange={(event) => updateProject(workspaceProject.id, { priority: event.target.value })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
                  <label>Owner<select value={workspaceProject.ownerId} onChange={(event) => updateProject(workspaceProject.id, { ownerId: event.target.value, ownerName: getMemberName(event.target.value) })}><option value="">Unassigned</option>{staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}</select></label>
                </div>
                {!workspaceProject.completionRequestedAt && workspaceProject.status !== 'done' && <button type="button" className="ghost-button" onClick={() => updateProject(workspaceProject.id, { status: 'review', completionRequestedAt: new Date().toISOString() })}>Request completion review</button>}
                {workspaceProject.completionRequestedAt && !workspaceProject.completionApprovedAt && canApproveCompletion && <button type="button" className="primary-button" onClick={() => updateProject(workspaceProject.id, { status: 'done', completionApprovedAt: new Date().toISOString() })}>Approve completion</button>}
              </section>}
            </div>
          </aside>

          <main className="workspace-pane project-workspace-center">
            <div className="workspace-pane-header"><strong>{workspaceOpen ? workspaceProject?.title || 'Project Workspace' : 'Main Project List'}</strong><span>{workspaceOpen ? `${activeProjectTasks.length} tasks` : `${filteredProjects.length} projects`}</span></div>
            <div className="workspace-pane-content workspace-pane-content-center">
              {!workspaceOpen && <div className="workspace-table-wrap project-main-list">
                <table>
                  <thead><tr><th>Status</th><th>Project</th><th>Scope</th><th>Owner</th><th>Updated</th><th>Actions</th></tr></thead>
                  <tbody>{filteredProjects.map((project) => {
                    const projectTasks = tasksByProject[project.id] || []
                    return <tr key={project.id} className={selectedProject?.id === project.id ? 'workspace-row-selected' : ''} onClick={() => setSelectedProjectId(project.id)}><td><StatusPill value={project.status} /></td><td><strong>{project.title}</strong><span>{project.id}</span><em>{projectTasks.length} tasks</em></td><td>{brief(project.summary, 96)}</td><td>{project.ownerName || 'Unassigned'}</td><td>{formatDateTime(project.updatedAt)}</td><td><button type="button" className="primary-button" onClick={(event) => { event.stopPropagation(); setSelectedProjectId(project.id); setWorkspaceProjectId(project.id) }}>Open Workspace</button></td></tr>
                  })}</tbody>
                </table>
                {filteredProjects.length === 0 && <p className="muted project-empty-state">No projects match this view.</p>}
              </div>}

              {workspaceOpen && workspaceProject && <div className="project-detail-workspace">
                <div className="project-meta-strip"><span>{brief(workspaceProject.summary, 180)}</span><StatusPill value={workspaceProject.status} /></div>
                <div className="project-kanban-grid">{TASK_COLUMNS.map((column) => <section key={column.id} className="project-kanban-column"><header><strong>{column.label}</strong><span>{activeProjectTasks.filter((task) => task.status === column.id).length}</span></header><div className="project-task-stack">{activeProjectTasks.filter((task) => task.status === column.id).map((task) => <article key={task.id} className="task-card project-task-card"><div className="task-head"><strong>{task.title}</strong></div><span>{task.assigneeName || 'Unassigned'}</span><select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })}>{TASK_COLUMNS.map((taskColumn) => <option key={taskColumn.id} value={taskColumn.id}>{taskColumn.label}</option>)}</select></article>)}</div></section>)}</div>
              </div>}
            </div>
          </main>

          <aside className="workspace-pane project-workspace-right">
            <div className="workspace-pane-header"><strong>{workspaceOpen ? 'Create and notes' : 'Project Snapshot'}</strong></div>
            <div className="workspace-pane-content workspace-block-stack">
              {!workspaceOpen && selectedProject && <section className="workspace-block project-snapshot-card"><h2>{selectedProject.title}</h2><p className="muted">{selectedProject.id}</p><p>{selectedProject.summary || 'No summary yet.'}</p><div className="project-snapshot-grid"><div><span>Tasks</span><strong>{activeProjectTasks.length}</strong></div><div><span>Updates</span><strong>{activeProjectNotes.length}</strong></div><div><span>Files</span><strong>0</strong></div></div><p className="muted">Owner: {selectedProject.ownerName || 'Unassigned'}</p><p className="muted">Created: {formatDateTime(selectedProject.createdAt)}</p><button type="button" className="primary-button" onClick={() => setWorkspaceProjectId(selectedProject.id)}>Open Workspace</button></section>}
              {!workspaceOpen && !selectedProject && <section className="workspace-block"><h2>No project selected</h2><p className="muted">Create a project or select one from the list.</p></section>}

              {workspaceOpen && workspaceProject && <>
                <section className="workspace-block"><h2>Add task</h2><form className="workspace-field-grid" onSubmit={addTask}><label>Task<input value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>Assignee<select value={taskDraft.assigneeId} onChange={(event) => setTaskDraft((current) => ({ ...current, assigneeId: event.target.value }))}><option value="">Unassigned</option>{staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}</select></label><button type="submit" className="primary-button" disabled={status.saving}>Add task</button></form></section>
                <section className="workspace-block"><h2>Project notes</h2><form className="workspace-field-grid" onSubmit={addNote}><label>Note<textarea rows="4" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /></label><button type="submit" className="primary-button" disabled={status.saving}>Add note</button></form><div className="task-notes-list">{activeProjectNotes.length === 0 ? <p className="muted">No notes yet.</p> : activeProjectNotes.map((note) => <article key={note.id} className="task-note-item"><strong>{note.authorName}</strong><small>{formatDateTime(note.createdAt)}</small><p>{note.body}</p></article>)}</div></section>
              </>}

              <section className="workspace-block"><h2>New Project</h2><form className="workspace-field-grid" onSubmit={saveProject}><label>Title<input value={projectDraft.title} onChange={(event) => setProjectDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>Summary<textarea rows="3" value={projectDraft.summary} onChange={(event) => setProjectDraft((current) => ({ ...current, summary: event.target.value }))} /></label><label>Priority<select value={projectDraft.priority} onChange={(event) => setProjectDraft((current) => ({ ...current, priority: event.target.value }))}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label><label>Owner<select value={projectDraft.ownerId} onChange={(event) => setProjectDraft((current) => ({ ...current, ownerId: event.target.value }))}><option value="">Unassigned</option>{staffMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName || member.email}</option>)}</select></label><label>Due<input type="date" value={projectDraft.dueAt} onChange={(event) => setProjectDraft((current) => ({ ...current, dueAt: event.target.value }))} /></label><button type="submit" className="primary-button" disabled={status.saving}>{status.saving ? 'Creating...' : 'Create project'}</button></form></section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}