import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { canUseAgentMode, runCreativeAgentJob } from '../services/aiAgentService'

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

export function VideoEditor({ assets, onExport, brief, agentConfig, onAddAsset }) {
  const [tracks, setTracks] = useState([
    { id: 'video-1', type: 'video', name: 'Video Track 1', clips: [] },
    { id: 'text-1', type: 'text', name: 'Text Track 1', clips: [] },
    { id: 'audio-1', type: 'audio', name: 'Audio Track 1', clips: [] },
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
  const clipCounter = useRef(0)
  const timelineRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const historyRef = useRef({ past: [], future: [] })
  const rafRef = useRef(0)

  // AI video generation panel — a dedicated screen toggled from the toolbar,
  // separate from timeline editing state.
  const [generateMode, setGenerateMode] = useState('frame')
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
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    }
  }, [])

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
          assetId: `rec-${Date.now()}`,
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
      id: `asset_${Date.now()}`,
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
      id: `generated-${Date.now()}`,
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
    const track = tracks.find((item) => item.id === trackId)
    const newClip = {
      id: `clip-${(clipCounter.current += 1)}`,
      assetId: asset.id,
      assetName: asset.name,
      startTime: playbackTime,
      duration: asset.type === 'video' ? 3 : 5,
      trim: { start: 0, end: asset.type === 'video' ? 3 : 5 },
      filter: 'none',
      effects: { ...DEFAULT_EFFECTS },
      transition: 'none',
      volume: track?.type === 'audio' ? 100 : 100,
    }

    commitHistory()
    setTracks((prev) =>
      prev.map((item) =>
        item.id === trackId ? { ...item, clips: [...item.clips, newClip] } : item,
      ),
    )
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

  const updateClip = (clipId, patch) => {
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
      })),
    )
    setSelectedClip((prev) => (prev?.id === clipId ? { ...prev, ...patch } : prev))
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

  const addTextClip = (presetKey) => {
    const preset = TEXT_PRESETS[presetKey]
    const textTrack = tracks.find((track) => track.type === 'text')

    if (!textTrack) {
      setStatusMessage('Add a text track first.')
      return
    }

    const clip = {
      id: `clip-${(clipCounter.current += 1)}`,
      type: 'text',
      assetName: preset.label,
      value: preset.label,
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

  const assetById = useMemo(() => {
    const map = new Map()
    ;(assets ?? []).forEach((asset) => map.set(asset.id, asset))
    return map
  }, [assets])

  const clipSource = useCallback(
    (clip) => clip?.previewUrl ?? assetById.get(clip?.assetId)?.previewUrl ?? '',
    [assetById],
  )

  // The preview follows the playhead across the whole timeline rather than
  // showing a single hand-picked clip.
  const activeVisualClip = useMemo(() => {
    const visualTracks = tracks.filter((track) => track.type === 'video')
    for (let index = visualTracks.length - 1; index >= 0; index -= 1) {
      const hit = visualTracks[index].clips.find(
        (clip) => playbackTime >= clip.startTime && playbackTime < clipEnd(clip),
      )
      if (hit) return hit
    }
    return null
  }, [tracks, playbackTime])

  const activeTextClips = useMemo(
    () =>
      tracks
        .filter((track) => track.type === 'text')
        .flatMap((track) => track.clips)
        .filter((clip) => playbackTime >= clip.startTime && playbackTime < clipEnd(clip)),
    [tracks, playbackTime],
  )

  const previewAsset = activeVisualClip ? assetById.get(activeVisualClip.assetId) ?? null : null
  const previewSrc = clipSource(activeVisualClip)
  const previewType = previewAsset?.type ?? (activeVisualClip?.previewUrl ? 'video' : '')

  const videoRef = useRef(null)

  // Timeline clock. The playhead is the source of truth and the video element is
  // slaved to it, so multiple clips play back in sequence.
  useEffect(() => {
    if (!isPlaying) return undefined

    let last = performance.now()
    const tick = (now) => {
      const delta = (now - last) / 1000
      last = now
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

    const localTime = playbackTime - activeVisualClip.startTime + (activeVisualClip.trim?.start ?? 0)
    // Only correct real drift, otherwise every frame would reset the decoder.
    if (Math.abs(video.currentTime - localTime) > 0.35 && Number.isFinite(localTime)) {
      video.currentTime = Math.max(0, localTime)
    }

    if (isPlaying && video.paused) video.play().catch(() => {})
    if (!isPlaying && !video.paused) video.pause()
  }, [playbackTime, isPlaying, activeVisualClip])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = Math.max(0, Math.min(1, (activeVisualClip?.volume ?? 100) / 100))
  }, [activeVisualClip])

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

  // Renders the timeline frame by frame onto a canvas and records the canvas
  // stream. This produces a real .webm file rather than a description of one.
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

    setIsExporting(true)
    setExportProgress(0)
    setIsPlaying(false)
    setStatusMessage('Rendering timeline...')

    const width = 1280
    const height = 720
    const fps = 30
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // Off-screen decoders, one per distinct source, seeked frame by frame.
    const videoElements = new Map()
    const visualClips = tracks
      .filter((track) => track.type === 'video')
      .flatMap((track) => track.clips)

    try {
      await Promise.all(
        visualClips.map(async (clip) => {
          const src = clipSource(clip)
          if (!src || videoElements.has(clip.id)) return
          const element = document.createElement('video')
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

      const stream = canvas.captureStream(fps)
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
      const chunks = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }

      const finished = new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
      })

      recorder.start()

      const totalFrames = Math.ceil(duration * fps)
      const seekTo = (element, time) =>
        new Promise((resolve) => {
          if (!element || Math.abs(element.currentTime - time) < 0.01) {
            resolve()
            return
          }
          const done = () => {
            element.removeEventListener('seeked', done)
            resolve()
          }
          element.addEventListener('seeked', done)
          element.currentTime = Math.max(0, time)
          setTimeout(done, 120)
        })

      for (let frame = 0; frame < totalFrames; frame += 1) {
        const time = frame / fps

        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, width, height)

        const frameClip = visualClips.find(
          (clip) => time >= clip.startTime && time < clipEnd(clip),
        )

        if (frameClip) {
          const element = videoElements.get(frameClip.id)
          const localTime = time - frameClip.startTime + (frameClip.trim?.start ?? 0)
          if (element && element.readyState >= 2) {
            await seekTo(element, localTime)
          }

          const transition = transitionStateAt(frameClip, time - frameClip.startTime)
          ctx.save()
          ctx.globalAlpha = transition.opacity
          ctx.filter = buildClipFilter(frameClip)

          if (transition.clip > 0) {
            ctx.beginPath()
            ctx.rect(0, 0, width * (1 - transition.clip), height)
            ctx.clip()
          }

          const drawWidth = width * transition.scale
          const drawHeight = height * transition.scale
          const offsetX = (width - drawWidth) / 2 + transition.offset * width
          const offsetY = (height - drawHeight) / 2

          if (element && element.readyState >= 2) {
            ctx.drawImage(element, offsetX, offsetY, drawWidth, drawHeight)
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
          .filter((track) => track.type === 'text')
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

        if (frame % 5 === 0) {
          setExportProgress(Math.round((frame / totalFrames) * 100))
        }

        // Give the recorder a chance to sample this frame.
        await new Promise((resolve) => setTimeout(resolve, 1000 / fps))
      }

      recorder.stop()
      const blob = await finished
      const url = URL.createObjectURL(blob)
      const exportName = `echoai-timeline-${Date.now()}.webm`

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
        summary: `Video timeline exported at ${width}x${height}.`,
      })

      setStatusMessage(`Exported ${exportName}.`)
    } catch (error) {
      setStatusMessage(`Export failed: ${error.message}`)
    } finally {
      videoElements.forEach((element) => {
        element.src = ''
      })
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  return (
    <div className="video-editor">
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
            {recordingError && <span className="rec-error">{recordingError}</span>}
          </>
        )}
      </div>

      <div className="editor-toolbar">
        <div className="toolbar-buttons">
          <button
            type="button"
            className={`toolbar-btn ${isPlaying ? 'active' : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button type="button" className="toolbar-btn" onClick={() => setPlaybackTime(0)}>
            ⏮
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setDuration((prev) => Math.max(5, prev - 5))}
          >
            -
          </button>
          <span className="time-display">
            {Math.floor(playbackTime)}s / {duration}s
          </span>
          <button type="button" className="toolbar-btn" onClick={() => setDuration((prev) => prev + 5)}>
            +
          </button>
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
          <button type="button" className="toolbar-btn" title="Split at playhead" onClick={splitAtPlayhead}>
            ✂ Split
          </button>
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
          <button type="button" className="toolbar-btn" onClick={undo} disabled={historyCounts.past === 0}>
            ↶
          </button>
          <button type="button" className="toolbar-btn" onClick={redo} disabled={historyCounts.future === 0}>
            ↷
          </button>
          <button type="button" className="toolbar-btn" onClick={exportTimeline} disabled={isExporting}>
            {isExporting ? `Exporting ${exportProgress}%` : '⬇ Export video'}
          </button>
          {statusMessage && <span className="muted">{statusMessage}</span>}
        </div>

        <div className="toolbar-groups">
          {['generate', 'media', 'transitions', 'effects', 'filters', 'text', 'audio'].map((tool) => (
            <button
              key={tool}
              type="button"
              className={`toolbar-group-btn ${activeToolbar === tool ? 'active' : ''}`}
              onClick={() => setActiveToolbar(tool)}
            >
              {tool.charAt(0).toUpperCase() + tool.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="editor-layout">
        <aside className="editor-panel">
          {activeToolbar === 'generate' && (
            <div className="tool-panel video-generation-panel">
              <h3>Generate video</h3>
              <p className="muted">Create a short scene with your in-house AI, then save it or add it to the timeline.</p>
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
              <p className="muted">Tap an image, video, or audio file to add it at the playhead.</p>
              <div className="video-media-list">
                {(assets ?? []).filter((asset) => asset.type === 'image' || asset.type === 'video' || asset.mime?.startsWith('audio/')).map((asset) => (
                  <button key={asset.id} type="button" className="video-media-item" onClick={() => addAssetAtPlayhead(asset)}>
                    {asset.previewUrl && asset.type === 'image' ? <img src={asset.previewUrl} alt="" /> : <span>{asset.type === 'video' ? 'VID' : asset.mime?.startsWith('audio/') ? 'AUD' : 'IMG'}</span>}
                    <strong>{asset.name}</strong>
                  </button>
                ))}
                {!assets?.some((asset) => asset.type === 'image' || asset.type === 'video' || asset.mime?.startsWith('audio/')) && (
                  <p className="muted">Upload media in the workspace drawer, then return here.</p>
                )}
              </div>
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
            <div className="tool-panel">
              <h3>Audio</h3>
              <p className="muted">
                {selectedClip ? `Editing ${selectedClip.assetName}` : 'Select a clip to adjust.'}
              </p>
              <label className="tool-item">
                <span>Clip volume {selectedClip?.volume ?? 100}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  disabled={!selectedClip}
                  value={selectedClip?.volume ?? 100}
                  onPointerDown={commitHistory}
                  onChange={(event) => updateClip(selectedClip.id, { volume: Number(event.target.value) })}
                />
              </label>
              <button type="button" className="tool-button" onClick={() => handleAddTrack('audio')}>
                Add audio track
              </button>
              <button type="button" className="tool-button" onClick={() => handleAddTrack('text')}>
                Add text track
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
            {previewSrc && previewType === 'video' ? (
              <video
                ref={videoRef}
                src={previewSrc}
                className="preview-video"
                style={{
                  filter: buildClipFilter(activeVisualClip),
                  opacity: activeTransition.opacity,
                  transform: `scale(${activeTransition.scale}) translateX(${activeTransition.offset * 100}%)`,
                  clipPath: activeTransition.clip > 0
                    ? `inset(0 ${activeTransition.clip * 100}% 0 0)`
                    : 'none',
                }}
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
                  opacity: activeTransition.opacity,
                  transform: `scale(${activeTransition.scale}) translateX(${activeTransition.offset * 100}%)`,
                }}
              />
            ) : (
              <div className="preview-placeholder">
                <p>{activeVisualClip ? 'No preview available' : 'Preview'}</p>
                <small>
                  {activeVisualClip
                    ? 'Re-upload this file to enable playback'
                    : 'Drop a file on a track, then press play'}
                </small>
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
          </div>

          <div className="timeline-container" ref={timelineRef}>
            <div className="timeline-header">
              <div className="timeline-ruler">
                {Array.from({ length: duration + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="timeline-tick"
                    style={{ left: `${i * timelinePixelsPerSecond}px` }}
                  >
                    {i}s
                  </div>
                ))}
              </div>
            </div>

            <div className="timeline-tracks">
              {tracks.map((track) => (
                <div key={track.id} className="track">
                  <div className="track-header">
                    <span className="track-name">{track.name}</span>
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
                        className={`clip ${selectedClip?.id === clip.id ? 'selected' : ''}`}
                        style={{
                          left: `${clip.startTime * timelinePixelsPerSecond}px`,
                          width: `${clip.duration * timelinePixelsPerSecond}px`,
                        }}
                        onClick={() => setSelectedClip(clip)}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={(event) => {
                          if (event.clientX) {
                            const offset = event.clientX - timelineRef.current.getBoundingClientRect().left
                            const newTime = snapTime(offset / timelinePixelsPerSecond)
                            commitHistory()
                            handleMoveClip(track.id, clip.id, newTime)
                          }
                        }}
                      >
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
              </div>
            </div>

            <div
              className="playhead"
              style={{ left: `${playbackTime * timelinePixelsPerSecond}px` }}
            />
          </div>
        </div>

        {selectedClip && (
          <aside className="editor-properties">
            <h3>Clip properties</h3>
            <div className="prop-section">
              <label>
                Name
                <input type="text" value={selectedClip.assetName} disabled />
              </label>
            </div>
            <div className="prop-section">
              <label>
                Start time (s)
                <input
                  type="number"
                  value={selectedClip.startTime.toFixed(1)}
                  onChange={(event) =>
                    handleMoveClip(
                      tracks.find((t) => t.clips.some((c) => c.id === selectedClip.id))?.id,
                      selectedClip.id,
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>
            <div className="prop-section">
              <label>
                Duration (s)
                <input
                  type="number"
                  value={selectedClip.duration.toFixed(1)}
                  onChange={(event) => {
                    const trackId = tracks.find((t) => t.clips.some((c) => c.id === selectedClip.id))?.id
                    setTracks((prev) =>
                      prev.map((track) =>
                        track.id === trackId
                          ? {
                              ...track,
                              clips: track.clips.map((clip) =>
                                clip.id === selectedClip.id
                                  ? { ...clip, duration: Number(event.target.value) }
                                  : clip,
                              ),
                            }
                          : track,
                      ),
                    )
                  }}
                />
              </label>
            </div>
            <div className="prop-section">
              <label>
                Trim start (s)
                <input
                  type="number"
                  step="0.1"
                  value={selectedClip.trim.start.toFixed(1)}
                  onChange={(event) =>
                    handleTrimClip(
                      tracks.find((t) => t.clips.some((c) => c.id === selectedClip.id))?.id,
                      selectedClip.id,
                      Number(event.target.value),
                      selectedClip.trim.end,
                    )
                  }
                />
              </label>
            </div>
            <div className="prop-section">
              <label>
                Trim end (s)
                <input
                  type="number"
                  step="0.1"
                  value={selectedClip.trim.end.toFixed(1)}
                  onChange={(event) =>
                    handleTrimClip(
                      tracks.find((t) => t.clips.some((c) => c.id === selectedClip.id))?.id,
                      selectedClip.id,
                      selectedClip.trim.start,
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                const trackId = tracks.find((t) => t.clips.some((c) => c.id === selectedClip.id))?.id
                handleRemoveClip(trackId, selectedClip.id)
                setSelectedClip(null)
              }}
            >
              Delete clip
            </button>
          </aside>
        )}
      </div>

      <div className="editor-footer">
        <button type="button" className="primary-button" onClick={exportTimeline} disabled={isExporting}>
          {isExporting ? `Rendering ${exportProgress}%` : 'Export video'}
        </button>
        <span className="muted">
          {tracks.reduce((sum, t) => sum + t.clips.length, 0)} clips • {duration}s duration
        </span>
      </div>
    </div>
  )
}
