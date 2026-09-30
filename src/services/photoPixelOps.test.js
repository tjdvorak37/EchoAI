import test from 'node:test'
import assert from 'node:assert/strict'
import { stagePointToImage } from './photoCanvasOps.js'
import {
  applyHueSaturation,
  combineMasks,
  defaultHueSat,
  featherMask,
  hslToRgb,
  invertMask,
  magicWandMask,
  maskCoverage,
  paintBucket,
  polygonMask,
  rangeWeight,
  rectMask,
  rgbToHsl,
  selectSubjectMask,
  HUE_SAT_PRESETS,
} from './photoPixelOps.js'

const makeImage = (width, height, paint) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y)
      const index = (y * width + x) * 4
      data.set([r, g, b, 255], index)
    }
  }
  return { data, width, height }
}

test('pointer coordinates track contained and positioned image pixels', () => {
  const base = stagePointToImage({ x: 50, y: 25 }, 400, 200, 200, 200)
  assert.equal(base.x, 200)
  assert.equal(base.y, 0)
  const overlay = { x: 30, y: 40, width: 50, rotation: 90 }
  const center = stagePointToImage({ x: 30, y: 40 }, 400, 200, 200, 200, overlay)
  assert.equal(center.x, 200)
  assert.equal(center.y, 100)
  const right = stagePointToImage({ x: 35, y: 40 }, 400, 200, 200, 200, overlay)
  assert.ok(Math.abs(right.y - 60) < 0.001)
})

test('rgb <-> hsl round trips', () => {
  for (const color of [[255, 0, 0], [12, 200, 90], [128, 128, 128], [250, 240, 10]]) {
    const [h, s, l] = rgbToHsl(...color)
    const back = hslToRgb(h, s, l)
    back.forEach((value, index) => assert.ok(Math.abs(value - color[index]) <= 1, `${color} -> ${back}`))
  }
})

test('range weight is full near centre and zero far away, wrapping at 360', () => {
  assert.equal(rangeWeight(5, 0), 1)
  assert.equal(rangeWeight(355, 0), 1)
  assert.equal(rangeWeight(90, 0), 0)
  assert.ok(rangeWeight(30, 0) > 0 && rangeWeight(30, 0) < 1)
})

test('desaturate preset mutes colour but keeps lightness', () => {
  const image = makeImage(1, 1, () => [220, 40, 40])
  const [, s0, l0] = rgbToHsl(220, 40, 40)
  applyHueSaturation(image, HUE_SAT_PRESETS.desaturate.build())
  const [, s1, l1] = rgbToHsl(image.data[0], image.data[1], image.data[2])
  assert.ok(s1 < s0 * 0.3)
  assert.ok(Math.abs(l1 - l0) < 0.02)
})

test('a reds-only edit leaves greens alone', () => {
  const image = makeImage(2, 1, (x) => (x === 0 ? [230, 30, 30] : [30, 200, 30]))
  const settings = defaultHueSat()
  settings.ranges.reds.saturation = -100
  applyHueSaturation(image, settings)
  assert.ok(Math.abs(image.data[0] - image.data[1]) < 4, 'red pixel became grey')
  assert.deepEqual([...image.data.slice(4, 7)], [30, 200, 30])
})

test('colorize tints by luminance', () => {
  const image = makeImage(1, 1, () => [128, 128, 128])
  applyHueSaturation(image, { ...defaultHueSat(), colorize: true, colorizeHue: 240, colorizeSaturation: 50 })
  assert.ok(image.data[2] > image.data[0], 'blue tint')
})

test('select subject separates a subject from a plain backdrop', () => {
  const image = makeImage(40, 40, (x, y) => ((x - 20) ** 2 + (y - 20) ** 2 < 100 ? [240, 240, 230] : [5, 5, 8]))
  const { mask, coverage, confidence } = selectSubjectMask(image)
  assert.equal(mask[20 * 40 + 20], 255)
  assert.equal(mask[0], 0)
  assert.ok(Math.abs(coverage - Math.PI * 100 / 1600) < 0.03)
  assert.equal(confidence, 'high')
})

test('select subject flags a frame with no subject as low confidence', () => {
  const { confidence } = selectSubjectMask(makeImage(20, 20, () => [10, 10, 10]))
  assert.equal(confidence, 'low')
})

test('magic wand contiguous vs global', () => {
  const image = makeImage(5, 1, (x) => (x === 2 ? [0, 0, 0] : [255, 255, 255]))
  assert.deepEqual([...magicWandMask(image, 0, 0)], [255, 255, 0, 0, 0])
  assert.deepEqual([...magicWandMask(image, 0, 0, { contiguous: false })], [255, 255, 0, 255, 255])
})

test('rect and polygon masks cover the expected area', () => {
  assert.equal(maskCoverage(rectMask(10, 10, { x: 0, y: 0, w: 5, h: 10 })), 0.5)
  const triangle = polygonMask(10, 10, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }])
  assert.ok(Math.abs(maskCoverage(triangle) - 0.5) < 0.1)
})

test('combine modes', () => {
  const a = Uint8Array.from([255, 255, 0, 0])
  const b = Uint8Array.from([255, 0, 255, 0])
  assert.deepEqual([...combineMasks(a, b, 'add')], [255, 255, 255, 0])
  assert.deepEqual([...combineMasks(a, b, 'subtract')], [0, 255, 0, 0])
  assert.deepEqual([...combineMasks(a, b, 'intersect')], [255, 0, 0, 0])
  assert.deepEqual([...invertMask(a)], [0, 0, 255, 255])
})

test('feather softens a hard edge without changing overall coverage much', () => {
  const hard = rectMask(20, 20, { x: 0, y: 0, w: 10, h: 20 })
  const soft = featherMask(hard, 20, 20, 2)
  assert.ok(soft[10 * 20 + 9] < 255 && soft[10 * 20 + 10] > 0)
  assert.ok(Math.abs(maskCoverage(soft) - maskCoverage(hard)) < 0.05)
})

test('paint bucket fills only the clicked region', () => {
  const image = makeImage(3, 1, (x) => (x === 1 ? [0, 0, 0] : [255, 255, 255]))
  assert.equal(paintBucket(image, 0, 0, [255, 0, 0]), 1)
  assert.deepEqual([...image.data.slice(0, 3)], [255, 0, 0])
  assert.deepEqual([...image.data.slice(8, 11)], [255, 255, 255])
})
