import test from 'node:test'
import assert from 'node:assert/strict'
import { EQ_BANDS, audibleClipsForMix, clipGainAt, clipPeakGainDb, dbToGain, masterGainAt, normalizeEq } from './videoAudioMix.js'

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`)

test('clip gain applies volume and linear fades', () => {
  const clip = { duration: 10, volume: 50, fadeIn: 2, fadeOut: 4 }
  near(clipGainAt(clip, 0), 0)
  near(clipGainAt(clip, 1), 0.25)
  near(clipGainAt(clip, 5), 0.5)
  near(clipGainAt(clip, 8), 0.25)
  near(clipGainAt(clip, 10), 0)
  assert.equal(clipGainAt(clip, 11), 0)
})

test('zones change gain only inside their range with short ramps', () => {
  const clip = { duration: 10, volume: 100, zones: [{ id: 'z', start: 3, end: 6, gainDb: -6 }] }
  near(clipGainAt(clip, 1), 1)
  near(clipGainAt(clip, 4.5), dbToGain(-6))
  near(clipGainAt(clip, 8), 1)
  const edge = clipGainAt(clip, 3.04)
  assert.ok(edge < 1 && edge > dbToGain(-6))
})

test('peak gain reports boost above unity', () => {
  assert.ok(clipPeakGainDb({ duration: 4, volume: 100, zones: [{ id: 'z', start: 1, end: 2, gainDb: 6 }] }) > 5.9)
  near(clipPeakGainDb({ duration: 4, volume: 100 }), 0)
})

test('master gain fades the whole project', () => {
  const master = { volume: 100, fadeIn: 0, fadeOut: 2 }
  near(masterGainAt(master, 5, 10), 1)
  near(masterGainAt(master, 9, 10), 0.5)
})

test('eq values are clamped to the band count and range', () => {
  const eq = normalizeEq([40, -40, 'x'])
  assert.equal(eq.length, EQ_BANDS.length)
  assert.deepEqual(eq.slice(0, 3), [12, -12, 0])
})

test('mix skips muted tracks and detached video audio', () => {
  const tracks = [
    { type: 'video', muted: false, clips: [{ id: 'v1', previewUrl: 'a' }, { id: 'v2', previewUrl: 'b', audioDetached: true }] },
    { type: 'audio', muted: true, clips: [{ id: 'a1', previewUrl: 'c' }] },
    { type: 'audio', muted: false, clips: [{ id: 'a2', previewUrl: 'd' }] },
    { type: 'text', muted: false, clips: [{ id: 't1', previewUrl: 'e' }] },
  ]
  assert.deepEqual(audibleClipsForMix(tracks).map((clip) => clip.id), ['v1', 'a2'])
})
