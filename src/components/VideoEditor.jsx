import { useState, useRef, useEffect } from 'react'

export function VideoEditor({ assets, onExport }) {
  const [tracks, setTracks] = useState([
    { id: 'video-1', type: 'video', name: 'Video Track 1', clips: [] },
    { id: 'audio-1', type: 'audio', name: 'Audio Track 1', clips: [] },
  ])
  const [selectedClip, setSelectedClip] = useState(null)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(30)
  const [zoom, setZoom] = useState(1)
  const [activeToolbar, setActiveToolbar] = useState('transitions')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingError, setRecordingError] = useState('')
  const clipCounter = useRef(0)
  const timelineRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

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

  const handleRemoveTrack = (trackId) => {
    setTracks((prev) => prev.filter((track) => track.id !== trackId))
  }

  const handleDropAssetToTrack = (trackId, asset) => {
    const newClip = {
      id: `clip-${(clipCounter.current += 1)}`,
      assetId: asset.id,
      assetName: asset.name,
      startTime: playbackTime,
      duration: asset.type === 'video' ? 3 : 5,
      trim: { start: 0, end: asset.size / 1024 / 1024 },
    }

    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId ? { ...track, clips: [...track.clips, newClip] } : track,
      ),
    )
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

  // Find the video/image source for the selected clip
  const previewAsset = selectedClip
    ? assets?.find((a) => a.id === selectedClip.assetId) ?? null
    : null
  const previewSrc = selectedClip?.previewUrl ?? previewAsset?.previewUrl ?? ''
  const previewType = previewAsset?.type ?? (selectedClip?.previewUrl ? 'video' : '')

  const videoRef = useRef(null)
  useEffect(() => {
    if (!videoRef.current) return
    if (isPlaying) { videoRef.current.play().catch(() => {}) }
    else { videoRef.current.pause() }
  }, [isPlaying])

  return (
    <div className="video-editor">
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
        </div>

        <div className="toolbar-groups">
          {['transitions', 'effects', 'filters', 'text', 'audio'].map((tool) => (
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
          {activeToolbar === 'transitions' && (
            <div className="tool-panel">
              <h3>Transitions</h3>
              {['Fade', 'Slide', 'Zoom', 'Wipe'].map((trans) => (
                <div key={trans} className="tool-item">
                  <button type="button" className="tool-button">{trans}</button>
                </div>
              ))}
            </div>
          )}

          {activeToolbar === 'effects' && (
            <div className="tool-panel">
              <h3>Effects</h3>
              {['Blur', 'Brightness', 'Contrast', 'Saturation'].map((effect) => (
                <div key={effect} className="tool-item">
                  <button type="button" className="tool-button">{effect}</button>
                </div>
              ))}
            </div>
          )}

          {activeToolbar === 'filters' && (
            <div className="tool-panel">
              <h3>Filters</h3>
              {['Vintage', 'Retro', 'Cool', 'Warm', 'B&W'].map((filter) => (
                <div key={filter} className="tool-item">
                  <button type="button" className="tool-button">{filter}</button>
                </div>
              ))}
            </div>
          )}

          {activeToolbar === 'text' && (
            <div className="tool-panel">
              <h3>Text & Titles</h3>
              {['Title', 'Subtitle', 'Lower third', 'Credit'].map((text) => (
                <div key={text} className="tool-item">
                  <button type="button" className="tool-button">{text}</button>
                </div>
              ))}
            </div>
          )}

          {activeToolbar === 'audio' && (
            <div className="tool-panel">
              <h3>Audio</h3>
              {['Music', 'Sound Effect', 'Voiceover'].map((audio) => (
                <div key={audio} className="tool-item">
                  <button type="button" className="tool-button">{audio}</button>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="editor-center">
          <div className="preview-area">
            {previewSrc && previewType === 'video' ? (
              <video
                ref={videoRef}
                src={previewSrc}
                className="preview-video"
                onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
                onEnded={() => setIsPlaying(false)}
                onLoadedMetadata={(e) => {
                  if (!selectedClip) return
                  const d = e.currentTarget.duration
                  if (d && isFinite(d)) setDuration(Math.ceil(d))
                }}
                playsInline
              />
            ) : previewSrc && previewType === 'image' ? (
              <img src={previewSrc} className="preview-image" alt="preview" />
            ) : (
              <div className="preview-placeholder">
                <p>{selectedClip ? 'No preview available' : 'Preview'}</p>
                <small>{selectedClip ? 'Re-upload this file to enable playback' : 'Select a clip or drop a file to begin'}</small>
              </div>
            )}
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
                            const newTime = Math.max(0, offset / timelinePixelsPerSecond)
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
        <button
          type="button"
          className="primary-button"
          onClick={() =>
            onExport({
              tracks,
              duration,
              totalClips: tracks.reduce((sum, t) => sum + t.clips.length, 0),
            })
          }
        >
          Export project
        </button>
        <span className="muted">
          {tracks.reduce((sum, t) => sum + t.clips.length, 0)} clips • {duration}s duration
        </span>
      </div>
    </div>
  )
}
