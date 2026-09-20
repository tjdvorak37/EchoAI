import test from 'node:test'
import assert from 'node:assert/strict'

import { canManageBrandKit } from './brandPermissions.js'

test('standard users cannot manage the company brand kit', () => {
  assert.equal(canManageBrandKit({ id: 'user-1', role: 'user' }), false)
})

test('admins can manage the brand kit', () => {
  assert.equal(canManageBrandKit({ id: 'admin-1', role: 'admin' }), true)
})

test('managers can manage the brand kit', () => {
  assert.equal(canManageBrandKit({ id: 'manager-1', role: 'manager' }), true)
})

test('logged-out users cannot manage the brand kit', () => {
  assert.equal(canManageBrandKit(null), false)
})
