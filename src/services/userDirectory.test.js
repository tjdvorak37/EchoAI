import test from 'node:test'
import assert from 'node:assert/strict'
import { compareDirectoryUsers, getUserTenure, isReturningUser, matchesBetaFilter, matchesUserGroup } from './userDirectory.js'

const now = Date.parse('2026-11-03T12:00:00Z')
const memberAtAge = (days) => ({ createdAt: new Date(now - days * 86400000).toISOString() })

test('tenure groups use exact 7-day and 90-day boundaries', () => {
  for (const [days, group] of [[0, 'new'], [6.999, 'new'], [7, 'existing'], [89.999, 'existing'], [90, 'long_term'], [365, 'long_term']]) {
    assert.equal(getUserTenure(memberAtAge(days), now), group)
  }
  for (const createdAt of [undefined, '', 'invalid', '2027-01-01']) {
    assert.equal(getUserTenure({ createdAt }, now), 'unknown')
  }
})

test('returning requires repeat sign-ins and can overlap any tenure group', () => {
  for (const signInCount of [undefined, null, 0, 1]) {
    assert.equal(isReturningUser({ signInCount }), false)
  }
  for (const days of [1, 30, 120]) {
    const member = { ...memberAtAge(days), signInCount: 2 }
    assert.equal(matchesUserGroup(member, 'returning', now), true)
    assert.equal(matchesUserGroup(member, getUserTenure(member, now), now), true)
  }
})

test('group and beta filters combine without mixing non-beta and beta accounts', () => {
  const users = [
    { ...memberAtAge(1), isBetaTester: true },
    { ...memberAtAge(2), isBetaTester: false },
    { ...memberAtAge(100), isBetaTester: true },
  ]
  assert.equal(users.filter((user) => matchesUserGroup(user, 'new', now) && matchesBetaFilter(user, 'beta')).length, 1)
  assert.equal(users.filter((user) => matchesBetaFilter(user, 'standard')).length, 1)
  assert.equal(matchesBetaFilter({}, 'standard'), true)
  assert.equal(users.filter((user) => matchesUserGroup(user, 'all') && matchesBetaFilter(user, 'all')).length, 3)
})

test('date sorting places missing/invalid dates last in both directions', () => {
  const users = [{ id: 'missing' }, { id: 'old', ...memberAtAge(100) }, { id: 'invalid', createdAt: 'bad' }, { id: 'new', ...memberAtAge(1) }]
  assert.deepEqual([...users].sort((a, b) => compareDirectoryUsers(a, b, 'newest')).map((u) => u.id), ['new', 'old', 'missing', 'invalid'])
  assert.deepEqual([...users].sort((a, b) => compareDirectoryUsers(a, b, 'oldest')).map((u) => u.id), ['old', 'new', 'missing', 'invalid'])
  assert.equal(compareDirectoryUsers({ lastSignInAt: '2026-11-03' }, { lastSignInAt: '2026-11-01' }, 'last-sign-in') < 0, true)
})
