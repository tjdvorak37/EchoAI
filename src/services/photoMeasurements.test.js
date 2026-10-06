import test from 'node:test'
import assert from 'node:assert/strict'
import { measuredCanvasSize, pixelsToUnits, unitsToPixels, validatePhotoMeasurements, rulerTicks } from './photoMeasurements.js'

test('physical measurements convert at explicit PPI and retain pixel documents', () => {
  const inches = { unit: 'in', ppi: 300 }
  assert.deepEqual(measuredCanvasSize(8.5, 11, inches), { width: 2550, height: 3300 })
  assert.deepEqual(measuredCanvasSize(210, 297, { unit: 'mm', ppi: 300 }), { width: 2480, height: 3508 })
  assert.equal(pixelsToUnits(2550, inches), 8.5)
  assert.equal(unitsToPixels(25.4, { unit: 'mm', ppi: 96 }), 96)
  assert.deepEqual(measuredCanvasSize(1080, 1920, { unit: 'px', ppi: 300 }), { width: 1080, height: 1920 })
  assert.deepEqual(measuredCanvasSize(8.5, 11, { unit: 'in', ppi: 150 }), { width: 1275, height: 1650 })
})

test('invalid units, resolution, and oversized documents surface errors instead of truncating dimensions', () => {
  for (const settings of [null, { unit: 'cm', ppi: 300 }, { unit: 'in', ppi: 0 }, { unit: 'px', ppi: '300' }, { unit: 'px', ppi: 1201 }]) {
    assert.throws(() => validatePhotoMeasurements(settings), /Document measurements/)
  }
  for (const width of ['', -1, 'hello', 0, 1, 9000]) {
    assert.throws(() => measuredCanvasSize(width, 1080, { unit: 'px', ppi: 96 }), /dimensions|positive/)
  }
  assert.throws(() => measuredCanvasSize(30, 40, { unit: 'in', ppi: 300 }), /8192/)
})

test('rulers place zero at the page origin, support negative workspace values, and adapt ticks to zoom', () => {
  const ticks = rulerTicks(500, 100, 100)
  assert.equal(ticks.find((tick) => tick.label === '0').position, 100)
  assert.ok(ticks.some((tick) => Number(tick.label) < 0))
  assert.equal(ticks.find((tick) => tick.label === '1').position, 200)
  const zoomed = rulerTicks(500, 100, 200)
  assert.equal(zoomed.find((tick) => tick.label === '1').position, 300)
  for (const tick of zoomed) assert.ok(tick.position >= 0 && tick.position <= 500)
  for (const scale of [0.002, 0.2, 50, 1000]) {
    const result = rulerTicks(1000, -230, scale)
    assert.ok(result.length < 100, 'tick count stays bounded for large/small documents')
    assert.ok(result.filter((tick) => tick.major).length > 0)
  }
})
