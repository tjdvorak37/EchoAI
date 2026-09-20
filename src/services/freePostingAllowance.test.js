import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FREE_POSTING_ALLOWANCE,
  consumeFreePostingAllowance,
  getFreePostingUsage,
} from './freePostingAllowance.js'

const createLocalStorageMock = () => {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

const resetStorage = () => {
  globalThis.__echoaiFreePostingMemoryStore = {}
  Object.defineProperty(globalThis, 'localStorage', {
    value: createLocalStorageMock(),
    configurable: true,
    writable: true,
  })
}

test('free accounts get 10 posting slots and usage counts by selected social accounts', { concurrency: false }, async () => {
  resetStorage()
  const userId = 'free-user-123'
  const entitlement = { entitled: false, accessLevel: 'free', status: 'none' }

  const firstResult = await consumeFreePostingAllowance({ userId, entitlement, channelCount: 5 })
  assert.equal(firstResult.allowed, true)
  assert.equal(firstResult.remaining, 5)
  assert.equal(firstResult.used, 5)
  assert.equal(await getFreePostingUsage(userId), 5)

  const secondResult = await consumeFreePostingAllowance({ userId, entitlement, channelCount: 6 })
  assert.equal(secondResult.allowed, false)
  assert.equal(secondResult.remaining, 5)
  assert.equal(secondResult.used, 5)
  assert.equal(await getFreePostingUsage(userId), 5)
})

test('paid accounts bypass the free posting allowance', { concurrency: false }, async () => {
  resetStorage()
  const userId = 'paid-user-456'
  const entitlement = { entitled: true, accessLevel: 'paid', status: 'active' }

  const result = await consumeFreePostingAllowance({ userId, entitlement, channelCount: FREE_POSTING_ALLOWANCE + 1 })
  assert.equal(result.allowed, true)
  assert.equal(result.remaining, Infinity)
  assert.equal(result.used, 0)
  assert.equal(await getFreePostingUsage(userId), 0)
})
