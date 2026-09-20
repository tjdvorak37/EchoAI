import { isSupabaseConfigured, supabase } from '../lib/supabase'

const PROJECT_STATUSES = ['planned', 'working', 'review', 'done']
const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done']

const normalizeProject = (record) => ({
  id: record.id,
  title: record.title,
  summary: record.summary || '',
  status: record.status || 'planned',
  priority: record.priority || 'medium',
  ownerId: record.owner_id || '',
  ownerName: record.owner_name || '',
  dueAt: record.due_at || '',
  completionRequestedAt: record.completion_requested_at || '',
  completionApprovedAt: record.completion_approved_at || '',
  createdAt: record.created_at,
  updatedAt: record.updated_at,
})

const normalizeTask = (record) => ({
  id: record.id,
  projectId: record.project_id,
  title: record.title,
  status: record.status || 'todo',
  assigneeId: record.assignee_id || '',
  assigneeName: record.assignee_name || '',
  createdAt: record.created_at,
  updatedAt: record.updated_at,
})

const normalizeNote = (record) => ({
  id: record.id,
  projectId: record.project_id,
  authorId: record.author_id,
  authorName: record.author_name || 'Staff',
  body: record.body,
  createdAt: record.created_at,
})

const getCurrentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign in before using the project board.')
  return data.user
}

export const projectBoardService = {
  async list() {
    if (!isSupabaseConfigured) return { projects: [], tasks: [], notes: [] }

    const [{ data: projects, error: projectsError }, { data: tasks, error: tasksError }, { data: notes, error: notesError }] = await Promise.all([
      supabase.from('internal_projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('internal_project_tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('internal_project_notes').select('*').order('created_at', { ascending: false }).limit(100),
    ])

    if (projectsError) throw new Error(projectsError.message)
    if (tasksError) throw new Error(tasksError.message)
    if (notesError) throw new Error(notesError.message)

    return {
      projects: (projects || []).map(normalizeProject),
      tasks: (tasks || []).map(normalizeTask),
      notes: (notes || []).map(normalizeNote),
    }
  },

  async createProject({ title, summary, priority, ownerId, ownerName, dueAt, currentUser }) {
    const cleanedTitle = title.trim()
    if (!cleanedTitle) throw new Error('Add a project title.')
    if (!isSupabaseConfigured) {
      return normalizeProject({
        id: `project-${Date.now()}`,
        title: cleanedTitle,
        summary,
        priority,
        status: 'planned',
        owner_id: ownerId,
        owner_name: ownerName,
        due_at: dueAt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    const user = await getCurrentUser()
    const { data, error } = await supabase.from('internal_projects').insert({
      created_by: user.id,
      created_by_name: currentUser?.fullName || currentUser?.email || user.email || 'Staff',
      title: cleanedTitle.slice(0, 160),
      summary: summary.trim().slice(0, 3000),
      priority,
      owner_id: ownerId || null,
      owner_name: ownerName || '',
      due_at: dueAt || null,
    }).select('*').single()

    if (error) throw new Error(error.message)
    return normalizeProject(data)
  },

  async updateProject(projectId, patch) {
    if (!projectId) throw new Error('Choose a project to update.')
    const update = {}
    if (patch.status && PROJECT_STATUSES.includes(patch.status)) update.status = patch.status
    if (patch.priority) update.priority = patch.priority
    if (patch.ownerId !== undefined) update.owner_id = patch.ownerId || null
    if (patch.ownerName !== undefined) update.owner_name = patch.ownerName || ''
    if (patch.dueAt !== undefined) update.due_at = patch.dueAt || null
    if (patch.completionRequestedAt !== undefined) update.completion_requested_at = patch.completionRequestedAt || null
    if (patch.completionApprovedAt !== undefined) update.completion_approved_at = patch.completionApprovedAt || null
    if (!Object.keys(update).length) throw new Error('Choose a project field to update.')
    update.updated_at = new Date().toISOString()

    if (!isSupabaseConfigured) return normalizeProject({ id: projectId, ...update })

    const { data, error } = await supabase.from('internal_projects').update(update).eq('id', projectId).select('*').single()
    if (error) throw new Error(error.message)
    return normalizeProject(data)
  },

  async createTask({ projectId, title, assigneeId, assigneeName, currentUser }) {
    const cleanedTitle = title.trim()
    if (!projectId || !cleanedTitle) throw new Error('Choose a project and add a task title.')
    if (!isSupabaseConfigured) {
      return normalizeTask({ id: `task-${Date.now()}`, project_id: projectId, title: cleanedTitle, status: 'todo', assignee_id: assigneeId, assignee_name: assigneeName, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    }

    const user = await getCurrentUser()
    const { data, error } = await supabase.from('internal_project_tasks').insert({
      project_id: projectId,
      created_by: user.id,
      created_by_name: currentUser?.fullName || currentUser?.email || user.email || 'Staff',
      title: cleanedTitle.slice(0, 240),
      assignee_id: assigneeId || null,
      assignee_name: assigneeName || '',
    }).select('*').single()

    if (error) throw new Error(error.message)
    return normalizeTask(data)
  },

  async updateTask(taskId, patch) {
    if (!taskId) throw new Error('Choose a task to update.')
    const update = {}
    if (patch.status && TASK_STATUSES.includes(patch.status)) update.status = patch.status
    if (patch.assigneeId !== undefined) update.assignee_id = patch.assigneeId || null
    if (patch.assigneeName !== undefined) update.assignee_name = patch.assigneeName || ''
    if (!Object.keys(update).length) throw new Error('Choose a task field to update.')
    update.updated_at = new Date().toISOString()

    if (!isSupabaseConfigured) return normalizeTask({ id: taskId, ...update })

    const { data, error } = await supabase.from('internal_project_tasks').update(update).eq('id', taskId).select('*').single()
    if (error) throw new Error(error.message)
    return normalizeTask(data)
  },

  async addNote({ projectId, body, currentUser }) {
    const cleanedBody = body.trim()
    if (!projectId || !cleanedBody) throw new Error('Choose a project and add a note.')
    if (!isSupabaseConfigured) {
      return normalizeNote({ id: `note-${Date.now()}`, project_id: projectId, author_id: currentUser?.id, author_name: currentUser?.fullName || currentUser?.email || 'Staff', body: cleanedBody, created_at: new Date().toISOString() })
    }

    const user = await getCurrentUser()
    const { data, error } = await supabase.from('internal_project_notes').insert({
      project_id: projectId,
      author_id: user.id,
      author_name: currentUser?.fullName || currentUser?.email || user.email || 'Staff',
      body: cleanedBody.slice(0, 3000),
    }).select('*').single()
    if (error) throw new Error(error.message)
    return normalizeNote(data)
  },
}