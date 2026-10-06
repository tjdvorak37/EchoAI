import test from 'node:test'
import assert from 'node:assert/strict'
import { pickObjectIds, toggleObjectIds, translateObjectSelection, selectionAlignmentPatches, boxSelectedObjectIds, distributionPatches } from './photoObjectSelection.js'

test('Pick selects visible group members while Alt picks one and Shift toggles groups', () => {
  const layers = [
    { id: 'a', objectGroupId: 'g' }, { id: 'b', objectGroupId: 'g' },
    { id: 'c', objectGroupId: 'g', hidden: true }, { id: 'base', objectGroupId: 'g', isBaseImage: true },
  ]
  assert.deepEqual(pickObjectIds(layers, layers[0]), ['a', 'b'])
  assert.deepEqual(pickObjectIds(layers, layers[0], true), ['a'])
  assert.deepEqual(pickObjectIds(layers, layers[2]), ['c'])
  assert.deepEqual(toggleObjectIds(['z'], ['a', 'b']), ['z', 'a', 'b'])
  assert.deepEqual(toggleObjectIds(['z', 'a', 'b'], ['a', 'b']), ['z'])
})

test('group movement clamps shared delta rather than distorting relative positions', () => {
  const layers = [{ id: 'a', x: 10, y: 20 }, { id: 'b', x: 80, y: 90 }]
  assert.deepEqual(translateObjectSelection(layers, 40, 40), [
    { id: 'a', x: 30, y: 30 }, { id: 'b', x: 100, y: 100 },
  ])
  assert.deepEqual(translateObjectSelection(layers, -40, -40), [
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 70, y: 70 },
  ])
})

test('selection alignment matches actual edges to the primary object atomically', () => {
  const objects = [
    { layer: { id: 'a', x: 10, y: 20 }, bounds: { left: 10, top: 10, width: 20, height: 30 } },
    { layer: { id: 'b', x: 70, y: 60 }, bounds: { left: 60, top: 50, width: 30, height: 20 } },
  ]
  assert.deepEqual(selectionAlignmentPatches(objects, 'b', 'left', 100, 100), [
    { id: 'a', x: 60 }, { id: 'b', x: 70 },
  ])
  assert.deepEqual(selectionAlignmentPatches(objects, 'b', 'center', 100, 100), [
    { id: 'a', x: 65 }, { id: 'b', x: 70 },
  ])
  assert.deepEqual(selectionAlignmentPatches(objects, 'b', 'bottom', 100, 100), [
    { id: 'a', y: 50 }, { id: 'b', y: 60 },
  ])
  assert.throws(() => selectionAlignmentPatches(objects, 'missing', 'left', 100, 100), /reference/)
  assert.throws(() => selectionAlignmentPatches([objects[0], { ...objects[1], layer: { id: 'b', x: 10, y: 60 } }], 'a', 'right', 100, 100), /outside/)
})

test('box selection requires full containment, expands groups, and includes locked design objects', () => {
  const layers = [
    { id: 'a', objectGroupId: 'g', locked: true }, { id: 'b', objectGroupId: 'g' },
    { id: 'hidden', hidden: true }, { id: 'base', isBaseImage: true }, { id: 'partial' },
  ]
  const objects = layers.map((layer, index) => ({
    layer, bounds: { left: index === 1 ? 200 : index === 4 ? 95 : 10, top: 10, width: 20, height: 20 },
  }))
  const box = { left: 0, top: 0, width: 100, height: 100 }
  assert.deepEqual(boxSelectedObjectIds(layers, objects, box), ['a', 'b'])
  assert.deepEqual(boxSelectedObjectIds(layers, objects, box, { individual: true }), ['a'])
  assert.deepEqual(boxSelectedObjectIds(layers, objects, { ...box, width: 10 }), [])
})

const distributionObjects = [
  { layer: { id: 'a', x: 10, y: 10 }, bounds: { left: 0, top: 0, width: 20, height: 20 } },
  { layer: { id: 'b', x: 25, y: 25 }, bounds: { left: 20, top: 20, width: 10, height: 10 } },
  { layer: { id: 'c', x: 80, y: 80 }, bounds: { left: 60, top: 60, width: 40, height: 40 } },
]

test('distribution preserves endpoints and spaces unequal objects by centers or gaps on either axis', () => {
  for (const [axis, key] of [['horizontal', 'x'], ['vertical', 'y']]) {
    assert.deepEqual(distributionPatches([...distributionObjects].reverse(), axis, 'centers', 100, 100), [
      { id: 'a', [key]: 10 }, { id: 'b', [key]: 45 }, { id: 'c', [key]: 80 },
    ])
    assert.deepEqual(distributionPatches(distributionObjects, axis, 'gaps', 100, 100), [
      { id: 'a', [key]: 10 }, { id: 'b', [key]: 40 }, { id: 'c', [key]: 80 },
    ])
  }
})

test('distribution fails atomically for too few objects, overlapping gaps, and out-of-canvas anchors', () => {
  assert.throws(() => distributionPatches(distributionObjects.slice(0, 2), 'horizontal', 'gaps', 100, 100), /at least three/)
  const overlap = distributionObjects.map((object) => ({ ...object, bounds: { ...object.bounds, width: 80 } }))
  assert.throws(() => distributionPatches(overlap, 'horizontal', 'gaps', 100, 100), /not enough space/)
  const outside = distributionObjects.map((object, index) => index === 1 ? { ...object, layer: { ...object.layer, x: 99 } } : object)
  assert.throws(() => distributionPatches(outside, 'horizontal', 'centers', 100, 100), /outside/)
  assert.equal(distributionObjects[1].layer.x, 25)
})
