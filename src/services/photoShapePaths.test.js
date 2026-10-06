import test from 'node:test'
import assert from 'node:assert/strict'
import { polygonShapePoints } from './photoShapePaths.js'

test('polygon and star use bounded shared points for canvas export and SVG preview', () => {
  for (const [shape, count] of [['hexagon', 6], ['star', 10]]) {
    const points = polygonShapePoints(shape)
    assert.equal(points.length, count)
    assert.deepEqual(points[0], { x: 50, y: 0 })
    points.forEach(({ x, y }, index) => {
      assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100)
      const radius = shape === 'star' && index % 2 ? 21 : 50
      assert.ok(Math.abs(Math.hypot(x - 50, y - 50) - radius) < 1e-10)
    })
    assert.deepEqual(polygonShapePoints(shape), points)
  }
})

test('existing shape types retain their original rendering paths', () => {
  for (const shape of ['rectangle', 'ellipse', 'triangle', 'line']) {
    assert.equal(polygonShapePoints(shape), null)
  }
})
