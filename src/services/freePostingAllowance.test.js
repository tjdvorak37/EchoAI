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

test('free posting usage resets monthly and does not carry over to the next cycle', { concurrency: false }, async () => {
  resetStorage()
  const userId = 'month-reset-user'
  const entitlement = { entitled: false, accessLevel: 'free', status: 'none' }

  const lastMonth = new Date()
  lastMonth.setMonth(lastMonth.getMonth() - 1)
  const previousMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`

  const store = globalThis.localStorage
  store.setItem('echoai-free-posting-usage-v1', JSON.stringify({
    [userId]: { month: previousMonthKey, used: 8 },
  }))

  const usage = await getFreePostingUsage(userId)
  assert.equal(usage, 0)

  const result = await consumeFreePostingAllowance({ userId, entitlement, channelCount: 2 })
  assert.equal(result.allowed, true)
  assert.equal(result.used, 2)
  assert.equal(result.remaining, 8)
  assert.equal(await getFreePostingUsage(userId), 2)
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
