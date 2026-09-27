import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhotoProject, parsePhotoProject } from './photoProject.js'

const state = {
  imageSrc: 'data:image/png;base64,aGVsbG8=',
  prompt: 'test prompt',
  headline: 'Test',
  subcopy: 'Details',
  presetId: 'aurora',
  aspectRatio: '4:5',
  canvasBackground: 'transparent',
  maskShape: 'none',
  cropRect: { x: 5, y: 10, w: 80, h: 75 },
  filters: { brightness: 100, saturation: 50 },
  hueSat: { colorize: false, ranges: { master: { hue: 4 } } },
  layerMask: { id: 2, src: 'data:image/png;base64,bWFzaw==', enabled: true },
  brushStrokes: [{ id: 'stroke-1', points: [{ x: 1, y: 2 }] }],
  layers: [{ id: 'layer-1', type: 'text', value: 'Editable text' }],
  selection: { src: 'data:image/png;base64,c2VsZWN0aW9u', width: 20, height: 20 },
  exportFormat: 'webp',
  exportQuality: 83,
}

test('photo project round-trip preserves every editable document field', () => {
  const serialized = JSON.stringify(createPhotoProject(state))
  const loaded = parsePhotoProject(serialized)
  for (const [key, value] of Object.entries(state)) assert.deepEqual(loaded[key], value, key)
})

test('legacy project files without a versioned envelope still load', () => {
  const loaded = parsePhotoProject(JSON.stringify({ layers: state.layers, filters: state.filters, aspect: '1:1' }))
  assert.deepEqual(loaded.layers, state.layers)
  assert.deepEqual(loaded.filters, state.filters)
  assert.equal(loaded.aspectRatio, '1:1')
  assert.equal(loaded.canvasBackground, '#ffffff')
})

test('invalid project payloads fail with a useful message', () => {
  assert.throws(() => parsePhotoProject('{'), /not valid JSON/)
  assert.throws(() => parsePhotoProject(JSON.stringify({ filters: {} })), /not a valid EchoAI photo project/)
  assert.throws(() => parsePhotoProject(JSON.stringify({ filters: {}, layers: [{ id: 1 }] })), /invalid layer/)
})
