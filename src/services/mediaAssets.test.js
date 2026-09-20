import test from 'node:test'
import assert from 'node:assert/strict'

import { removeStoredAsset } from './mediaAssets.js'

test('assets without storage paths are left alone', async () => {
  const calls = []
  const result = await removeStoredAsset({
    asset: { id: 'asset-1', name: 'demo.png' },
    storageClient: {
      from: () => ({
        remove: (paths) => {
          calls.push(paths)
          return { error: null }
        },
      }),
    },
  })

  assert.deepEqual(result, { removed: false, skipped: true })
  assert.deepEqual(calls, [])
})

test('storage-backed assets are removed from the social-media bucket', async () => {
  const calls = []
  const result = await removeStoredAsset({
    asset: { id: 'asset-2', storagePath: 'abc/asset.png' },
    storageClient: {
      from: () => ({
        remove: (paths) => {
          calls.push(paths)
          return { error: null }
        },
      }),
    },
  })

  assert.deepEqual(result, { removed: true, skipped: false })
  assert.deepEqual(calls, [['abc/asset.png']])
})
