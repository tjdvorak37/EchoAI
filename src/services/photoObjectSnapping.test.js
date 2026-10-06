import test from 'node:test'
import assert from 'node:assert/strict'
import { snapObjectTranslation } from './photoObjectSnapping.js'

const object = (id, x, y, width = 100, height = 100, extra = {}) => ({
  layer: { id, x, y, ...extra },
  bounds: { left: x * 10 - width / 2, top: y * 10 - height / 2, width, height },
})
const options = {
  moving: [object('a', 20, 25)], targets: [], deltaX: 29.6, deltaY: 0,
  width: 1000, height: 1000, scaleX: 1, scaleY: 1,
}

test('snapping aligns canvas centers/edges within six screen pixels and preserves raw motion outside tolerance', () => {
  assert.deepEqual(snapObjectTranslation(options), {
    patches: [{ id: 'a', x: 50, y: 25 }], guides: [{ axis: 'x', position: 50 }],
  })
  const outside = snapObjectTranslation({ ...options, deltaX: 29.39 })
  assert.equal(outside.patches[0].x, 49.39)
  assert.deepEqual(outside.guides, [])
  const edge = snapObjectTranslation({ ...options, deltaX: -14.6 })
  assert.equal(edge.patches[0].x, 5)
  assert.deepEqual(edge.guides, [{ axis: 'x', position: 0 }])
  const bottom = snapObjectTranslation({ ...options, deltaX: 0, deltaY: 69.6 })
  assert.equal(bottom.patches[0].y, 95)
  assert.deepEqual(bottom.guides, [{ axis: 'y', position: 100 }])
})

test('threshold remains six screen pixels at zoom and can be bypassed', () => {
  const zoomed = { ...options, scaleX: 2, deltaX: 29.6 }
  assert.deepEqual(snapObjectTranslation(zoomed).guides, [])
  assert.equal(snapObjectTranslation({ ...zoomed, deltaX: 29.7 }).patches[0].x, 50)
  assert.equal(snapObjectTranslation({ ...options, enabled: false }).patches[0].x, 49.6)
  assert.deepEqual(snapObjectTranslation({ ...options, enabled: false }).guides, [])
})

test('visible object edges and centers are targets, including locked objects but not hidden/base/self', () => {
  const target = object('target', 80, 75, 80, 120, { locked: true })
  const snapped = snapObjectTranslation({ ...options, targets: [target], deltaX: 55.7, deltaY: 49.7 })
  assert.equal(snapped.patches[0].x, 76)
  assert.equal(snapped.patches[0].y, 75)
  assert.deepEqual(snapped.guides, [{ axis: 'x', position: 76 }, { axis: 'y', position: 75 }])
  for (const extra of [{ hidden: true }, { isBaseImage: true }, { id: 'a' }]) {
    const result = snapObjectTranslation({ ...options, targets: [{ ...target, layer: { ...target.layer, ...extra } }], deltaX: 55.7, deltaY: 49.7 })
    assert.deepEqual(result.guides, [])
  }
})

test('multiple objects snap by their combined bounds and retain relative spacing', () => {
  const moving = [object('a', 20, 25), object('b', 40, 35)]
  const result = snapObjectTranslation({ ...options, moving, targets: moving, deltaX: 19.6 })
  assert.deepEqual(result.patches, [{ id: 'a', x: 40, y: 25 }, { id: 'b', x: 60, y: 35 }])
  assert.deepEqual(result.guides, [{ axis: 'x', position: 50 }])
})

test('snapping chooses the closest target and does not display unattainable guides at anchor boundaries', () => {
  const result = snapObjectTranslation({ ...options, targets: [object('b', 50.2, 75)], deltaX: 29.9 })
  assert.equal(result.patches[0].x, 50)
  const offCanvas = { layer: { id: 'a', x: 1, y: 25 }, bounds: { left: 13, top: 200, width: 50, height: 100 } }
  const constrained = snapObjectTranslation({ ...options, moving: [offCanvas], deltaX: -10 })
  assert.deepEqual(constrained.guides, [])
  assert.equal(constrained.patches[0].x, 0)
})
