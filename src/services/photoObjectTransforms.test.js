import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeObjectRotation, objectAlignmentPatch, resizeObjectFromCorner, rotationFromPointer } from './photoObjectTransforms.js'

const resize = (options = {}) => resizeObjectFromCorner({
  layer: { type: 'shape', rotation: 0 }, width: 300, height: 200,
  canvasWidth: 1000, canvasHeight: 1000, deltaX: 50, deltaY: 25,
  cornerX: 1, cornerY: 1, ...options,
})

test('corner resizing preserves center and uses local axes of rotated objects', () => {
  assert.deepEqual(resize(), { width: 40, height: 25 })
  assert.deepEqual(resize({ cornerX: -1, cornerY: -1 }), { width: 20, height: 15 })
  const rotated = resize({ layer: { type: 'shape', rotation: 90 }, deltaX: -25, deltaY: 50 })
  assert.ok(Math.abs(rotated.width - 40) < 1e-8)
  assert.ok(Math.abs(rotated.height - 25) < 1e-8)
})

test('proportional resize, images, stickers, and size limits retain required ratios', () => {
  const shape = resize({ proportional: true })
  assert.ok(Math.abs(shape.width / shape.height - 1.5) < 1e-8)
  const image = resize({ layer: { type: 'image' } })
  assert.deepEqual(Object.keys(image), ['width'])
  assert.equal(resize({ deltaX: -1000, deltaY: -1000 }).width, 2)
  assert.equal(resize({ deltaX: 10000, deltaY: 10000 }).height, 100)
  assert.equal(resize({ layer: { type: 'shape', shape: 'line' }, deltaY: -1000 }).height, 0.1)
  const sticker = resize({ layer: { type: 'sticker', fontSize: 40 }, deltaX: 10000 })
  assert.equal(sticker.fontSize, 96)
})

test('rotation handles angle wrapping and 15-degree snapping', () => {
  assert.equal(normalizeObjectRotation(370), 10)
  assert.equal(normalizeObjectRotation(-190), 170)
  assert.equal(rotationFromPointer({ rotation: 0, startAngle: 0, angle: Math.PI / 2 }), 90)
  assert.equal(rotationFromPointer({ rotation: 0, startAngle: 0, angle: 17 * Math.PI / 180, snap: true }), 15)
  assert.equal(rotationFromPointer({ rotation: 179, startAngle: Math.PI * 179 / 180, angle: Math.PI * -179 / 180 }), -179)
})

test('alignment uses rendered bounds rather than assuming a center anchor', () => {
  const options = {
    layer: { x: 20, y: 30 },
    bounds: { left: 200, top: 250, width: 200, height: 100 },
    canvasBounds: { left: 0, top: 0, width: 1000, height: 1000 },
  }
  assert.deepEqual(objectAlignmentPatch({ ...options, alignment: 'left' }), { x: 0 })
  assert.deepEqual(objectAlignmentPatch({ ...options, alignment: 'center' }), { x: 40 })
  assert.deepEqual(objectAlignmentPatch({ ...options, alignment: 'right' }), { x: 80 })
  assert.deepEqual(objectAlignmentPatch({ ...options, alignment: 'top' }), { y: 5 })
  assert.deepEqual(objectAlignmentPatch({ ...options, alignment: 'middle' }), { y: 50 })
  assert.deepEqual(objectAlignmentPatch({ ...options, alignment: 'bottom' }), { y: 95 })
  assert.throws(() => objectAlignmentPatch({ ...options, layer: { x: 0, y: 0 }, alignment: 'left' }), /outside the canvas/)
})
