// Shared by the live preview graph and the offline export render, so what you
// hear while editing is what ends up in the exported file.

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
export const EQ_MIN_DB = -12
export const EQ_MAX_DB = 12
export const ZONE_MIN_DB = -24
export const ZONE_MAX_DB = 12

const flat = () => EQ_BANDS.map(() => 0)

export const EQ_PRESETS = {
  flat: { label: 'Flat', gains: flat() },
  voice: { label: 'Voice clarity', gains: [-6, -4, -2, 0, 1, 2, 4, 4, 2, 0] },
  podcast: { label: 'Podcast warmth', gains: [-8, -3, 2, 3, 1, 0, 2, 3, 1, -1] },
  bass: { label: 'Bass boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  bright: { label: 'Bright / crisp', gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 5] },
  rumble: { label: 'Cut rumble', gains: [-12, -9, -4, -1, 0, 0, 0, 0, 0, 0] },
  music: { label: 'Background music', gains: [2, 1, 0, -2, -3, -4, -3, -1, 0, 1] },
}

export const DEFAULT_MASTER_AUDIO = {
  volume: 100,
  fadeIn: 0,
  fadeOut: 0,
  eq: flat(),
  limiter: true,
}

export const formatBand = (hz) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`)

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const dbToGain = (db) => 10 ** (db / 20)

export const normalizeEq = (eq) => EQ_BANDS.map((_, index) => clamp(Number(eq?.[index] ?? 0) || 0, EQ_MIN_DB, EQ_MAX_DB))

export const isFlatEq = (eq) => normalizeEq(eq).every((value) => value === 0)

const ZONE_RAMP = 0.08

// Fade ramps and zone edges are linear so preview automation and export curves agree.
const fadeEnvelope = (time, length, fadeIn, fadeOut) => {
  if (time < 0 || time > length) return 0
  const safeIn = clamp(Number(fadeIn) || 0, 0, length)
  const safeOut = clamp(Number(fadeOut) || 0, 0, length)
  let gain = 1
  if (safeIn > 0 && time < safeIn) gain = Math.min(gain, time / safeIn)
  if (safeOut > 0 && time > length - safeOut) gain = Math.min(gain, (length - time) / safeOut)
  return clamp(gain, 0, 1)
}

const zoneGainAt = (zones, time) => {
  let gain = 1
  for (const zone of zones ?? []) {
    const start = Number(zone.start) || 0
    const end = Number(zone.end) || 0
    if (end <= start) continue
    const zoneGain = dbToGain(clamp(Number(zone.gainDb) || 0, ZONE_MIN_DB, ZONE_MAX_DB))
    const ramp = Math.min(ZONE_RAMP, (end - start) / 2)
    let weight = 0
    if (time >= start && time <= end) {
      weight = 1
      if (time < start + ramp) weight = (time - start) / ramp
      if (time > end - ramp) weight = Math.min(weight, (end - time) / ramp)
    }
    gain *= 1 + (zoneGain - 1) * clamp(weight, 0, 1)
  }
  return gain
}

// `localTime` is seconds since the clip starts on the timeline.
export const clipGainAt = (clip, localTime) => {
  if (!clip) return 0
  const volume = clamp(Number(clip.volume ?? 100), 0, 200) / 100
  return volume * fadeEnvelope(localTime, clip.duration, clip.fadeIn, clip.fadeOut) * zoneGainAt(clip.zones, localTime)
}

export const masterGainAt = (master, time, duration) => {
  const settings = { ...DEFAULT_MASTER_AUDIO, ...(master ?? {}) }
  const volume = clamp(Number(settings.volume), 0, 200) / 100
  return volume * fadeEnvelope(time, duration, settings.fadeIn, settings.fadeOut)
}

export const sampleGainCurve = (gainAt, length, rate = 100) => {
  const count = Math.max(2, Math.ceil(length * rate) + 1)
  const curve = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    curve[index] = gainAt((index / (count - 1)) * length)
  }
  return curve
}

// Upper bound only; real clipping still depends on the source material.
export const clipPeakGainDb = (clip) => {
  const samples = sampleGainCurve((time) => clipGainAt(clip, time), clip?.duration ?? 0, 20)
  const peak = samples.reduce((max, value) => Math.max(max, value), 0)
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity
}

export const createEqChain = (context, eq) => {
  const gains = normalizeEq(eq)
  const filters = EQ_BANDS.map((frequency, index) => {
    const filter = context.createBiquadFilter()
    filter.type = index === 0 ? 'lowshelf' : index === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
    filter.frequency.value = frequency
    filter.Q.value = 1.1
    filter.gain.value = gains[index]
    return filter
  })
  filters.reduce((previous, next) => {
    previous.connect(next)
    return next
  })
  return { input: filters[0], output: filters[filters.length - 1], filters }
}

export const updateEqChain = (chain, eq, context) => {
  const gains = normalizeEq(eq)
  chain.filters.forEach((filter, index) => {
    if (context) filter.gain.setTargetAtTime(gains[index], context.currentTime, 0.02)
    else filter.gain.value = gains[index]
  })
}

// Rumble high-pass plus hiss low-pass; always in the chain so toggling never rewires.
export const createCleanupChain = (context, enabled) => {
  const highpass = context.createBiquadFilter()
  highpass.type = 'highpass'
  const lowpass = context.createBiquadFilter()
  lowpass.type = 'lowpass'
  highpass.connect(lowpass)
  const chain = { input: highpass, output: lowpass, highpass, lowpass }
  updateCleanupChain(chain, enabled)
  return chain
}

export const updateCleanupChain = (chain, enabled) => {
  chain.highpass.frequency.value = enabled ? 90 : 10
  chain.lowpass.frequency.value = enabled ? 11000 : 22000
}

export const VOICE_EFFECTS = {
  none: { label: 'Original', icon: '○' },
  deep: { label: 'Deep voice', icon: '⬇' },
  high: { label: 'Chipmunk', icon: '⬆' },
  monster: { label: 'Monster', icon: '👹' },
  robot: { label: 'Robot', icon: '🤖' },
  telephone: { label: 'Telephone', icon: '☎' },
  radio: { label: 'Old radio', icon: '📻' },
  megaphone: { label: 'Megaphone', icon: '📣' },
  echo: { label: 'Echo', icon: '〜' },
  hall: { label: 'Big hall', icon: '🏛' },
}

const filter = (context, type, frequency, extra = {}) => {
  const node = context.createBiquadFilter()
  node.type = type
  node.frequency.value = frequency
  if (extra.Q !== undefined) node.Q.value = extra.Q
  if (extra.gain !== undefined) node.gain.value = extra.gain
  return node
}

const distortion = (context, amount) => {
  const shaper = context.createWaveShaper()
  const curve = new Float32Array(1024)
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / curve.length - 1
    curve[index] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x))
  }
  shaper.curve = curve
  shaper.oversample = '4x'
  return shaper
}

const series = (nodes) => {
  nodes.reduce((previous, next) => {
    previous.connect(next)
    return next
  })
  return { input: nodes[0], output: nodes[nodes.length - 1] }
}

// Delay-line pitch shifter (two crossfaded, sawtooth-modulated delays); works in real time and offline.
const createPitchShifter = (context, offset, sources) => {
  const delayTime = 0.1
  const fadeTime = 0.05
  const bufferTime = 0.1
  const rate = context.sampleRate
  const length = Math.floor(bufferTime * rate)
  const fadeLength = fadeTime * rate

  const fadeBuffer = context.createBuffer(1, length, rate)
  const fadeData = fadeBuffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) {
    fadeData[index] = index < fadeLength
      ? Math.sqrt(index / fadeLength)
      : index >= length - fadeLength ? Math.sqrt(1 - (index - (length - fadeLength)) / fadeLength) : 1
  }
  const rampBuffer = context.createBuffer(1, length, rate)
  const rampData = rampBuffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) {
    rampData[index] = offset > 0 ? (length - index) / length : index / length
  }

  const input = context.createGain()
  const output = context.createGain()
  const start = context.currentTime + 0.02
  ;[0, bufferTime - fadeTime].forEach((phase) => {
    const delay = context.createDelay(1)
    const mix = context.createGain()
    mix.gain.value = 0
    const depth = context.createGain()
    depth.gain.value = 0.5 * delayTime * Math.abs(offset)
    const ramp = context.createBufferSource()
    ramp.buffer = rampBuffer
    ramp.loop = true
    const fade = context.createBufferSource()
    fade.buffer = fadeBuffer
    fade.loop = true
    ramp.connect(depth)
    depth.connect(delay.delayTime)
    fade.connect(mix.gain)
    input.connect(delay)
    delay.connect(mix)
    mix.connect(output)
    ramp.start(start + phase)
    fade.start(start + phase)
    sources.push(ramp, fade)
  })
  return { input, output }
}

const impulseResponse = (context, seconds, decay) => {
  const length = Math.floor(seconds * context.sampleRate)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** decay
    }
  }
  return buffer
}

const withWet = (context, wetNode, wetLevel) => {
  const input = context.createGain()
  const output = context.createGain()
  const wet = context.createGain()
  wet.gain.value = wetLevel
  input.connect(output)
  input.connect(wetNode.input)
  wetNode.output.connect(wet)
  wet.connect(output)
  return { input, output }
}

// Returns { input, output, stop } so the preview can swap effects without rebuilding the clip chain.
export const createVoiceEffect = (context, key) => {
  const sources = []
  let chain = null

  if (key === 'deep') chain = createPitchShifter(context, -0.45, sources)
  else if (key === 'high') chain = createPitchShifter(context, 0.7, sources)
  else if (key === 'monster') {
    const shifter = createPitchShifter(context, -0.85, sources)
    const grit = series([distortion(context, 12), filter(context, 'lowpass', 3500)])
    shifter.output.connect(grit.input)
    chain = { input: shifter.input, output: grit.output }
  } else if (key === 'robot') {
    const ring = context.createGain()
    ring.gain.value = 0
    const carrier = context.createOscillator()
    carrier.frequency.value = 55
    carrier.connect(ring.gain)
    carrier.start()
    sources.push(carrier)
    const comb = context.createDelay(0.1)
    comb.delayTime.value = 0.011
    const feedback = context.createGain()
    feedback.gain.value = 0.45
    ring.connect(comb)
    comb.connect(feedback)
    feedback.connect(comb)
    const output = context.createGain()
    output.gain.value = 1.6
    ring.connect(output)
    comb.connect(output)
    chain = { input: ring, output }
  } else if (key === 'telephone') {
    chain = series([filter(context, 'highpass', 450), filter(context, 'lowpass', 3200), filter(context, 'peaking', 1500, { Q: 1, gain: 6 })])
  } else if (key === 'radio') {
    chain = series([filter(context, 'highpass', 300), filter(context, 'lowpass', 4500), distortion(context, 8), filter(context, 'peaking', 2000, { Q: 0.8, gain: 4 })])
  } else if (key === 'megaphone') {
    chain = series([filter(context, 'highpass', 700), filter(context, 'lowpass', 3500), filter(context, 'peaking', 1800, { Q: 1.2, gain: 8 }), distortion(context, 40)])
  } else if (key === 'echo') {
    const delay = context.createDelay(2)
    delay.delayTime.value = 0.3
    const feedback = context.createGain()
    feedback.gain.value = 0.38
    delay.connect(feedback)
    feedback.connect(delay)
    chain = withWet(context, { input: delay, output: delay }, 0.55)
  } else if (key === 'hall') {
    const convolver = context.createConvolver()
    convolver.buffer = impulseResponse(context, 2.8, 2.5)
    chain = withWet(context, { input: convolver, output: convolver }, 0.5)
  }

  if (!chain) {
    const passthrough = context.createGain()
    chain = { input: passthrough, output: passthrough }
  }

  // Band-limited effects lose energy and ring/feedback effects gain it; even them out.
  const makeup = { monster: 2, robot: 0.4, telephone: 2.4, radio: 2.2, megaphone: 2.4, echo: 0.7, hall: 0.85 }[key]
  if (makeup) {
    const level = context.createGain()
    level.gain.value = makeup
    chain.output.connect(level)
    chain = { input: chain.input, output: level }
  }

  return {
    ...chain,
    stop: () => {
      sources.forEach((source) => {
        try { source.stop() } catch { /* already stopped */ }
      })
      chain.output.disconnect()
    },
  }
}

export const createMasterBus = (context, master) => {
  const settings = { ...DEFAULT_MASTER_AUDIO, ...(master ?? {}) }
  const input = context.createGain()
  const eq = createEqChain(context, settings.eq)
  const gain = context.createGain()
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.003
  limiter.release.value = 0.12
  input.connect(eq.input)
  eq.output.connect(gain)
  const bus = { input, eq, gain, limiter, output: context.createGain(), limiterOn: null }
  setMasterLimiter(bus, settings.limiter)
  return bus
}

export const setMasterLimiter = (bus, enabled) => {
  if (bus.limiterOn === Boolean(enabled)) return
  bus.gain.disconnect()
  bus.limiter.disconnect()
  if (enabled) {
    bus.gain.connect(bus.limiter)
    bus.limiter.connect(bus.output)
  } else {
    bus.gain.connect(bus.output)
  }
  bus.limiterOn = Boolean(enabled)
}

export const audibleClipsForMix = (tracks) =>
  (tracks ?? []).flatMap((track) => {
    if (track.muted || (track.type !== 'audio' && track.type !== 'video')) return []
    return track.clips.filter((clip) => clip.previewUrl && !(track.type === 'video' && clip.audioDetached))
  })

// Renders the whole timeline mix with the same gain/EQ math as the preview.
export const renderTimelineMix = async ({ tracks, master, duration, decode, sampleRate = 48000 }) => {
  const clips = audibleClipsForMix(tracks)
  if (!clips.length || duration <= 0) return null

  const context = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)
  const bus = createMasterBus(context, master)
  bus.output.connect(context.destination)
  bus.gain.gain.setValueCurveAtTime(sampleGainCurve((time) => masterGainAt(master, time, duration), duration), 0, duration)

  let scheduled = 0
  for (const clip of clips) {
    const buffer = await decode(clip.previewUrl)
    if (!buffer) continue
    const start = Math.max(0, clip.startTime)
    const length = Math.min(clip.duration, duration - start)
    if (length <= 0) continue

    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = clip.speed ?? 1
    const cleanup = createCleanupChain(context, clip.noiseRemoval)
    const voice = createVoiceEffect(context, clip.voiceFx ?? 'none')
    const eq = createEqChain(context, clip.eq)
    const gain = context.createGain()
    gain.gain.setValueCurveAtTime(sampleGainCurve((time) => clipGainAt(clip, time), length), start, length)
    source.connect(cleanup.input)
    cleanup.output.connect(voice.input)
    voice.output.connect(eq.input)
    eq.output.connect(gain)
    gain.connect(bus.input)
    source.start(start, clip.trim?.start ?? 0, length * (clip.speed ?? 1))
    scheduled += 1
  }

  return scheduled ? context.startRendering() : null
}

export const computePeaks = (buffer, buckets = 600) => {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
  const size = Math.max(1, Math.floor(buffer.length / buckets))
  const peaks = new Float32Array(buckets)
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    let peak = 0
    const from = bucket * size
    const to = Math.min(buffer.length, from + size)
    for (const data of channels) {
      for (let index = from; index < to; index += 4) {
        const value = Math.abs(data[index])
        if (value > peak) peak = value
      }
    }
    peaks[bucket] = peak
  }
  return { duration: buffer.duration, peaks }
}
