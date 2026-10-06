import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_EFFECTS, FILTER_PRESETS, EFFECT_PRESETS, TRANSITION_PRESETS, TRANSITIONS, buildClipFilter, transitionStateAt } from './videoVisualPresets.js'

test('built-in catalogs expose complete unique functional choices', () => {
  assert.equal(Object.keys(FILTER_PRESETS).length, 19)
  assert.equal(Object.keys(EFFECT_PRESETS).length, 9)
  assert.equal(Object.keys(TRANSITION_PRESETS).length, 12)
  for (const catalog of [FILTER_PRESETS, EFFECT_PRESETS, TRANSITION_PRESETS]) {
    assert.equal(new Set(Object.values(catalog).map((preset) => preset.label)).size, Object.keys(catalog).length)
    for (const preset of Object.values(catalog)) assert.ok(preset.group)
  }
  for (const preset of Object.values(EFFECT_PRESETS)) {
    assert.deepEqual(Object.keys(preset.effects), Object.keys(DEFAULT_EFFECTS))
    assert.ok(preset.effects.brightness >= 0 && preset.effects.brightness <= 200)
    assert.ok(preset.effects.contrast >= 0 && preset.effects.contrast <= 200)
    assert.ok(preset.effects.saturate >= 0 && preset.effects.saturate <= 200)
    assert.ok(preset.effects.blur >= 0 && preset.effects.blur <= 12)
    assert.ok(preset.effects.hue >= -180 && preset.effects.hue <= 180)
  }
  assert.deepEqual(Object.keys(TRANSITIONS), Object.keys(TRANSITION_PRESETS))
})

test('existing filters and adjustments keep their exact rendering strings', () => {
  assert.equal(buildClipFilter(null), 'none')
  assert.equal(buildClipFilter({ filter: 'vintage' }), 'sepia(45%) contrast(110%) saturate(85%) brightness(100%) contrast(100%) saturate(100%) hue-rotate(0deg)')
  for (const [key, preset] of Object.entries(FILTER_PRESETS)) {
    assert.ok(buildClipFilter({ filter: key }).startsWith(preset.css))
  }
  assert.match(buildClipFilter({ filter: 'noir', effects: EFFECT_PRESETS.soften.effects }), /grayscale\(100%\).*blur\(2px\)/)
})

test('legacy transition geometry is preserved and every variant reaches its neutral middle', () => {
  const neutral = { opacity: 1, scale: 1, offset: 0, clip: 0 }
  assert.deepEqual(transitionStateAt({ duration: 6, transition: 'fade' }, 0.3), { ...neutral, opacity: 0.5 })
  assert.deepEqual(transitionStateAt({ duration: 6, transition: 'zoom' }, 0), { ...neutral, opacity: 0, scale: 1.25 })
  assert.deepEqual(transitionStateAt({ duration: 6, transition: 'slide' }, 0), { ...neutral, offset: -1 })
  assert.deepEqual(transitionStateAt({ duration: 6, transition: 'wipe' }, 0), { ...neutral, clip: 1 })
  for (const key of Object.keys(TRANSITION_PRESETS)) {
    assert.deepEqual(transitionStateAt({ duration: 6, transition: key }, 3), neutral)
    for (const time of [0, 0.1, 5.9, 6]) {
      const state = transitionStateAt({ duration: 6, transition: key }, time)
      assert.ok(state.opacity >= 0 && state.opacity <= 1)
      assert.ok(state.clip >= 0 && state.clip <= 1)
      assert.ok(state.scale >= 0.75 && state.scale <= 1.25)
      assert.ok(state.offset >= -1 && state.offset <= 1)
    }
  }
  assert.equal(transitionStateAt({ duration: 6, transition: 'fade-fast' }, 0.25).opacity, 1)
  assert.equal(transitionStateAt({ duration: 6, transition: 'fade-slow' }, 0.3).opacity, 0.25)
  assert.equal(transitionStateAt({ duration: 6, transition: 'slide-right' }, 0).offset, 1)
  assert.equal(transitionStateAt({ duration: 6, transition: 'zoom-out' }, 0).scale, 0.75)
})

test('entrance and exit ramps do not overlap or jump on short clips', () => {
  for (const key of ['fade', 'fade-fast', 'fade-slow', 'zoom', 'zoom-out', 'zoom-slow']) {
    assert.equal(transitionStateAt({ duration: 0.2, transition: key }, 0).opacity, 0)
    assert.equal(transitionStateAt({ duration: 0.2, transition: key }, 0.1).opacity, 1)
    assert.equal(transitionStateAt({ duration: 0.2, transition: key }, 0.2).opacity, 0)
    assert.ok(Math.abs(transitionStateAt({ duration: 0.2, transition: key }, 0.099).opacity
      - transitionStateAt({ duration: 0.2, transition: key }, 0.101).opacity) < 0.001)
  }
})
