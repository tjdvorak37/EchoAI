import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Clapperboard, Download, Eye, EyeOff, Film, Library, Lock, MonitorPlay, Music2, PanelsTopLeft, Play, Redo2, RotateCcw, Scissors, SlidersHorizontal, Type, Undo2, Unlock, Volume2, VolumeX } from 'lucide-react'
import { canUseAgentMode, runCreativeAgentJob } from '../services/aiAgentService'
import {
  DEFAULT_MASTER_AUDIO,
  EQ_PRESETS,
  clipGainAt,
  clipPeakGainDb,
  computePeaks,
  createCleanupChain,
  createEqChain,
  createMasterBus,
  createVoiceEffect,
  masterGainAt,
  normalizeEq,
  renderTimelineMix,
  setMasterLimiter,
  updateCleanupChain,
  updateEqChain,
} from '../services/videoAudioMix'
import { ClipAudioControls, MasterAudioControls, VoiceOverRecorder } from './VideoAudioMixer'
import { StockLibrary } from './StockLibrary'
import { EditorFocusToggle } from './EditorFocusMode'
import { useEditorFocusMode } from './useEditorFocusMode'
import { downloadMediaLibraryFile } from '../services/mediaLibraryService'

const FILTER_PRESETS = {
  none: { label: 'None', css: '' },
  vintage: { label: 'Vintage', css: 'sepia(45%) contrast(110%) saturate(85%)' },
  retro: { label: 'Retro', css: 'sepia(25%) hue-rotate(-15deg) saturate(140%)' },
  cool: { label: 'Cool', css: 'hue-rotate(180deg) saturate(115%) brightness(105%)' },
  warm: { label: 'Warm', css: 'sepia(20%) saturate(130%) brightness(105%)' },
  mono: { label: 'B&W', css: 'grayscale(100%) contrast(115%)' },
  dreamy: { label: 'Dreamy', css: 'blur(1px) brightness(110%) saturate(120%)' },
}

const DEFAULT_EFFECTS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  hue: 0,
}

const DEFAULT_TRANSFORM = {
  x: 0,
  y: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
  blendMode: 'normal',
}

const PROJECT_PRESETS = {
  '16:9': { label: 'Widescreen', width: 1920, height: 1080 },
  '9:16': { label: 'Vertical', width: 1080, height: 1920 },
  '1:1': { label: 'Square', width: 1080, height: 1080 },
  '4:5': { label: 'Portrait', width: 1080, height: 1350 },
}

const TRANSITIONS = {
  none: 'None',
  fade: 'Fade',
  slide: 'Slide',
  zoom: 'Zoom',
  wipe: 'Wipe',
}

const TEXT_PRESETS = {
  title: { label: 'Title', fontSize: 64, weight: 800, y: 45, color: '#ffffff' },
  subtitle: { label: 'Subtitle', fontSize: 34, weight: 600, y: 80, color: '#f8fafc' },
  lower_third: { label: 'Lower third', fontSize: 28, weight: 700, y: 82, color: '#ffffff' },
  credit: { label: 'Credit', fontSize: 22, weight: 500, y: 90, color: '#e2e8f0' },
}

const GENERATE_MODES = [
  { key: 'frame', label: 'Frame to Video', icon: '\uD83D\uDDBC\uFE0F', hint: 'Animate a start frame, optionally guided by a reference image.' },
  { key: 'text', label: 'Text to Video', icon: '\u2728', hint: 'Generate a scene directly from a written description.' },
  { key: 'character', label: 'Character to Video', icon: '\uD83E\uDDD1', hint: 'Keep a saved persona consistent across the generated scene.' },
  { key: 'extend', label: 'Extend Clip', icon: '\u23E9', hint: 'Continue an existing clip using its last frame as the start.' },
]

// Both the live preview and the exported frames read this, so what you see is
// what gets rendered.
const buildClipFilter = (clip) => {
  if (!clip) return 'none'
  const effects = { ...DEFAULT_EFFECTS, ...(clip.effects ?? {}) }
  const preset = FILTER_PRESETS[clip.filter ?? 'none']?.css ?? ''
  const adjustments = [
    `brightness(${effects.brightness}%)`,
    `contrast(${effects.contrast}%)`,
    `saturate(${effects.saturate}%)`,
    `hue-rotate(${effects.hue}deg)`,
    effects.blur > 0 ? `blur(${effects.blur}px)` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return [preset, adjustments].filter(Boolean).join(' ') || 'none'
}

// Transitions are time-based opacity/scale ramps at the clip edges.
const transitionStateAt = (clip, localTime) => {
  const length = 0.6
  const kind = clip?.transition ?? 'none'
  if (kind === 'none' || !clip) return { opacity: 1, scale: 1, offset: 0, clip: 0 }

  const fadingIn = localTime < length
  const fadingOut = localTime > clip.duration - length
  if (!fadingIn && !fadingOut) return { opacity: 1, scale: 1, offset: 0, clip: 0 }

  const progress = fadingIn ? localTime / length : (clip.duration - localTime) / length
  const eased = Math.max(0, Math.min(1, progress))

  if (kind === 'fade') return { opacity: eased, scale: 1, offset: 0, clip: 0 }
  if (kind === 'zoom') return { opacity: eased, scale: 1 + (1 - eased) * 0.25, offset: 0, clip: 0 }
  if (kind === 'slide') return { opacity: 1, scale: 1, offset: (1 - eased) * (fadingIn ? -1 : 1), clip: 0 }
  if (kind === 'wipe') return { opacity: 1, scale: 1, offset: 0, clip: 1 - eased }

  return { opacity: 1, scale: 1, offset: 0, clip: 0 }
}

const clipEnd = (clip) => clip.startTime + clip.duration

const getClipTransform = (clip) => ({ ...DEFAULT_TRANSFORM, ...(clip?.transform ?? {}) })

export function VideoEditor({ assets, onExport, brief, agentConfig, onAddAsset }) {
  const [tracks, setTracks] = useState([
    { id: 'video-1', type: 'video', name: 'Video Track 1', clips: [], muted: false, locked: false, visible: true },
    { id: 'text-1', type: 'text', name: 'Text Track 1', clips: [], muted: false, locked: false, visible: true },
    { id: 'audio-1', type: 'audio', name: 'Audio Track 1', clips: [], muted: false, locked: false, visible: true },
  ])
  const [selectedClip, setSelectedClip] = useState(null)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(30)
  const [zoom, setZoom] = useState(1)
  const [activeToolbar, setActiveToolbar] = useState('media')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingError, setRecordingError] = useState('')
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 })
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [projectSettings, setProjectSettings] = useState({ aspectRatio: '16:9', frameRate: 30, previewScale: 100 })
  const [editTool, setEditTool] = useState('select')
  const [inspectorTab, setInspectorTab] = useState('video')
  const focusMode = useEditorFocusMode()
  const [masterAudio, setMasterAudio] = useState(DEFAULT_MASTER_AUDIO)
  const [masterLevel, setMasterLevel] = useState(-Infinity)
  const [waveforms, setWaveforms] = useState({})
  const audioCtxRef = useRef(null)
  const masterBusRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaChainsRef = useRef(new WeakMap())
  const audioElementsRef = useRef(new Map())
  const decodedAudioRef = useRef(new Map())
  const [voiceStatus, setVoiceStatus] = useState('idle')
  const [voiceCountdown, setVoiceCountdown] = useState(0)
  const [voiceSeconds, setVoiceSeconds] = useState(0)
  const [voiceLevel, setVoiceLevel] = useState(-Infinity)
  const [voiceError, setVoiceError] = useState('')
  const [voiceDevices, setVoiceDevices] = useState([])
  const [voiceDeviceId, setVoiceDeviceId] = useState('')
  const [voicePlayAlong, setVoicePlayAlong] = useState(true)
  const [voiceLastTake, setVoiceLastTake] = useState(null)
  const [libraryKind, setLibraryKind] = useState(null)
  const voiceRef = useRef({ recorder: null, stream: null, timer: null, meterFrame: 0, startTime: 0, startedAt: 0, cancelled: false })
  const clipCounter = useRef(0)
  const timelineRef = useRef(null)
  const timelineHeaderRef = useRef(null)
  const timelineTracksRef = useRef(null)
  const stageRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const historyRef = useRef({ past: [], future: [] })
  const rafRef = useRef(0)
  const nextLocalId = (prefix) => `${prefix}-${(clipCounter.current += 1)}`

  // AI video generation panel — a dedicated screen toggled from the toolbar,
  // separate from timeline editing state.
  const [generateMode, setGenerateMode] = useState('text')
  const [generateStartFrameId, setGenerateStartFrameId] = useState('')
  const [generatePersonaId, setGeneratePersonaId] = useState('')
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [generateReferenceIds, setGenerateReferenceIds] = useState([])
  const [generateAspectRatio, setGenerateAspectRatio] = useState('16:9')
  const [generateDuration, setGenerateDuration] = useState(6)
  const [generateQuality, setGenerateQuality] = useState('high')
  const [generateBusy, setGenerateBusy] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [generateResults, setGenerateResults] = useState([])
  const generateResultCounter = useRef(0)

  const generateAssets = (assets ?? []).filter((asset) => asset.type === 'image' || asset.type === 'video')
  const generatePersonas = agentConfig?.personas ?? []

  const syncHistoryCounts = () => {
    setHistoryCounts({
      past: historyRef.current.past.length,
      future: historyRef.current.future.length,
    })
  }

  const commitHistory = () => {
    historyRef.current.past.push(tracks)
    if (historyRef.current.past.length > 50) historyRef.current.past.shift()
    historyRef.current.future = []
    syncHistoryCounts()
  }

  const undo = () => {
    const previous = historyRef.current.past.pop()
    if (!previous) return
    historyRef.current.future.push(tracks)
    setTracks(previous)
    setSelectedClip(null)
    syncHistoryCounts()
  }

  const redo = () => {
    const next = historyRef.current.future.pop()
    if (!next) return
    historyRef.current.past.push(tracks)
    setTracks(next)
    setSelectedClip(null)
    syncHistoryCounts()
  }

  useEffect(() => {
    const voice = voiceRef.current
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
      audioCtxRef.current?.close().catch(() => {})
      clearInterval(voice.timer)
      cancelAnimationFrame(voice.meterFrame)
      voice.cancelled = true
      if (voice.recorder?.state === 'recording') voice.recorder.stop()
      voice.stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Must run inside a click handler: browsers only allow audio to start from a user gesture.
  const ensureAudioContext = () => {
    if (audioCtxRef.current) {
      audioCtxRef.current.resume().catch(() => {})
      return audioCtxRef.current
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext
    if (!AudioContextClass) return null
    const context = new AudioContextClass()
    const bus = createMasterBus(context, masterAudio)
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    bus.output.connect(analyser)
    analyser.connect(context.destination)
    audioCtxRef.current = context
    masterBusRef.current = bus
    analyserRef.current = analyser
    return context
  }

  const routeMediaElement = (element) => {
    const context = audioCtxRef.current
    if (!context || !element) return null
    const existing = mediaChainsRef.current.get(element)
    if (existing) return existing
    try {
      const source = context.createMediaElementSource(element)
      const cleanup = createCleanupChain(context, false)
      const fxIn = context.createGain()
      const fxOut = context.createGain()
      const eq = createEqChain(context, null)
      const gain = context.createGain()
      gain.gain.value = 0
      source.connect(cleanup.input)
      cleanup.output.connect(fxIn)
      fxIn.connect(fxOut)
      fxOut.connect(eq.input)
      eq.output.connect(gain)
      gain.connect(masterBusRef.current.input)
      element.volume = 1
      const chain = { cleanup, fxIn, fxOut, fx: null, fxKey: 'none', eq, gain, eqKey: '', noise: false }
      mediaChainsRef.current.set(element, chain)
      return chain
    } catch {
      return null
    }
  }

  const applyClipAudio = (element, clip, gainValue) => {
    const chain = routeMediaElement(element)
    if (!chain) {
      element.volume = Math.max(0, Math.min(1, gainValue))
      return
    }
    const context = audioCtxRef.current
    const eqKey = normalizeEq(clip.eq).join(',')
    if (chain.eqKey !== eqKey) {
      updateEqChain(chain.eq, clip.eq, context)
      chain.eqKey = eqKey
    }
    if (chain.noise !== Boolean(clip.noiseRemoval)) {
      updateCleanupChain(chain.cleanup, clip.noiseRemoval)
      chain.noise = Boolean(clip.noiseRemoval)
    }
    const fxKey = clip.voiceFx ?? 'none'
    if (chain.fxKey !== fxKey) {
      chain.fxIn.disconnect()
      chain.fx?.stop()
      chain.fx = fxKey === 'none' ? null : createVoiceEffect(context, fxKey)
      if (chain.fx) {
        chain.fxIn.connect(chain.fx.input)
        chain.fx.output.connect(chain.fxOut)
      } else {
        chain.fxIn.connect(chain.fxOut)
      }
      chain.fxKey = fxKey
    }
    chain.gain.gain.setTargetAtTime(gainValue, context.currentTime, 0.015)
  }

  const decodeAudioSource = (src) => {
    if (!src) return Promise.resolve(null)
    const cache = decodedAudioRef.current
    if (!cache.has(src)) {
      cache.set(src, (async () => {
        try {
          const response = await fetch(src)
          const data = await response.arrayBuffer()
          return await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data)
        } catch {
          return null
        }
      })())
    }
    return cache.get(src)
  }

  const requestWaveform = (src) => {
    if (!src || waveforms[src]) return
    decodeAudioSource(src).then((buffer) => {
      if (buffer) setWaveforms((current) => (current[src] ? current : { ...current, [src]: computePeaks(buffer) }))
    })
  }

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false)
      setMasterLevel(-Infinity)
      return
    }
    ensureAudioContext()
    setIsPlaying(true)
  }

  const updateMasterAudio = (patch) => setMasterAudio((current) => ({ ...current, ...patch }))

  const releaseVoiceInput = () => {
    const voice = voiceRef.current
    clearInterval(voice.timer)
    cancelAnimationFrame(voice.meterFrame)
    voice.stream?.getTracks().forEach((track) => track.stop())
    voice.stream = null
    setVoiceLevel(-Infinity)
  }

  const addVoiceTake = (blob, startTime, length) => {
    const url = URL.createObjectURL(blob)
    const takeNumber = (clipCounter.current += 1)
    const name = `Voice-over ${takeNumber}.webm`
    const clip = {
      id: `clip-${takeNumber}`,
      assetId: `voice-${takeNumber}`,
      assetName: `Voice-over ${takeNumber}`,
      previewUrl: url,
      startTime,
      duration: length,
      trim: { start: 0, end: length },
      filter: 'none',
      effects: { ...DEFAULT_EFFECTS },
      transition: 'none',
      volume: 100,
      fadeIn: 0,
      fadeOut: 0,
      eq: [...EQ_PRESETS.voice.gains],
      zones: [],
      noiseRemoval: true,
      speed: 1,
      transform: { ...DEFAULT_TRANSFORM },
    }
    const overlaps = (track) => track.clips.some((item) => item.startTime < startTime + length && clipEnd(item) > startTime)
    const target = tracks.find((track) => track.type === 'audio' && !track.locked && !overlaps(track))

    commitHistory()
    setTracks((current) => (target
      ? current.map((track) => (track.id === target.id ? { ...track, clips: [...track.clips, clip] } : track))
      : [...current, { id: `audio-${(clipCounter.current += 1)}`, type: 'audio', name: `Voice-over Track ${current.filter((track) => track.type === 'audio').length + 1}`, clips: [clip], muted: false, locked: false, visible: true }]))
    setDuration((current) => Math.max(current, Math.ceil(startTime + length)))
    setSelectedClip(clip)
    setVoiceLastTake({ url, name })
    requestWaveform(url)
    setStatusMessage(`Added ${clip.assetName} (${length.toFixed(1)}s) at ${startTime.toFixed(1)}s. Voice clarity EQ applied — adjust it in the Audio tab.`)
  }

  // The recorder's onstop fires long after the render that started it; always use the newest tracks.
  const addVoiceTakeRef = useRef(addVoiceTake)
  useEffect(() => {
    addVoiceTakeRef.current = addVoiceTake
  })

  const beginVoiceRecording = () => {
    const voice = voiceRef.current
    if (voice.cancelled || !voice.stream) return
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported?.(type))
    const recorder = new MediaRecorder(voice.stream, mimeType ? { mimeType } : undefined)
    const chunks = []
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
    recorder.onstop = () => {
      const length = (performance.now() - voice.startedAt) / 1000
      releaseVoiceInput()
      setVoiceStatus('idle')
      if (voice.cancelled) return
      if (length < 0.3 || !chunks.length) {
        setVoiceError('The recording was too short. Try again.')
        return
      }
      addVoiceTakeRef.current(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), voice.startTime, Number(length.toFixed(2)))
    }
    voice.recorder = recorder
    voice.startTime = playbackTime
    voice.startedAt = performance.now()
    recorder.start(250)
    setVoiceStatus('recording')
    setVoiceSeconds(0)
    voice.timer = setInterval(() => setVoiceSeconds((performance.now() - voice.startedAt) / 1000), 200)
    if (voicePlayAlong) setIsPlaying(true)
  }

  const startVoiceOver = async () => {
    setVoiceError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('This browser cannot record audio. Try a current Chrome, Edge, or Safari.')
      return
    }
    const context = voicePlayAlong ? ensureAudioContext() : null
    setIsPlaying(false)
    const voice = voiceRef.current
    voice.cancelled = false
    try {
      voice.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: voiceDeviceId ? { exact: voiceDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (error) {
      setVoiceError(error.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow the microphone in your browser\'s site settings, then try again.'
        : error.name === 'NotFoundError' ? 'No microphone was found. Plug one in and try again.' : `Could not start the microphone: ${error.message}`)
      return
    }

    navigator.mediaDevices.enumerateDevices()
      .then((devices) => setVoiceDevices(devices.filter((device) => device.kind === 'audioinput')))
      .catch(() => {})

    const meterContext = context ?? ensureAudioContext()
    if (meterContext) {
      const analyser = meterContext.createAnalyser()
      analyser.fftSize = 1024
      meterContext.createMediaStreamSource(voice.stream).connect(analyser)
      const data = new Float32Array(analyser.fftSize)
      const readMeter = () => {
        analyser.getFloatTimeDomainData(data)
        const peak = data.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
        setVoiceLevel(peak > 0 ? 20 * Math.log10(peak) : -Infinity)
        voice.meterFrame = requestAnimationFrame(readMeter)
      }
      voice.meterFrame = requestAnimationFrame(readMeter)
    }

    let remaining = 3
    setVoiceCountdown(remaining)
    setVoiceStatus('countdown')
    voice.timer = setInterval(() => {
      remaining -= 1
      if (remaining > 0) {
        setVoiceCountdown(remaining)
        return
      }
      clearInterval(voice.timer)
      beginVoiceRecording()
    }, 1000)
  }

  const stopVoiceOver = () => {
    const recorder = voiceRef.current.recorder
    if (recorder?.state === 'recording') recorder.stop()
    if (voicePlayAlong) setIsPlaying(false)
  }

  const cancelVoiceOver = () => {
    const voice = voiceRef.current
    voice.cancelled = true
    if (voice.recorder?.state === 'recording') voice.recorder.stop()
    else {
      releaseVoiceInput()
      setVoiceStatus('idle')
    }
    setIsPlaying(false)
    setStatusMessage('Voice-over recording cancelled.')
  }

  useEffect(() => {
    const bus = masterBusRef.current
    if (!bus) return
    updateEqChain(bus.eq, masterAudio.eq, audioCtxRef.current)
    setMasterLimiter(bus, masterAudio.limiter)
  }, [masterAudio])

  const startScreenRecord = async (withAudio) => {
    setRecordingError('')
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: withAudio,
      })

      let finalStream = displayStream
      if (withAudio) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          const ctx = new AudioContext()
          const dest = ctx.createMediaStreamDestination()
          if (displayStream.getAudioTracks().length) ctx.createMediaStreamSource(displayStream).connect(dest)
          ctx.createMediaStreamSource(micStream).connect(dest)
          finalStream = new MediaStream([...displayStream.getVideoTracks(), ...dest.stream.getAudioTracks()])
        } catch {
          // mic unavailable — record screen-only audio
        }
      }

      chunksRef.current = []
      const recorder = new MediaRecorder(finalStream, { mimeType: 'video/webm;codecs=vp9,opus' })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        clearInterval(timerRef.current)
        displayStream.getTracks().forEach((t) => t.stop())
        finalStream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const clip = {
          id: `clip-${(clipCounter.current += 1)}`,
          assetId: nextLocalId('rec'),
          assetName: `Screen recording ${new Date().toLocaleTimeString()}`,
          startTime: playbackTime,
          duration: recordingSeconds || 1,
          trim: { start: 0, end: recordingSeconds || 1 },
          previewUrl: url,
        }
        setTracks((prev) => prev.map((t) => t.type === 'video' ? { ...t, clips: [...t.clips, clip] } : t))
        setIsRecording(false)
        setRecordingSeconds(0)
      }

      // Stop recording when user ends screen share via browser UI
      displayStream.getVideoTracks()[0].addEventListener('ended', () => recorder.state === 'recording' && recorder.stop())

      recorder.start(100)
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    } catch (err) {
      setRecordingError(err.name === 'NotAllowedError' ? 'Screen access was denied.' : `Recording failed: ${err.message}`)
    }
  }

  const stopScreenRecord = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }

  const handleAddTrack = (type) => {
    const newTrack = {
      id: `${type}-${(clipCounter.current += 1)}`,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Track ${tracks.filter((t) => t.type === type).length + 1}`,
      clips: [],
      muted: false,
      locked: false,
      visible: true,
    }
    setTracks((prev) => [...prev, newTrack])
  }

  const toggleGenerateReference = (assetId) => {
    setGenerateReferenceIds((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId].slice(0, 2))
  }

  const generateVideo = async () => {
    if (!agentConfig?.enabled || !agentConfig?.endpoint || !canUseAgentMode(agentConfig, 'video')) {
      setGenerateError('Enable the video capability for your in-house AI in Integrations first.')
      return
    }
    if (!generatePrompt.trim()) {
      setGenerateError('Describe the scene, movement, camera, and mood you want to create.')
      return
    }

    setGenerateBusy(true)
    setGenerateError('')
    try {
      const references = generateAssets.filter((asset) => generateReferenceIds.includes(asset.id))
      const persona = generatePersonas.find((item) => item.id === generatePersonaId) || null
      const output = await runCreativeAgentJob({
        agentConfig,
        capability: 'video',
        prompt: generatePrompt,
        persona,
        references,
        settings: {
          aspectRatio: generateAspectRatio,
          durationSeconds: generateDuration,
          quality: generateQuality,
          mode: generateMode,
          startFrameId: generateStartFrameId || null,
          returnEditableMetadata: true,
        },
      })
      setGenerateResults((current) => [{ ...output, id: `generation-${(generateResultCounter.current += 1)}` }, ...current])
    } catch (error) {
      setGenerateError(error.message)
    } finally {
      setGenerateBusy(false)
    }
  }

  const saveGeneratedVideo = (result, media, index) => {
    const asset = {
      id: nextLocalId('asset'),
      name: `${result.title || 'ai-video'}-${index + 1}.webm`,
      type: media.kind === 'video' ? 'video' : 'image',
      mime: media.mime || (media.kind === 'video' ? 'video/webm' : 'image/png'),
      size: 0,
      folderId: 'folder-root',
      createdAt: new Date().toISOString(),
      previewUrl: media.src,
      summary: 'Generated by the in-house AI video studio',
    }
    onAddAsset?.(asset)
    setStatusMessage(`Saved ${asset.name} to the workspace.`)
  }

  const addGeneratedVideoToTimeline = (result, media) => {
    const asset = {
      id: nextLocalId('generated'),
      name: `${result.title || 'AI generated scene'}.webm`,
      type: 'video',
      mime: media.mime || 'video/webm',
      previewUrl: media.src,
    }
    const targetTrack = tracks.find((track) => track.type === 'video')
    if (!targetTrack) return
    handleDropAssetToTrack(targetTrack.id, asset)
    setStatusMessage('Added the generated scene to the video timeline.')
  }

  const handleRemoveTrack = (trackId) => {
    setTracks((prev) => prev.filter((track) => track.id !== trackId))
  }

  const handleDropAssetToTrack = (trackId, asset) => {
    const source = asset.previewUrl || asset.url || ''
    if (!source) {
      setStatusMessage(`${asset.name} has no playable preview. Re-upload the original file first.`)
      return
    }

    const track = tracks.find((item) => item.id === trackId)
    if (track?.locked) {
      setStatusMessage('Unlock this track before adding media.')
      return
    }
    const clipDuration = Math.max(0.1, Number(asset.duration) || (asset.type === 'video' ? 3 : 5))
    const newClip = {
      id: `clip-${(clipCounter.current += 1)}`,
      assetId: asset.id,
      assetName: asset.name,
      previewUrl: source,
      credit: asset.credit,
      startTime: playbackTime,
      duration: clipDuration,
      trim: { start: 0, end: clipDuration },
      filter: 'none',
      effects: { ...DEFAULT_EFFECTS },
      transition: 'none',
      volume: 100,
      fadeIn: 0,
      fadeOut: 0,
      eq: normalizeEq(null),
      zones: [],
      noiseRemoval: false,
      speed: 1,
      transform: { ...DEFAULT_TRANSFORM },
    }

    commitHistory()
    setTracks((prev) =>
      prev.map((item) =>
        item.id === trackId ? { ...item, clips: [...item.clips, newClip] } : item,
      ),
    )
    setDuration((current) => Math.max(current, Math.ceil(playbackTime + clipDuration)))
    if (asset.type !== 'image') requestWaveform(source)
  }

  const addAssetAtPlayhead = (asset) => {
    const targetTrack = tracks.find((track) => {
      if (asset.type === 'video') return track.type === 'video'
      if (asset.type === 'image') return track.type === 'video'
      if (asset.mime?.startsWith('audio/')) return track.type === 'audio'
      return false
    })

    if (!targetTrack) {
      setStatusMessage(`Add a compatible track before using ${asset.name}.`)
      return
    }

    handleDropAssetToTrack(targetTrack.id, asset)
    setStatusMessage(`Added ${asset.name} at ${playbackTime.toFixed(1)}s.`)
  }

  const addFromStockLibrary = async (item, quality) => {
    const isSound = item.kind === 'sound'
    const rendition = isSound ? null : item.renditions?.[quality] ?? item.renditions?.hd ?? item.renditions?.sd
    if (!isSound && !rendition) throw new Error('This video has no downloadable version.')
    const mime = isSound ? 'audio/mpeg' : 'video/mp4'
    setStatusMessage(`Downloading ${item.title}…`)
    const previewUrl = await downloadMediaLibraryFile(isSound ? item.url : rendition.url, mime)
    addAssetAtPlayhead({
      id: nextLocalId('stock'),
      name: item.title,
      type: isSound ? 'audio' : 'video',
      mime,
      previewUrl,
      duration: item.duration,
      credit: `${item.title} by ${item.creator} — ${item.license}`,
    })
  }

  const handleUploadVideo = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setStatusMessage('Choose an MP4 or another supported video file.')
      event.target.value = ''
      return
    }

    const asset = {
      id: nextLocalId('video-upload'),
      name: file.name,
      type: 'video',
      mime: file.type,
      previewUrl: URL.createObjectURL(file),
      size: file.size,
      summary: 'Uploaded directly to Video Editor',
    }
    onAddAsset?.(asset)
    addAssetAtPlayhead(asset)
    event.target.value = ''
  }

  const updateClip = (clipId, patch) => {
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
      })),
    )
    setSelectedClip((prev) => (prev?.id === clipId ? { ...prev, ...patch } : prev))
  }

  const updateSelectedTransform = (key, value) => {
    if (!selectedClip) {
      setStatusMessage('Select a clip on the timeline first.')
      return
    }
    updateClip(selectedClip.id, {
      transform: { ...getClipTransform(selectedClip), [key]: value },
    })
  }

  const updateTrack = (trackId, patch) => {
    setTracks((current) => current.map((track) => track.id === trackId ? { ...track, ...patch } : track))
  }

  const detachSelectedAudio = () => {
    const clip = selectedClip
    const owner = clip && tracks.find((track) => track.clips.some((item) => item.id === clip.id))
    if (!clip || owner?.type !== 'video' || clip.audioDetached) return
    if (owner.locked) {
      setStatusMessage('Unlock this track before detaching audio.')
      return
    }
    const source = clipSource(clip)
    const audioClip = {
      ...clip,
      id: `clip-${(clipCounter.current += 1)}`,
      assetName: `${clip.assetName} (audio)`,
      previewUrl: source,
      audioDetached: false,
      detachedFrom: clip.id,
      transform: { ...DEFAULT_TRANSFORM },
    }
    const audioTrack = tracks.find((track) => track.type === 'audio' && !track.locked)

    commitHistory()
    setTracks((current) => {
      const next = current.map((track) => {
        if (track.id === owner.id) return { ...track, clips: track.clips.map((item) => (item.id === clip.id ? { ...item, audioDetached: true } : item)) }
        if (track.id === audioTrack?.id) return { ...track, clips: [...track.clips, audioClip] }
        return track
      })
      if (audioTrack) return next
      return [...next, {
        id: `audio-${(clipCounter.current += 1)}`,
        type: 'audio',
        name: `Audio Track ${current.filter((track) => track.type === 'audio').length + 1}`,
        clips: [audioClip],
        muted: false,
        locked: false,
        visible: true,
      }]
    })
    setSelectedClip(audioClip)
    requestWaveform(source)
    setStatusMessage('Detached the audio to its own track. The video clip is now silent.')
  }

  const removeSelectedClip = (ripple = false) => {
    if (!selectedClip) {
      setStatusMessage('Select a clip on the timeline first.')
      return
    }
    const owner = tracks.find((track) => track.clips.some((clip) => clip.id === selectedClip.id))
    if (!owner || owner.locked) {
      setStatusMessage(owner?.locked ? 'Unlock this track before editing it.' : 'Clip track was not found.')
      return
    }

    commitHistory()
    setTracks((current) => current.map((track) => {
      if (track.id !== owner.id) return track
      return {
        ...track,
        clips: track.clips
          .filter((clip) => clip.id !== selectedClip.id)
          .map((clip) => ripple && clip.startTime >= clipEnd(selectedClip)
            ? { ...clip, startTime: Math.max(0, clip.startTime - selectedClip.duration) }
            : clip),
      }
    }))
    setSelectedClip(null)
    setStatusMessage(ripple ? 'Removed clip and closed the gap.' : 'Removed selected clip.')
  }

  const matchSelectedColor = () => {
    if (!selectedClip) {
      setStatusMessage('Select a clip to color match.')
      return
    }
    const visualClips = tracks.filter((track) => track.type === 'video').flatMap((track) => track.clips)
    const reference = visualClips.find((clip) => clip.id !== selectedClip.id)
    if (!reference) {
      setStatusMessage('Add another video clip to use as a color reference.')
      return
    }
    commitHistory()
    updateSelectedClip({ filter: reference.filter ?? 'none', effects: { ...DEFAULT_EFFECTS, ...(reference.effects ?? {}) } })
    setStatusMessage(`Matched color to ${reference.assetName}.`)
  }

  const saveSnapshot = () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      setStatusMessage('Play or select a decodable video clip before taking a snapshot.')
      return
    }
    const preset = PROJECT_PRESETS[projectSettings.aspectRatio]
    const canvas = document.createElement('canvas')
    canvas.width = preset.width
    canvas.height = preset.height
    const ctx = canvas.getContext('2d')
    const transform = getClipTransform(activeVisualClip)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.globalAlpha = transform.opacity / 100
    ctx.globalCompositeOperation = transform.blendMode
    ctx.translate(canvas.width / 2 + transform.x * 10, canvas.height / 2 + transform.y * 10)
    ctx.rotate((transform.rotation * Math.PI) / 180)
    const scale = (transform.scale / 100) * activeTransition.scale
    ctx.scale(scale, scale)
    ctx.filter = buildClipFilter(activeVisualClip)
    ctx.drawImage(video, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height)
    ctx.restore()
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `${nextLocalId('echoai-snapshot')}.png`
    link.click()
    setStatusMessage('Saved a PNG snapshot of the current frame.')
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else stageRef.current?.requestFullscreen?.()
  }

  const updateSelectedClip = (patch) => {
    if (!selectedClip) {
      setStatusMessage('Select a clip on the timeline first.')
      return
    }
    commitHistory()
    updateClip(selectedClip.id, patch)
  }

  const updateSelectedEffect = (key, value) => {
    if (!selectedClip) {
      setStatusMessage('Select a clip on the timeline first.')
      return
    }
    updateClip(selectedClip.id, {
      effects: { ...DEFAULT_EFFECTS, ...(selectedClip.effects ?? {}), [key]: value },
    })
  }

  // Razor: cuts the clip under the playhead into two independent clips.
  const splitAtPlayhead = () => {
    const target = tracks
      .flatMap((track) => track.clips.map((clip) => ({ track, clip })))
      .find(({ clip }) => playbackTime > clip.startTime && playbackTime < clipEnd(clip))

    if (!target) {
      setStatusMessage('Move the playhead over a clip to split it.')
      return
    }

    const { track, clip } = target
    const offset = playbackTime - clip.startTime
    const trimStart = clip.trim?.start ?? 0

    const left = {
      ...clip,
      duration: offset,
      trim: { start: trimStart, end: trimStart + offset },
    }
    const right = {
      ...clip,
      id: `clip-${(clipCounter.current += 1)}`,
      startTime: playbackTime,
      duration: clip.duration - offset,
      trim: { start: trimStart + offset, end: trimStart + clip.duration },
    }

    commitHistory()
    setTracks((prev) =>
      prev.map((item) =>
        item.id === track.id
          ? { ...item, clips: item.clips.flatMap((c) => (c.id === clip.id ? [left, right] : [c])) }
          : item,
      ),
    )
    setStatusMessage('Split the clip at the playhead.')
  }

  const duplicateSelectedClip = () => {
    if (!selectedClip) {
      setStatusMessage('Select a clip to duplicate.')
      return
    }

    const owner = tracks.find((track) => track.clips.some((clip) => clip.id === selectedClip.id))
    if (!owner) return

    const copy = {
      ...selectedClip,
      id: `clip-${(clipCounter.current += 1)}`,
      startTime: clipEnd(selectedClip),
    }

    commitHistory()
    setTracks((prev) =>
      prev.map((track) =>
        track.id === owner.id ? { ...track, clips: [...track.clips, copy] } : track,
      ),
    )
    setSelectedClip(copy)
  }

  const addTextClip = (presetKey, value = null) => {
    const preset = TEXT_PRESETS[presetKey]
    const textTrack = tracks.find((track) => track.type === 'text')

    if (!textTrack) {
      setStatusMessage('Add a text track first.')
      return
    }

    const clip = {
      id: `clip-${(clipCounter.current += 1)}`,
      type: 'text',
      assetName: value || preset.label,
      value: value || preset.label,
      startTime: playbackTime,
      duration: 4,
      trim: { start: 0, end: 4 },
      fontSize: preset.fontSize,
      weight: preset.weight,
      color: preset.color,
      y: preset.y,
      background: presetKey === 'lower_third' ? 'rgba(2, 6, 23, 0.65)' : 'transparent',
      transition: 'fade',
      effects: { ...DEFAULT_EFFECTS },
    }

    commitHistory()
    setTracks((prev) =>
      prev.map((track) => (track.id === textTrack.id ? { ...track, clips: [...track.clips, clip] } : track)),
    )
    setSelectedClip(clip)
    setStatusMessage(`Added a ${preset.label.toLowerCase()} overlay.`)
  }

  const addBriefStoryboard = () => {
    const textTrack = tracks.find((track) => track.type === 'text')
    if (!textTrack || !brief?.scenes?.length) return
    const clips = brief.scenes.map((scene, index) => ({
      id: `clip-${(clipCounter.current += 1)}`,
      type: 'text',
      assetName: scene.title || `Scene ${index + 1}`,
      value: scene.direction || scene.title,
      startTime: index * 4,
      duration: 4,
      trim: { start: 0, end: 4 },
      fontSize: index === 0 ? 52 : 34,
      weight: index === 0 ? 800 : 600,
      color: '#ffffff',
      y: index === 0 ? 45 : 78,
      background: index === 0 ? 'transparent' : 'rgba(2, 6, 23, 0.65)',
      transition: 'fade',
      effects: { ...DEFAULT_EFFECTS },
    }))
    commitHistory()
    setTracks((current) => current.map((track) => track.id === textTrack.id ? { ...track, clips: [...track.clips, ...clips] } : track))
    setDuration((current) => Math.max(current, clips.length * 4))
    setStatusMessage('Added the generated scene plan to the text track.')
  }

  const handleRemoveClip = (trackId, clipId) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }
          : track,
      ),
    )
  }

  const handleMoveClip = (trackId, clipId, newStartTime) => {
    if (tracks.find((track) => track.id === trackId)?.locked) {
      setStatusMessage('Unlock this track before moving clips.')
      return
    }
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              clips: track.clips.map((clip) =>
                clip.id === clipId ? { ...clip, startTime: Math.max(0, newStartTime) } : clip,
              ),
            }
          : track,
      ),
    )
  }

  const handleTrimClip = (trackId, clipId, start, end) => {
    if (tracks.find((track) => track.id === trackId)?.locked) {
      setStatusMessage('Unlock this track before trimming clips.')
      return
    }
    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId
          ? {
              ...track,
              clips: track.clips.map((clip) =>
                clip.id === clipId ? { ...clip, trim: { start, end } } : clip,
              ),
            }
          : track,
      ),
    )
  }

  const timelinePixelsPerSecond = 40 * zoom
  const totalPixels = duration * timelinePixelsPerSecond
  const timelineLabelWidth = 270

  const syncTimelineScroll = (source) => {
    const target = source === 'header' ? timelineTracksRef.current : timelineHeaderRef.current
    const origin = source === 'header' ? timelineHeaderRef.current : timelineTracksRef.current
    if (target && origin) target.scrollLeft = origin.scrollLeft
  }

  const setTimelineTimeFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const scrollLeft = event.currentTarget.scrollLeft || 0
    const contentX = event.clientX - rect.left + scrollLeft - timelineLabelWidth
    setPlaybackTime(Math.max(0, Math.min(duration, contentX / timelinePixelsPerSecond)))
  }

  const scrubTimeline = (event) => {
    if (event.buttons === 1) setTimelineTimeFromPointer(event)
  }

  const assetById = useMemo(() => {
    const map = new Map()
    ;(assets ?? []).forEach((asset) => map.set(asset.id, asset))
    return map
  }, [assets])

  const clipSource = useCallback(
    (clip) => clip?.previewUrl || assetById.get(clip?.assetId)?.previewUrl || '',
    [assetById],
  )

  // The preview follows the playhead across the whole timeline rather than
  // showing a single hand-picked clip.
  const activeVisualClip = (() => {
    const visualTracks = tracks.filter((track) => track.type === 'video' && track.visible !== false)
    for (let index = visualTracks.length - 1; index >= 0; index -= 1) {
      const hit = visualTracks[index].clips.find(
        (clip) => playbackTime >= clip.startTime && playbackTime < clipEnd(clip),
      )
      if (hit) return hit
    }
    return null
  })()

  const activeTextClips = tracks
    .filter((track) => track.type === 'text' && track.visible !== false)
    .flatMap((track) => track.clips)
    .filter((clip) => playbackTime >= clip.startTime && playbackTime < clipEnd(clip))

  const previewAsset = activeVisualClip ? assetById.get(activeVisualClip.assetId) ?? null : null
  const previewSrc = clipSource(activeVisualClip)
  const previewType = previewAsset?.type
    ?? (activeVisualClip?.previewUrl ? 'video' : '')

  const videoRef = useRef(null)

  // Timeline clock. The playhead is the source of truth and the video element is
  // slaved to it, so multiple clips play back in sequence.
  useEffect(() => {
    if (!isPlaying) return undefined

    let last = performance.now()
    let frame = 0
    const meterData = new Float32Array(1024)
    const tick = (now) => {
      const delta = (now - last) / 1000
      last = now
      frame += 1
      if (analyserRef.current && frame % 4 === 0) {
        analyserRef.current.getFloatTimeDomainData(meterData)
        const peak = meterData.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
        setMasterLevel(peak > 0 ? 20 * Math.log10(peak) : -Infinity)
      }
      setPlaybackTime((prev) => {
        const next = prev + delta
        if (next >= duration) {
          setIsPlaying(false)
          return duration
        }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, duration])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeVisualClip) return

    const localTime = (playbackTime - activeVisualClip.startTime) * (activeVisualClip.speed ?? 1) + (activeVisualClip.trim?.start ?? 0)
    // Only correct real drift, otherwise every frame would reset the decoder.
    if (Math.abs(video.currentTime - localTime) > 0.35 && Number.isFinite(localTime)) {
      video.currentTime = Math.max(0, localTime)
    }

    if (isPlaying && video.paused) video.play().catch(() => {})
    if (!isPlaying && !video.paused) video.pause()
    video.playbackRate = activeVisualClip.speed ?? 1

    if (audioCtxRef.current) {
      const owner = tracks.find((track) => track.clips.some((clip) => clip.id === activeVisualClip.id))
      const silent = owner?.muted || activeVisualClip.audioDetached
      applyClipAudio(video, activeVisualClip, silent ? 0 : clipGainAt(activeVisualClip, playbackTime - activeVisualClip.startTime))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackTime, isPlaying, activeVisualClip, tracks])

  useEffect(() => {
    const context = audioCtxRef.current
    if (context && masterBusRef.current) {
      masterBusRef.current.gain.gain.setTargetAtTime(masterGainAt(masterAudio, playbackTime, duration), context.currentTime, 0.015)
    }

    tracks.forEach((track) => {
      if (track.type !== 'audio') return
      track.clips.forEach((clip) => {
        const element = audioElementsRef.current.get(clip.id)
        if (!element) return
        const localTime = playbackTime - clip.startTime
        const active = localTime >= 0 && localTime < clip.duration
        if (!active || !isPlaying) {
          if (!element.paused) element.pause()
          return
        }
        const speed = clip.speed ?? 1
        const target = localTime * speed + (clip.trim?.start ?? 0)
        if (Math.abs(element.currentTime - target) > 0.3 && Number.isFinite(target)) element.currentTime = Math.max(0, target)
        element.playbackRate = speed
        applyClipAudio(element, clip, track.muted ? 0 : clipGainAt(clip, localTime))
        if (element.paused) element.play().catch(() => {})
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackTime, isPlaying, tracks, masterAudio, duration])

  const activeTransition = activeVisualClip
    ? transitionStateAt(activeVisualClip, playbackTime - activeVisualClip.startTime)
    : { opacity: 1, scale: 1, offset: 0, clip: 0 }

  const snapTime = (value) => {
    if (!snapEnabled) return Math.max(0, value)

    const candidates = [0, duration, playbackTime]
    tracks.forEach((track) =>
      track.clips.forEach((clip) => {
        candidates.push(clip.startTime, clipEnd(clip))
      }),
    )

    const threshold = 6 / timelinePixelsPerSecond
    const nearest = candidates.find((candidate) => Math.abs(candidate - value) < threshold)
    return Math.max(0, nearest ?? value)
  }

  // Renders the timeline onto a canvas in real time and records it together with
  // the offline-rendered audio mix, both driven by the same clock so they stay in sync.
  const exportTimeline = async () => {
    const hasContent = tracks.some((track) => track.clips.length > 0)
    if (!hasContent) {
      setStatusMessage('Add at least one clip before exporting.')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setStatusMessage('This browser cannot record video exports.')
      return
    }

    // Created before any await so the click still counts as the user gesture for audio.
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext
    const exportAudio = AudioContextClass ? new AudioContextClass() : null
    exportAudio?.resume().catch(() => {})

    setIsExporting(true)
    setExportProgress(0)
    setIsPlaying(false)
    setStatusMessage('Mixing audio...')

    const preset = PROJECT_PRESETS[projectSettings.aspectRatio]
    const width = preset.width
    const height = preset.height
    const fps = projectSettings.frameRate
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // Off-screen decoders, one per distinct source, seeked frame by frame.
    const videoElements = new Map()
    const visualClips = tracks
      .filter((track) => track.type === 'video' && track.visible !== false)
      .flatMap((track) => track.clips)

    try {
      await Promise.all(
        visualClips.map(async (clip) => {
          const src = clipSource(clip)
          if (!src || videoElements.has(clip.id)) return
          const element = document.createElement('video')
          element.crossOrigin = 'anonymous'
          element.src = src
          element.muted = true
          element.playsInline = true
          await new Promise((resolve) => {
            element.onloadeddata = resolve
            element.onerror = resolve
          })
          videoElements.set(clip.id, element)
        }),
      )

      const mix = await renderTimelineMix({ tracks, master: masterAudio, duration, decode: decodeAudioSource })
      setStatusMessage('Rendering timeline...')

      const canvasStream = canvas.captureStream(fps)
      let clock = null
      let mixSource = null
      const streamTracks = [...canvasStream.getVideoTracks()]
      if (mix && exportAudio) {
        await exportAudio.resume().catch(() => {})
        if (exportAudio.state === 'running') {
          const destination = exportAudio.createMediaStreamDestination()
          mixSource = exportAudio.createBufferSource()
          mixSource.buffer = mix
          mixSource.connect(destination)
          streamTracks.push(...destination.stream.getAudioTracks())
        } else {
          setStatusMessage('The browser blocked audio for this export. Click Export again to include sound.')
        }
      }
      const stream = new MediaStream(streamTracks)
      const withAudio = Boolean(mixSource)
      const preferredType = withAudio ? 'video/webm;codecs=vp9,opus' : 'video/webm;codecs=vp9'
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported?.(preferredType) ? { mimeType: preferredType } : undefined)
      const chunks = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }

      const finished = new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
      })

      recorder.start()
      if (withAudio) {
        const startAt = exportAudio.currentTime + 0.05
        mixSource.start(startAt)
        clock = () => exportAudio.currentTime - startAt
      } else {
        const startAt = performance.now()
        clock = () => (performance.now() - startAt) / 1000
      }

      const syncElement = (element, clip, time) => {
        if (!element) return
        const localTime = (time - clip.startTime) * (clip.speed ?? 1) + (clip.trim?.start ?? 0)
        element.playbackRate = clip.speed ?? 1
        if (element.paused) {
          element.currentTime = Math.max(0, localTime)
          element.play().catch(() => {})
        } else if (Math.abs(element.currentTime - localTime) > 0.25) {
          element.currentTime = Math.max(0, localTime)
        }
      }

      let lastProgress = -1
      for (;;) {
        const time = Math.max(0, clock())
        if (time >= duration) break

        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, width, height)

        const frameClip = visualClips.find(
          (clip) => time >= clip.startTime && time < clipEnd(clip),
        )
        videoElements.forEach((element, clipId) => {
          if (clipId !== frameClip?.id && !element.paused) element.pause()
        })

        if (frameClip) {
          const element = videoElements.get(frameClip.id)
          syncElement(element, frameClip, time)

          const transition = transitionStateAt(frameClip, time - frameClip.startTime)
          ctx.save()
          ctx.globalAlpha = transition.opacity
          ctx.filter = buildClipFilter(frameClip)

          if (transition.clip > 0) {
            ctx.beginPath()
            ctx.rect(0, 0, width * (1 - transition.clip), height)
            ctx.clip()
          }

          const transform = getClipTransform(frameClip)

          if (element && element.readyState >= 2) {
            ctx.save()
            ctx.globalAlpha = transition.opacity * (transform.opacity / 100)
            ctx.globalCompositeOperation = transform.blendMode
            ctx.translate(width / 2 + transform.x * 10 + transition.offset * width, height / 2 + transform.y * 10)
            ctx.rotate((transform.rotation * Math.PI) / 180)
            ctx.scale((transform.scale / 100) * transition.scale, (transform.scale / 100) * transition.scale)
            ctx.drawImage(element, -width / 2, -height / 2, width, height)
            ctx.restore()
          } else {
            const asset = assetById.get(frameClip.assetId)
            ctx.fillStyle = '#0f172a'
            ctx.fillRect(0, 0, width, height)
            ctx.fillStyle = '#94a3b8'
            ctx.font = '28px Inter, system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(asset?.name ?? frameClip.assetName ?? 'Clip', width / 2, height / 2)
          }
          ctx.restore()
        }

        tracks
          .filter((track) => track.type === 'text' && track.visible !== false)
          .flatMap((track) => track.clips)
          .filter((clip) => time >= clip.startTime && time < clipEnd(clip))
          .forEach((clip) => {
            const transition = transitionStateAt(clip, time - clip.startTime)
            ctx.save()
            ctx.globalAlpha = transition.opacity
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.font = `${clip.weight} ${clip.fontSize}px Inter, system-ui, sans-serif`

            const y = (clip.y / 100) * height
            if (clip.background && clip.background !== 'transparent') {
              const metrics = ctx.measureText(clip.value)
              ctx.fillStyle = clip.background
              ctx.fillRect(
                width / 2 - metrics.width / 2 - 24,
                y - clip.fontSize / 2 - 14,
                metrics.width + 48,
                clip.fontSize + 28,
              )
            }

            ctx.fillStyle = clip.color
            ctx.shadowColor = 'rgba(2, 6, 23, 0.6)'
            ctx.shadowBlur = 12
            ctx.fillText(clip.value, width / 2, y)
            ctx.restore()
          })

        const progress = Math.round((time / duration) * 100)
        if (progress !== lastProgress) {
          lastProgress = progress
          setExportProgress(progress)
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 / fps))
      }

      recorder.stop()
      mixSource?.stop()
      const blob = await finished
      const url = URL.createObjectURL(blob)
      const exportName = `${nextLocalId('echoai-timeline')}.webm`

      const link = document.createElement('a')
      link.href = url
      link.download = exportName
      link.click()

      onExport?.({
        exportName,
        blob,
        previewUrl: url,
        durationSeconds: duration,
        sizeBytes: blob.size,
        tracks,
        totalClips: tracks.reduce((sum, track) => sum + track.clips.length, 0),
        summary: `Video timeline exported at ${width}x${height} at ${fps} fps${withAudio ? ' with mixed audio' : ''}.`,
      })

      setStatusMessage(`Exported ${exportName}${withAudio ? ' with audio' : ''}.`)
    } catch (error) {
      setStatusMessage(`Export failed: ${error.message}`)
    } finally {
      videoElements.forEach((element) => {
        element.pause()
        element.src = ''
      })
      exportAudio?.close().catch(() => {})
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  const selectedOwner = selectedClip ? tracks.find((track) => track.clips.some((clip) => clip.id === selectedClip.id)) : null
  const selectedIsVideoClip = selectedOwner?.type === 'video' && selectedClip?.type !== 'text' && (assetById.get(selectedClip?.assetId)?.type ?? 'video') === 'video'
  const audioEditableClip = selectedOwner?.type === 'audio' || selectedIsVideoClip ? selectedClip : null
  const openAudioMixer = () => {
    setActiveToolbar('audio')
    setInspectorTab('audio')
  }
  const stageRatio = PROJECT_PRESETS[projectSettings.aspectRatio].width / PROJECT_PRESETS[projectSettings.aspectRatio].height
  const clipAudioControls = (
    <ClipAudioControls
      clip={audioEditableClip}
      isVideoClip={selectedIsVideoClip}
      localPlayhead={audioEditableClip ? playbackTime - audioEditableClip.startTime : 0}
      peakDb={audioEditableClip ? clipPeakGainDb(audioEditableClip) : -Infinity}
      onCommit={commitHistory}
      onChange={(patch) => audioEditableClip && updateClip(audioEditableClip.id, patch)}
      onDetach={detachSelectedAudio}
    />
  )

  const renderClipAudioOverlay = (track, clip) => {
    if (track.type !== 'audio' && !(track.type === 'video' && clip.type !== 'text')) return null
    const waveform = waveforms[clipSource(clip)]
    const speed = clip.speed ?? 1
    const bars = []
    if (waveform && !(track.type === 'video' && clip.audioDetached)) {
      const count = Math.max(8, Math.min(160, Math.round(clip.duration * timelinePixelsPerSecond / 4)))
      for (let index = 0; index < count; index += 1) {
        const local = ((index + 0.5) / count) * clip.duration
        const sourceTime = (clip.trim?.start ?? 0) + local * speed
        const bucket = Math.floor((sourceTime / waveform.duration) * waveform.peaks.length)
        const level = (waveform.peaks[bucket] ?? 0) * clipGainAt(clip, local) * (track.muted ? 0 : 1)
        bars.push({ index, level: Math.min(1, level), hot: level >= 0.98 })
      }
    }
    const fadeIn = Math.min(clip.fadeIn ?? 0, clip.duration)
    const fadeOut = Math.min(clip.fadeOut ?? 0, clip.duration)
    return (
      <div className="clip-audio-overlay" aria-hidden="true">
        {bars.length > 0 && (
          <svg className="clip-waveform" viewBox={`0 0 ${bars.length} 100`} preserveAspectRatio="none">
            {bars.map((bar) => (
              <rect key={bar.index} x={bar.index + 0.15} width="0.7" y={50 - bar.level * 48} height={Math.max(1, bar.level * 96)} className={bar.hot ? 'hot' : ''} />
            ))}
          </svg>
        )}
        {(clip.zones ?? []).map((zone) => (
          <span
            key={zone.id}
            className={`clip-zone ${zone.gainDb < 0 ? 'quieter' : 'louder'}`}
            style={{ left: `${(zone.start / clip.duration) * 100}%`, width: `${((zone.end - zone.start) / clip.duration) * 100}%` }}
          >
            {zone.gainDb > 0 ? '+' : ''}{zone.gainDb}
          </span>
        ))}
        {fadeIn > 0 && <span className="clip-fade in" style={{ width: `${(fadeIn / clip.duration) * 100}%` }} />}
        {fadeOut > 0 && <span className="clip-fade out" style={{ width: `${(fadeOut / clip.duration) * 100}%` }} />}
        {track.type === 'video' && clip.audioDetached && <span className="clip-audio-badge">audio detached</span>}
      </div>
    )
  }

  return (
    <div className={`video-editor ${focusMode.focused ? 'editor-focus' : ''}`}>
      <div className="video-editor-intro">
        <div>
          <p className="small-title">Video Editor</p>
          <p className="panel-note">Upload clips, arrange them on the timeline, add text and effects, then export.</p>
        </div>
        <EditorFocusToggle focused={focusMode.focused} onToggle={focusMode.toggle} fullscreen={focusMode.fullscreen} onToggleFullscreen={focusMode.toggleFullscreen} label="video editor" />
      </div>
      {brief && (
        <div className="video-brief-bar">
          <div>
            <strong>{brief.title}</strong>
            <span>{brief.scenes?.length || 0} scene directions generated from source documents</span>
          </div>
          <button type="button" className="rec-btn" onClick={addBriefStoryboard}>Add plan to timeline</button>
        </div>
      )}
      <div className="screen-record-bar">
        {isRecording ? (
          <>
            <span className="rec-dot" />
            <span className="rec-label">Recording — {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
            <button type="button" className="rec-stop-btn" onClick={stopScreenRecord}>⏹ Stop &amp; add to timeline</button>
          </>
        ) : (
          <>
            <span className="rec-title">Screen Capture</span>
            <button type="button" className="rec-btn" onClick={() => startScreenRecord(false)}>🖥 Record screen</button>
            <button type="button" className="rec-btn rec-btn-audio" onClick={() => startScreenRecord(true)}>🎙 Record with audio</button>
            <button type="button" className="rec-btn rec-btn-voice" onClick={openAudioMixer}>🎤 Record voice-over</button>
            {recordingError && <span className="rec-error">{recordingError}</span>}
          </>
        )}
      </div>

      <div className="editor-toolbar">
        <div className="toolbar-buttons">
          <button type="button" className={`toolbar-btn ${editTool === 'select' ? 'active' : ''}`} title="Selection tool (V)" onClick={() => setEditTool('select')}><MonitorPlay size={17} /> Select</button>
          <button type="button" className={`toolbar-btn ${editTool === 'razor' ? 'active' : ''}`} title="Razor tool (B)" onClick={() => { setEditTool('razor'); splitAtPlayhead() }}><Scissors size={17} /> Razor</button>
          <button type="button" className="toolbar-btn" title="Delete selected clip" onClick={() => removeSelectedClip(false)}>Delete</button>
          <button type="button" className="toolbar-btn" title="Ripple delete selected clip" onClick={() => removeSelectedClip(true)}>Ripple delete</button>
          <button type="button" className="toolbar-btn" title="Crop and zoom" onClick={() => { setInspectorTab('video'); setStatusMessage('Use Scale and Position in Video properties to crop and zoom.') }}><PanelsTopLeft size={17} /> Crop</button>
          <button type="button" className="toolbar-btn" title="Match color from another clip" onClick={matchSelectedColor}>Color match</button>
          <button type="button" className="toolbar-btn" title="Speed controls" onClick={() => setInspectorTab('video')}><Film size={17} /> Speed</button>
          <button type="button" className={`toolbar-btn toolbar-btn-audio ${activeToolbar === 'audio' ? 'active' : ''}`} title="Volume, equalizer, fades, and loud/quiet spots" onClick={openAudioMixer}><SlidersHorizontal size={17} /> Audio mixer</button>
          <button type="button" className="toolbar-btn toolbar-btn-library" title="Royalty-free sound effects, transitions, and stock video" onClick={() => setLibraryKind('sound')}><Library size={17} /> Stock library</button>
          <span className="time-display">
            {Math.floor(playbackTime)}s / {duration}s
          </span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="zoom-slider"
          />
          <span className="muted">{(zoom * 100).toFixed(0)}%</span>
          <button
            type="button"
            className="toolbar-btn"
            title="Duplicate selected clip"
            onClick={duplicateSelectedClip}
          >
            ⧉ Duplicate
          </button>
          <button
            type="button"
            className={`toolbar-btn ${snapEnabled ? 'active' : ''}`}
            title="Snap to clip edges"
            onClick={() => setSnapEnabled((prev) => !prev)}
          >
            🧲 Snap
          </button>
          <button type="button" className="toolbar-btn" title="Reset selected transform" onClick={() => selectedClip && updateSelectedClip({ transform: { ...DEFAULT_TRANSFORM } })}><RotateCcw size={17} /></button>
          {statusMessage && <span className="muted">{statusMessage}</span>}
        </div>

        <div className="toolbar-groups">
          {[
            ['media', 'Media', 'Add your uploaded photos, video, or audio'],
            ['transitions', 'Transitions', 'Fades and wipes between clips'],
            ['effects', 'Effects', 'Position, scale, opacity, and blend'],
            ['filters', 'Filters', 'Color looks like Vintage or B&W'],
            ['text', 'Text', 'Titles, subtitles, and captions'],
            ['audio', 'Audio & EQ', 'Mixer, equalizer, fades, and loud/quiet spots'],
            ['elements', 'Elements', 'Callout badges and graphic markers'],
          ].map(([tool, label, hint]) => (
            <button
              key={tool}
              type="button"
              className={`toolbar-group-btn ${activeToolbar === tool ? 'active' : ''}`}
              title={hint}
              onClick={() => (tool === 'audio' ? openAudioMixer() : setActiveToolbar(tool))}
            >
              {label}
            </button>
          ))}
          <button type="button" className="toolbar-btn toolbar-history-btn" onClick={undo} disabled={historyCounts.past === 0} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button type="button" className="toolbar-btn toolbar-history-btn" onClick={redo} disabled={historyCounts.future === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <Redo2 size={16} aria-hidden="true" />
          </button>
          <button type="button" className="toolbar-btn toolbar-btn-export" onClick={exportTimeline} disabled={isExporting}>
            <Download size={17} aria-hidden="true" />
            {isExporting ? `Exporting ${exportProgress}%` : 'Export video'}
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <aside className="editor-panel">
          {(() => false)() && activeToolbar === 'generate' && (
            <div className="tool-panel video-generation-panel">
              <h3>Generate video</h3>
              <p className="muted">Create a short scene with your in-house AI, then save it or add it to the timeline.</p>
              {!agentConfig?.enabled || !agentConfig?.endpoint ? (
                <p className="video-generation-warning">Connect and enable your in-house AI endpoint in Integrations before generating video.</p>
              ) : null}
              <div className="video-generation-modes">
                {GENERATE_MODES.map((item) => (
                  <button key={item.key} type="button" className={generateMode === item.key ? 'active' : ''} onClick={() => setGenerateMode(item.key)}>
                    <span>{item.icon}</span><strong>{item.label}</strong><small>{item.hint}</small>
                  </button>
                ))}
              </div>
              {generateMode === 'frame' && (
                <label>Start frame
                  <select value={generateStartFrameId} onChange={(event) => setGenerateStartFrameId(event.target.value)}>
                    <option value="">Choose an image or video</option>
                    {generateAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                  </select>
                </label>
              )}
              {generateMode === 'character' && (
                <label>Character persona
                  <select value={generatePersonaId} onChange={(event) => setGeneratePersonaId(event.target.value)}>
                    <option value="">Choose a saved persona</option>
                    {generatePersonas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
                  </select>
                </label>
              )}
              <label>Describe your video
                <textarea rows="5" value={generatePrompt} onChange={(event) => setGeneratePrompt(event.target.value)} placeholder="A slow camera push toward a glowing product on a rainy city street..." />
              </label>
              <p className="video-generation-label">Visual references <small>Optional · select up to 2</small></p>
              <div className="video-generation-references">
                {generateAssets.map((asset) => (
                  <button key={asset.id} type="button" className={generateReferenceIds.includes(asset.id) ? 'active' : ''} onClick={() => toggleGenerateReference(asset.id)}>
                    {asset.previewUrl && asset.type === 'image' ? <img src={asset.previewUrl} alt="" /> : <span>{asset.type === 'video' ? 'VID' : 'IMG'}</span>}
                    <strong>{asset.name}</strong>
                  </button>
                ))}
              </div>
              <div className="video-generation-settings">
                <label>Ratio<select value={generateAspectRatio} onChange={(event) => setGenerateAspectRatio(event.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:5</option></select></label>
                <label>Seconds<input type="number" min="2" max="30" value={generateDuration} onChange={(event) => setGenerateDuration(Number(event.target.value))} /></label>
                <label>Quality<select value={generateQuality} onChange={(event) => setGenerateQuality(event.target.value)}><option value="draft">Draft</option><option value="standard">Standard</option><option value="high">High</option></select></label>
              </div>
              {generateError && <p className="rec-error">{generateError}</p>}
              <button type="button" className="tool-button video-generate-button" disabled={generateBusy} onClick={generateVideo}>{generateBusy ? 'Generating...' : 'Generate scene'}</button>
            </div>
          )}
          {activeToolbar === 'media' && (
            <div className="tool-panel">
              <h3>Media</h3>
              <button type="button" className="tool-button stock-library-launch" onClick={() => setLibraryKind('video')}><Clapperboard size={15} /> Browse transitions &amp; stock video</button>
              <p className="muted">Tap an image, video, or audio file to add it at the playhead.</p>
              <label className="video-direct-upload">
                <strong>Upload video to timeline</strong>
                <span>Choose a local MP4 or supported video file</span>
                <input type="file" accept="video/*" onChange={handleUploadVideo} />
              </label>
              <div className="video-media-list">
                {(assets ?? []).filter((asset) => asset.type === 'image' || asset.type === 'video' || asset.mime?.startsWith('audio/')).map((asset) => (
                  <button key={asset.id} type="button" className="video-media-item" disabled={!asset.previewUrl} onClick={() => addAssetAtPlayhead(asset)}>
                    {asset.previewUrl && asset.type === 'image' ? <img src={asset.previewUrl} alt="" /> : <span>{asset.type === 'video' ? 'VID' : asset.mime?.startsWith('audio/') ? 'AUD' : 'IMG'}</span>}
                    <strong>{asset.name}<small>{asset.previewUrl ? 'Tap to add' : 'Re-upload required'}</small></strong>
                  </button>
                ))}
                {!assets?.some((asset) => asset.type === 'image' || asset.type === 'video' || asset.mime?.startsWith('audio/')) && (
                  <p className="muted">Upload media in the workspace drawer, then return here.</p>
                )}
              </div>
            </div>
          )}
          {activeToolbar === 'elements' && (
            <div className="tool-panel">
              <h3>Elements</h3>
              <p className="muted">Add graphic markers and animated-style callouts as editable overlays.</p>
              {['★ Featured', '✓ Approved', '→ Swipe up', '♥ Love this'].map((label) => (
                <button key={label} type="button" className="tool-button" onClick={() => addTextClip('lower_third', label)}>{label}</button>
              ))}
            </div>
          )}
          {activeToolbar === 'transitions' && (
            <div className="tool-panel">
              <h3>Transitions</h3>
              <p className="muted">Applied to the edges of the selected clip.</p>
              {Object.entries(TRANSITIONS).map(([key, label]) => (
                <div key={key} className="tool-item">
                  <button
                    type="button"
                    className={`tool-button ${selectedClip?.transition === key ? 'active' : ''}`}
                    onClick={() => updateSelectedClip({ transition: key })}
                  >
                    {label}
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeToolbar === 'effects' && (
            <div className="tool-panel">
              <h3>Effects</h3>
              <p className="muted">
                {selectedClip ? `Editing ${selectedClip.assetName}` : 'Select a clip to adjust.'}
              </p>
              {[
                ['brightness', 'Brightness', 0, 200],
                ['contrast', 'Contrast', 0, 200],
                ['saturate', 'Saturation', 0, 200],
                ['hue', 'Hue', -180, 180],
                ['blur', 'Blur', 0, 12],
              ].map(([key, label, min, max]) => (
                <label key={key} className="tool-item">
                  <span>
                    {label} {(selectedClip?.effects ?? DEFAULT_EFFECTS)[key]}
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    disabled={!selectedClip}
                    value={(selectedClip?.effects ?? DEFAULT_EFFECTS)[key]}
                    onPointerDown={commitHistory}
                    onChange={(event) => updateSelectedEffect(key, Number(event.target.value))}
                  />
                </label>
              ))}
              <button
                type="button"
                className="tool-button"
                disabled={!selectedClip}
                onClick={() => updateSelectedClip({ effects: { ...DEFAULT_EFFECTS } })}
              >
                Reset effects
              </button>
            </div>
          )}

          {activeToolbar === 'filters' && (
            <div className="tool-panel">
              <h3>Filters</h3>
              <p className="muted">Look presets stack on top of the effect sliders.</p>
              {Object.entries(FILTER_PRESETS).map(([key, value]) => (
                <div key={key} className="tool-item">
                  <button
                    type="button"
                    className={`tool-button ${selectedClip?.filter === key ? 'active' : ''}`}
                    onClick={() => updateSelectedClip({ filter: key })}
                  >
                    {value.label}
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeToolbar === 'text' && (
            <div className="tool-panel">
              <h3>Text &amp; Titles</h3>
              <p className="muted">Overlays are added to the text track at the playhead.</p>
              {Object.entries(TEXT_PRESETS).map(([key, preset]) => (
                <div key={key} className="tool-item">
                  <button type="button" className="tool-button" onClick={() => addTextClip(key)}>
                    {preset.label}
                  </button>
                </div>
              ))}

              {selectedClip?.type === 'text' && (
                <>
                  <label className="tool-item">
                    <span>Content</span>
                    <input
                      value={selectedClip.value}
                      onChange={(event) => updateClip(selectedClip.id, { value: event.target.value })}
                    />
                  </label>
                  <label className="tool-item">
                    <span>Size {selectedClip.fontSize}</span>
                    <input
                      type="range"
                      min="14"
                      max="120"
                      value={selectedClip.fontSize}
                      onPointerDown={commitHistory}
                      onChange={(event) => updateClip(selectedClip.id, { fontSize: Number(event.target.value) })}
                    />
                  </label>
                  <label className="tool-item">
                    <span>Vertical {selectedClip.y}%</span>
                    <input
                      type="range"
                      min="5"
                      max="95"
                      value={selectedClip.y}
                      onPointerDown={commitHistory}
                      onChange={(event) => updateClip(selectedClip.id, { y: Number(event.target.value) })}
                    />
                  </label>
                  <label className="tool-item">
                    <span>Color</span>
                    <input
                      type="color"
                      value={selectedClip.color}
                      onChange={(event) => updateClip(selectedClip.id, { color: event.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {activeToolbar === 'audio' && (
            <div className="tool-panel audio-mixer-panel">
              <h3>Audio mixer</h3>
              <button type="button" className="tool-button stock-library-launch" onClick={() => setLibraryKind('sound')}><Music2 size={15} /> Browse sound effects</button>
              <p className="muted">Press play to hear changes live. Everything here is included when you export.</p>
              <VoiceOverRecorder
                status={voiceStatus}
                countdown={voiceCountdown}
                seconds={voiceSeconds}
                level={voiceLevel}
                error={voiceError}
                devices={voiceDevices}
                deviceId={voiceDeviceId}
                onDeviceChange={setVoiceDeviceId}
                playAlong={voicePlayAlong}
                onPlayAlongChange={setVoicePlayAlong}
                onStart={startVoiceOver}
                onStop={stopVoiceOver}
                onCancel={cancelVoiceOver}
                lastTake={voiceLastTake}
              />
              <MasterAudioControls master={masterAudio} onChange={updateMasterAudio} level={masterLevel} duration={duration} />
              <p className="audio-hint audio-clip-pointer">Selected-clip volume, EQ, fades, and loud/quiet spots are in the <strong>Audio</strong> tab of Clip properties.</p>
              <div className="audio-clip-in-panel">{clipAudioControls}</div>
              <button type="button" className="tool-button" onClick={() => handleAddTrack('audio')}>
                Add audio track
              </button>
            </div>
          )}
        </aside>

        <div className="editor-center">
          {generateResults.length > 0 && (
            <div className="video-generation-results">
              {generateResults.map((result) => (
                <article key={result.id} className="video-generation-result">
                  <div><strong>{result.title || 'Generated scene'}</strong><span>{result.text || 'Ready to add to your workspace or timeline.'}</span></div>
                  {result.media.map((media, index) => (
                    <div className="video-generation-media" key={`${media.kind}-${index}`}>
                      {media.kind === 'video' && <video src={media.src} controls playsInline />}
                      {media.kind === 'image' && <img src={media.src} alt={result.title || 'Generated scene'} />}
                      <div><button type="button" className="toolbar-btn" onClick={() => saveGeneratedVideo(result, media, index)}>Save to workspace</button>{media.kind === 'video' && <button type="button" className="toolbar-btn active" onClick={() => addGeneratedVideoToTimeline(result, media)}>Add to timeline</button>}</div>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          )}
          <div className="preview-area">
            <div className="preview-stage-shell" ref={stageRef} style={{ aspectRatio: projectSettings.aspectRatio.replace(':', ' / '), width: `min(${projectSettings.previewScale}%, calc(62vh * ${stageRatio}))`, '--stage-ratio': stageRatio }}>
              <div className="preview-stage-toolbar">
                <span>{activeVisualClip?.assetName || 'Video canvas'}</span>
                <span>{projectSettings.aspectRatio} · {Math.floor(playbackTime)}s</span>
              </div>
              {previewSrc && previewType === 'video' ? (
              <video
                key={activeVisualClip.id}
                ref={videoRef}
                src={previewSrc}
                crossOrigin="anonymous"
                muted={Boolean(activeVisualClip.audioDetached)}
                className="preview-video"
                style={{
                  filter: buildClipFilter(activeVisualClip),
                  opacity: activeTransition.opacity * (getClipTransform(activeVisualClip).opacity / 100),
                  mixBlendMode: getClipTransform(activeVisualClip).blendMode,
                  transform: `translate(${getClipTransform(activeVisualClip).x * 10 + activeTransition.offset * 100}%, ${getClipTransform(activeVisualClip).y * 10}%) rotate(${getClipTransform(activeVisualClip).rotation}deg) scale(${activeTransition.scale * getClipTransform(activeVisualClip).scale / 100})`,
                  clipPath: activeTransition.clip > 0
                    ? `inset(0 ${activeTransition.clip * 100}% 0 0)`
                    : 'none',
                }}
                onLoadedMetadata={(event) => {
                  const localTime = (playbackTime - (activeVisualClip?.startTime ?? 0)) * (activeVisualClip?.speed ?? 1) + (activeVisualClip?.trim?.start ?? 0)
                  event.currentTarget.currentTime = Math.max(0, localTime)
                  event.currentTarget.playbackRate = activeVisualClip?.speed ?? 1
                }}
                onError={() => setStatusMessage('This video could not be decoded by the browser. Try re-uploading it or use a current Chromium browser.')}
                onEnded={() => setIsPlaying(false)}
                playsInline
              />
              ) : previewSrc && previewType === 'image' ? (
              <img
                src={previewSrc}
                className="preview-image"
                alt="preview"
                style={{
                  filter: buildClipFilter(activeVisualClip),
                  opacity: activeTransition.opacity * (getClipTransform(activeVisualClip).opacity / 100),
                  mixBlendMode: getClipTransform(activeVisualClip).blendMode,
                  transform: `translate(${getClipTransform(activeVisualClip).x * 10 + activeTransition.offset * 100}%, ${getClipTransform(activeVisualClip).y * 10}%) rotate(${getClipTransform(activeVisualClip).rotation}deg) scale(${activeTransition.scale * getClipTransform(activeVisualClip).scale / 100})`,
                }}
              />
              ) : (
                <div className="preview-placeholder">
                  <div className="preview-empty-icon">✦</div>
                  <p>{activeVisualClip ? 'Media unavailable' : 'Nothing here yet'}</p>
                  <small>
                    {activeVisualClip
                      ? 'Re-upload this file to enable playback'
                      : 'Upload your own clip to begin'}
                  </small>
                  {!activeVisualClip && (
                    <div className="preview-placeholder-actions">
                      <button type="button" className="preview-generate-button" onClick={() => setActiveToolbar('media')}>Upload media <span>›</span></button>
                    </div>
                  )}
                </div>
              )}

              {activeTextClips.map((clip) => {
                const overlayTransition = transitionStateAt(clip, playbackTime - clip.startTime)
                return (
                  <div
                    key={`overlay-${clip.id}`}
                    className="preview-text-overlay"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: `${clip.y}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: `${clip.fontSize * 0.5}px`,
                      fontWeight: clip.weight,
                      color: clip.color,
                      background: clip.background,
                      padding: clip.background === 'transparent' ? 0 : '0.35rem 0.9rem',
                      borderRadius: '10px',
                      opacity: overlayTransition.opacity,
                      textShadow: '0 2px 12px rgba(2, 6, 23, 0.6)',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {clip.value}
                  </div>
                )
              })}
              <div className="preview-controls">
                <button type="button" onClick={() => setPlaybackTime((current) => Math.max(0, current - 1))} title="Step back">‹</button>
                <button type="button" onClick={togglePlayback} title={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? '❚❚' : <Play size={16} fill="currentColor" />}</button>
                <button type="button" onClick={() => { setIsPlaying(false); setPlaybackTime(0) }} title="Stop">■</button>
                <button type="button" onClick={saveSnapshot} title="Save snapshot">▣</button>
                <button type="button" onClick={toggleFullscreen} title="Fullscreen">⛶</button>
              </div>
              {tracks.filter((track) => track.type === 'audio').flatMap((track) => track.clips).filter((clip) => clip.previewUrl).map((clip) => (
                <audio
                  key={clip.id}
                  src={clip.previewUrl}
                  crossOrigin="anonymous"
                  preload="auto"
                  ref={(element) => {
                    if (element) audioElementsRef.current.set(clip.id, element)
                    else audioElementsRef.current.delete(clip.id)
                  }}
                />
              ))}
            </div>
          </div>

          <div className="timeline-container" ref={timelineRef}>
            <div className="timeline-header" ref={timelineHeaderRef} onScroll={() => syncTimelineScroll('header')} onPointerDown={setTimelineTimeFromPointer} onPointerMove={scrubTimeline}>
              <div className="timeline-ruler" style={{ minWidth: `${timelineLabelWidth + totalPixels}px` }}>
                {Array.from({ length: duration + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="timeline-tick"
                    style={{ left: `${timelineLabelWidth + i * timelinePixelsPerSecond}px` }}
                  >
                    {i}s
                  </div>
                ))}
              </div>
            </div>

            <div className="timeline-tracks" ref={timelineTracksRef} onScroll={() => syncTimelineScroll('tracks')}>
              {tracks.map((track) => (
                <div key={track.id} className="track">
                  <div className="track-header">
                    <span className="track-name">{track.type === 'video' ? <Clapperboard size={15} /> : track.type === 'audio' ? <Music2 size={15} /> : <Type size={15} />}{track.name}</span>
                    <button type="button" className="track-btn" title={track.visible === false ? 'Show track' : 'Hide track'} onClick={() => updateTrack(track.id, { visible: track.visible === false })}>{track.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                    <button type="button" className="track-btn" title={track.muted ? 'Unmute track' : 'Mute track'} onClick={() => updateTrack(track.id, { muted: !track.muted })}>{track.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
                    <button type="button" className="track-btn" title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => updateTrack(track.id, { locked: !track.locked })}>{track.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                    <button
                      type="button"
                      className="track-btn"
                      onClick={() => handleRemoveTrack(track.id)}
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    className="track-clips"
                    style={{ minWidth: `${totalPixels}px` }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const assetId = event.dataTransfer.getData('assetId')
                      if (assetId) {
                        const asset = assets.find((a) => a.id === assetId)
                        if (asset && (track.type === 'video' ? asset.type === 'video' : true)) {
                          handleDropAssetToTrack(track.id, asset)
                        }
                      }
                    }}
                  >
                    {track.clips.map((clip) => (
                      <div
                        key={clip.id}
                        className={`clip ${track.type === 'audio' ? 'clip-audio' : ''} ${selectedClip?.id === clip.id ? 'selected' : ''}`}
                        style={{
                          left: `${clip.startTime * timelinePixelsPerSecond}px`,
                          width: `${clip.duration * timelinePixelsPerSecond}px`,
                        }}
                        onClick={() => {
                          if (editTool === 'razor') {
                            setPlaybackTime(Math.min(clipEnd(clip) - 0.05, Math.max(clip.startTime + 0.05, playbackTime)))
                            splitAtPlayhead()
                            return
                          }
                          setSelectedClip(clip)
                          setPlaybackTime(clip.startTime)
                        }}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={(event) => {
                          if (event.clientX) {
                            const offset = event.clientX - timelineRef.current.getBoundingClientRect().left - timelineLabelWidth
                            const newTime = snapTime(offset / timelinePixelsPerSecond)
                            commitHistory()
                            handleMoveClip(track.id, clip.id, newTime)
                          }
                        }}
                      >
                        {renderClipAudioOverlay(track, clip)}
                        <div className="clip-content">
                          <span className="clip-name">{clip.assetName}</span>
                          <button
                            type="button"
                            className="clip-delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveClip(track.id, clip.id)
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="track-add">
                <button
                  type="button"
                  className="add-track-btn"
                  onClick={() => handleAddTrack('video')}
                >
                  + Video
                </button>
                <button
                  type="button"
                  className="add-track-btn"
                  onClick={() => handleAddTrack('audio')}
                >
                  + Audio
                </button>
                <button
                  type="button"
                  className="add-track-btn"
                  onClick={() => handleAddTrack('text')}
                >
                  + Text
                </button>
              </div>
            </div>

            <div
              className="playhead"
              style={{ left: `${timelineLabelWidth + playbackTime * timelinePixelsPerSecond}px` }}
            />
          </div>
        </div>

        <aside className="editor-properties">
          <div className="properties-heading"><h3>{selectedClip ? 'Clip properties' : 'Project properties'}</h3><span>{selectedClip?.assetName || PROJECT_PRESETS[projectSettings.aspectRatio].label}</span></div>
          <div className="properties-tabs">
            {['video', 'audio', 'color', 'animation'].map((tab) => <button key={tab} type="button" className={inspectorTab === tab ? 'active' : ''} onClick={() => setInspectorTab(tab)}>{tab}</button>)}
          </div>
          {!selectedClip && inspectorTab === 'video' && <div className="prop-section"><label>Project format<select value={projectSettings.aspectRatio} onChange={(event) => setProjectSettings((current) => ({ ...current, aspectRatio: event.target.value }))}>{Object.entries(PROJECT_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label} ({key})</option>)}</select></label><label>Frame rate<select value={projectSettings.frameRate} onChange={(event) => setProjectSettings((current) => ({ ...current, frameRate: Number(event.target.value) }))}><option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><label>Preview scale {projectSettings.previewScale}%<input type="range" min="60" max="100" value={projectSettings.previewScale} onChange={(event) => setProjectSettings((current) => ({ ...current, previewScale: Number(event.target.value) }))} /></label></div>}
          {selectedClip && inspectorTab === 'video' && <div className="properties-stack"><div className="prop-grid"><label>Position X<input type="number" value={getClipTransform(selectedClip).x} onChange={(event) => updateSelectedTransform('x', Number(event.target.value))} /></label><label>Position Y<input type="number" value={getClipTransform(selectedClip).y} onChange={(event) => updateSelectedTransform('y', Number(event.target.value))} /></label><label>Scale {getClipTransform(selectedClip).scale}%<input type="range" min="25" max="250" value={getClipTransform(selectedClip).scale} onPointerDown={commitHistory} onChange={(event) => updateSelectedTransform('scale', Number(event.target.value))} /></label><label>Rotation<input type="number" min="-360" max="360" value={getClipTransform(selectedClip).rotation} onChange={(event) => updateSelectedTransform('rotation', Number(event.target.value))} /></label><label>Opacity {getClipTransform(selectedClip).opacity}%<input type="range" min="0" max="100" value={getClipTransform(selectedClip).opacity} onPointerDown={commitHistory} onChange={(event) => updateSelectedTransform('opacity', Number(event.target.value))} /></label><label>Blend mode<select value={getClipTransform(selectedClip).blendMode} onChange={(event) => updateSelectedTransform('blendMode', event.target.value)}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option><option value="lighten">Lighten</option></select></label><label>Trim in<input type="number" min="0" step="0.1" value={selectedClip.trim?.start ?? 0} onChange={(event) => handleTrimClip(tracks.find((track) => track.clips.some((clip) => clip.id === selectedClip.id))?.id, selectedClip.id, Number(event.target.value), selectedClip.trim?.end ?? selectedClip.duration)} /></label><label>Trim out<input type="number" min="0" step="0.1" value={selectedClip.trim?.end ?? selectedClip.duration} onChange={(event) => handleTrimClip(tracks.find((track) => track.clips.some((clip) => clip.id === selectedClip.id))?.id, selectedClip.id, selectedClip.trim?.start ?? 0, Number(event.target.value))} /></label></div><label className="prop-section">Speed {selectedClip.speed ?? 1}x<input type="range" min="0.25" max="3" step="0.25" value={selectedClip.speed ?? 1} onPointerDown={commitHistory} onChange={(event) => updateSelectedClip({ speed: Number(event.target.value) })} /></label></div>}
          {inspectorTab === 'audio' && <div className="properties-stack audio-mixer-panel">{clipAudioControls}</div>}
          {selectedClip && inspectorTab === 'color' && <div className="properties-stack"><label className="prop-section">Brightness {(selectedClip.effects ?? DEFAULT_EFFECTS).brightness}<input type="range" min="0" max="200" value={(selectedClip.effects ?? DEFAULT_EFFECTS).brightness} onPointerDown={commitHistory} onChange={(event) => updateSelectedEffect('brightness', Number(event.target.value))} /></label><label className="prop-section">Temperature (warm / cool)<input type="range" min="-180" max="180" value={(selectedClip.effects ?? DEFAULT_EFFECTS).hue} onPointerDown={commitHistory} onChange={(event) => updateSelectedEffect('hue', Number(event.target.value))} /></label><button type="button" className="tool-button" onClick={matchSelectedColor}>Match another clip</button></div>}
          {selectedClip && inspectorTab === 'animation' && <div className="properties-stack"><p className="muted">Animate clip entrances and exits with a transition. Transform values stay editable for precise motion planning.</p><label className="prop-section">Transition<select value={selectedClip.transition ?? 'none'} onChange={(event) => updateSelectedClip({ transition: event.target.value })}>{Object.entries(TRANSITIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button type="button" className="tool-button" onClick={() => updateSelectedClip({ transform: { ...DEFAULT_TRANSFORM } })}>Reset transform</button></div>}
          {selectedClip && <button type="button" className="primary-button" onClick={() => removeSelectedClip(false)}>Delete clip</button>}
        </aside>
      </div>

      <div className="editor-footer">
        <button type="button" className="primary-button" onClick={exportTimeline} disabled={isExporting}>
          {isExporting ? `Rendering ${exportProgress}%` : 'Export video'}
        </button>
        <span className="muted">
          {tracks.reduce((sum, t) => sum + t.clips.length, 0)} clips • {duration}s duration
        </span>
      </div>
      {libraryKind && <StockLibrary initialKind={libraryKind} onClose={() => setLibraryKind(null)} onAdd={addFromStockLibrary} />}
    </div>
  )
}
