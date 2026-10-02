export const isEmployee = (role) => ['admin', 'super_admin', 'it', 'accountant'].includes(String(role || '').trim().toLowerCase())

export function toEmployeeNotification(table, record, userId, role) {
  if (!isEmployee(role)) return null
  if (table === 'support_tickets') {
    if (role === 'accountant') return null
    return { id: `${table}:${record.id}`, title: 'New support ticket', detail: record.subject || 'A customer needs assistance.', destination: 'tickets', recordId: record.id, createdAt: record.created_at }
  }
  if (table === 'internal_forum_posts') {
    if (record.author_id === userId) return null
    return { id: `${table}:${record.id}`, title: 'New company forum post', detail: record.title, destination: 'posts', recordId: record.id, createdAt: record.created_at }
  }
  if (table === 'internal_forum_messages') {
    if (record.sender_id === userId) return null
    if (record.channel_type !== 'group' && record.recipient_id !== userId) return null
    return { id: `${table}:${record.id}`, title: record.channel_type === 'direct' ? 'New private message' : 'New staff message', detail: `${record.sender_name || 'A teammate'} sent a message.`, destination: 'chat', recordId: record.id, createdAt: record.created_at }
  }
  return null
}

export function watchEmployeeNotifications({ client, userId, role, since, checkpoints = {}, processed = [], onNotification, onCheckpoint, onError }) {
  if (!client || !userId || !isEmployee(role)) return () => {}
  const tables = role === 'accountant' ? ['internal_forum_posts', 'internal_forum_messages'] : ['support_tickets', 'internal_forum_posts', 'internal_forum_messages']
  const cursors = Object.fromEntries(tables.map((table) => [table, checkpoints[table] || since]))
  const seen = new Set(processed)
  let stopped = false
  let loading = false

  const refresh = async () => {
    if (stopped || loading) return
    loading = true
    try {
      await Promise.all(tables.map(async (table) => {
        let offset = 0
        let newest = cursors[table]
        let more = true
        while (more && !stopped) {
          const { data, error } = await client.from(table).select('*')
            .gte('created_at', cursors[table]).order('created_at').order('id').range(offset, offset + 99)
          if (error) throw error
          if (stopped) return
          for (const record of data || []) {
            const key = `${table}:${record.id}`
            if (!seen.has(key)) {
              seen.add(key)
              const notification = toEmployeeNotification(table, record, userId, role)
              if (notification) onNotification(notification)
            }
            if (Date.parse(record.created_at) >= Date.parse(newest)) newest = record.created_at
          }
          more = data?.length === 100
          offset += 100
        }
        cursors[table] = newest
      }))
      if (!stopped) {
        onCheckpoint?.({ checkpoints: { ...cursors }, processed: [...seen].slice(-1000) })
        onError?.('')
      }
    } catch {
      if (!stopped) onError?.('Employee alerts are reconnecting.')
    } finally {
      loading = false
    }
  }

  const channel = client.channel(`employee-alerts-${userId}`)
  for (const table of tables) channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, refresh)
  channel.subscribe()
  const interval = window.setInterval(refresh, 10000)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  refresh()
  return () => {
    stopped = true
    window.clearInterval(interval)
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
    client.removeChannel(channel)
  }
}