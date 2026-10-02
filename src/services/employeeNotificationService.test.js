import assert from 'node:assert/strict'
import test from 'node:test'
import { isEmployee, toEmployeeNotification, watchEmployeeNotifications } from './employeeNotificationService.js'

test('only employee roles receive alerts', () => {
  for (const role of ['admin', 'super_admin', 'it', 'accountant']) assert.equal(isEmployee(role), true)
  for (const role of ['user', 'partner', 'board_member', undefined]) {
    assert.equal(isEmployee(role), false)
    assert.equal(toEmployeeNotification('support_tickets', { id: 'ticket' }, 'me', role), null)
  }
})

test('private messages only notify the recipient, never the sender', () => {
  const message = { id: 'msg', sender_id: 'sender', recipient_id: 'me', channel_type: 'direct' }
  assert.equal(toEmployeeNotification('internal_forum_messages', message, 'other', 'it'), null)
  assert.equal(toEmployeeNotification('internal_forum_messages', message, 'sender', 'it'), null)
  assert.equal(toEmployeeNotification('internal_forum_messages', message, 'me', 'it').destination, 'chat')
})

test('forum posts and group messages notify teammates, not their author', () => {
  const post = { id: 'post', author_id: 'me', title: 'Update' }
  assert.equal(toEmployeeNotification('internal_forum_posts', post, 'me', 'it'), null)
  assert.equal(toEmployeeNotification('internal_forum_posts', post, 'other', 'accountant').destination, 'posts')
  const message = { id: 'msg', sender_id: 'other', channel_type: 'group' }
  assert.equal(toEmployeeNotification('internal_forum_messages', message, 'me', 'it').title, 'New staff message')
})

test('tickets route to support and are excluded for accounting', () => {
  const ticket = { id: 'ticket', subject: 'Help' }
  assert.equal(toEmployeeNotification('support_tickets', ticket, 'me', 'it').recordId, 'ticket')
  assert.equal(toEmployeeNotification('support_tickets', ticket, 'me', 'accountant'), null)
})

test('watcher paginates, deduplicates, catches up on focus, and cleans up', async () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const listeners = new Map()
  let removedChannel = false
  let clearedTimer = false
  globalThis.window = {
    setInterval(callback, delay) { assert.equal(delay, 10000); listeners.set('poll', callback); return 1 },
    clearInterval() { clearedTimer = true },
    addEventListener(name, callback) { listeners.set(name, callback) },
    removeEventListener(name) { listeners.delete(name) },
  }
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  const since = '2026-10-02T00:00:00.000Z'
  const rows = Array.from({ length: 105 }, (_, index) => ({ id: `ticket-${index}`, created_at: `2026-10-02T00:01:${String(Math.floor(index / 10)).padStart(2, '0')}.000+00:00` }))
  const received = []
  let checkpoint
  let completed
  let completion = new Promise((resolve) => { completed = resolve })
  const client = {
    from(table) {
      let cursor
      return {
        select() { return this },
        gte(field, value) { cursor = value; return this },
        order() { return this },
        range(start, end) { return Promise.resolve({ data: table === 'support_tickets' ? rows.filter((row) => Date.parse(row.created_at) >= Date.parse(cursor)).slice(start, end + 1) : [], error: null }) },
      }
    },
    channel() { return { on() { return this }, subscribe() {} } },
    removeChannel() { removedChannel = true },
  }
  let stop
  try {
    stop = watchEmployeeNotifications({ client, userId: 'me', role: 'it', since, onNotification: (alert) => received.push(alert), onCheckpoint: (value) => { checkpoint = value; completed() } })
    await completion
    assert.equal(received.length, 105)
    assert.equal(checkpoint.checkpoints.support_tickets, rows.at(-1).created_at)
    completion = new Promise((resolve) => { completed = resolve })
    listeners.get('poll')()
    await completion
    assert.equal(received.length, 105)
    rows.push({ id: 'new-ticket', created_at: '2026-10-02T00:02:00.000+00:00' })
    completion = new Promise((resolve) => { completed = resolve })
    listeners.get('focus')()
    await completion
    assert.equal(received.length, 106)
    assert.equal(received.at(-1).recordId, 'new-ticket')
    stop()
    assert.equal(removedChannel, true)
    assert.equal(clearedTimer, true)
    assert.equal(listeners.has('focus'), false)
  } finally {
    stop?.()
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})

test('customer accounts do not create a watcher or query the backend', () => {
  const stop = watchEmployeeNotifications({ client: { from() { assert.fail('Customers must not query employee data') } }, userId: 'customer', role: 'user' })
  assert.equal(typeof stop, 'function')
  stop()
})