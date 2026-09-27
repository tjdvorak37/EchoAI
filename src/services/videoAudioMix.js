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
    const eq = createEqChain(context, clip.eq)
    const gain = context.createGain()
    gain.gain.setValueCurveAtTime(sampleGainCurve((time) => clipGainAt(clip, time), length), start, length)
    source.connect(cleanup.input)
    cleanup.output.connect(eq.input)
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
