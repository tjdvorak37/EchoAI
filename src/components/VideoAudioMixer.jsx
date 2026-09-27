import { AudioLines, Scissors, SlidersHorizontal, Trash2 } from 'lucide-react'
import {
  EQ_BANDS,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  ZONE_MAX_DB,
  ZONE_MIN_DB,
  formatBand,
  normalizeEq,
} from '../services/videoAudioMix'

const presetKeyFor = (eq) => {
  const values = normalizeEq(eq).join(',')
  return Object.entries(EQ_PRESETS).find(([, preset]) => preset.gains.join(',') === values)?.[0] ?? 'custom'
}

const signedDb = (value) => `${value > 0 ? '+' : ''}${value} dB`

export function Equalizer({ eq, onChange, onCommit, idPrefix }) {
  const values = normalizeEq(eq)
  const presetKey = presetKeyFor(values)

  return (
    <div className="audio-eq">
      <div className="audio-eq-head">
        <label htmlFor={`${idPrefix}-preset`}>Preset</label>
        <select
          id={`${idPrefix}-preset`}
          value={presetKey}
          onChange={(event) => {
            if (!EQ_PRESETS[event.target.value]) return
            onCommit?.()
            onChange([...EQ_PRESETS[event.target.value].gains])
          }}
        >
          {presetKey === 'custom' && <option value="custom">Custom</option>}
          {Object.entries(EQ_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
        </select>
      </div>
      <div className="audio-eq-bands" role="group" aria-label="Equalizer bands">
        {EQ_BANDS.map((band, index) => (
          <label key={band} className="audio-eq-band" title={`${formatBand(band)}Hz ${signedDb(values[index])}`}>
            <span className="audio-eq-value">{values[index] > 0 ? `+${values[index]}` : values[index]}</span>
            <input
              type="range"
              min={EQ_MIN_DB}
              max={EQ_MAX_DB}
              step="1"
              value={values[index]}
              aria-label={`${formatBand(band)} hertz gain`}
              onPointerDown={onCommit}
              onDoubleClick={() => {
                onCommit?.()
                onChange(values.map((value, bandIndex) => (bandIndex === index ? 0 : value)))
              }}
              onChange={(event) => onChange(values.map((value, bandIndex) => (bandIndex === index ? Number(event.target.value) : value)))}
            />
            <span className="audio-eq-freq">{formatBand(band)}</span>
          </label>
        ))}
      </div>
      <p className="audio-hint">Low (bass) on the left, high (treble) on the right. Double-click a band to reset it.</p>
    </div>
  )
}

function FadeControls({ fadeIn, fadeOut, max, onChange, onCommit }) {
  return (
    <div className="audio-fade-grid">
      <label>
        <span>Fade in {Number(fadeIn || 0).toFixed(1)}s</span>
        <input type="range" min="0" max={max} step="0.1" value={Math.min(fadeIn || 0, max)} onPointerDown={onCommit} onChange={(event) => onChange({ fadeIn: Number(event.target.value) })} />
      </label>
      <label>
        <span>Fade out {Number(fadeOut || 0).toFixed(1)}s</span>
        <input type="range" min="0" max={max} step="0.1" value={Math.min(fadeOut || 0, max)} onPointerDown={onCommit} onChange={(event) => onChange({ fadeOut: Number(event.target.value) })} />
      </label>
    </div>
  )
}

export function LevelMeter({ level }) {
  const db = Number.isFinite(level) ? Math.max(-60, level) : -60
  const width = ((db + 60) / 60) * 100
  const state = db > -1 ? 'hot' : db > -9 ? 'warm' : 'ok'
  return (
    <div className="audio-meter" aria-label={`Output level ${Number.isFinite(level) ? `${Math.round(level)} dB` : 'silent'}`}>
      <div className={`audio-meter-fill ${state}`} style={{ width: `${width}%` }} />
      <span>{Number.isFinite(level) && level > -60 ? `${Math.round(level)} dB` : 'Silent'}</span>
    </div>
  )
}

export function MasterAudioControls({ master, onChange, level, duration }) {
  return (
    <section className="audio-section">
      <header>
        <SlidersHorizontal size={15} aria-hidden="true" />
        <div>
          <h4>Whole project</h4>
          <small>Applies to everything you hear and export.</small>
        </div>
      </header>
      <LevelMeter level={level} />
      <label className="audio-slider">
        <span>Master volume {master.volume}%</span>
        <input type="range" min="0" max="200" value={master.volume} onChange={(event) => onChange({ volume: Number(event.target.value) })} />
      </label>
      <FadeControls fadeIn={master.fadeIn} fadeOut={master.fadeOut} max={Math.max(0.1, Math.min(10, duration / 2))} onChange={onChange} />
      <Equalizer idPrefix="master" eq={master.eq} onChange={(eq) => onChange({ eq })} />
      <label className="property-toggle">
        <input type="checkbox" checked={master.limiter} onChange={(event) => onChange({ limiter: event.target.checked })} />
        Prevent distortion (limiter)
      </label>
    </section>
  )
}

export function ClipAudioControls({ clip, isVideoClip, localPlayhead, peakDb, onChange, onCommit, onDetach }) {
  if (!clip) {
    return (
      <section className="audio-section audio-section-empty">
        <header>
          <AudioLines size={15} aria-hidden="true" />
          <div>
            <h4>Selected clip</h4>
            <small>Click a video or audio clip on the timeline to adjust just that clip.</small>
          </div>
        </header>
      </section>
    )
  }

  const zones = clip.zones ?? []
  const fadeMax = Math.max(0.1, Math.min(5, clip.duration / 2))
  const updateZone = (zoneId, patch) => onChange({ zones: zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)) })
  const addZone = () => {
    const center = Math.max(0, Math.min(clip.duration, localPlayhead))
    const start = Math.max(0, Math.min(center - 1, clip.duration - 2))
    const end = Math.min(clip.duration, start + 2)
    onCommit()
    onChange({ zones: [...zones, { id: `zone-${Date.now().toString(36)}-${zones.length}`, start: Number(start.toFixed(1)), end: Number(end.toFixed(1)), gainDb: -6 }] })
  }

  return (
    <section className="audio-section">
      <header>
        <AudioLines size={15} aria-hidden="true" />
        <div>
          <h4>Selected clip</h4>
          <small>{clip.assetName}</small>
        </div>
      </header>

      {isVideoClip && (
        clip.audioDetached ? (
          <p className="audio-hint">This clip&apos;s sound was detached to an audio track. Edit it there.</p>
        ) : (
          <button type="button" className="tool-button audio-detach" onClick={onDetach}>
            <Scissors size={14} aria-hidden="true" /> Detach audio to its own track
          </button>
        )
      )}

      {!(isVideoClip && clip.audioDetached) && (
        <>
          <label className="audio-slider">
            <span>Clip volume {clip.volume ?? 100}%</span>
            <input type="range" min="0" max="200" value={clip.volume ?? 100} onPointerDown={onCommit} onChange={(event) => onChange({ volume: Number(event.target.value) })} />
          </label>
          {peakDb > 0 && <p className="audio-warning">Boosted above 100% — the limiter keeps it from distorting, but lower it if it sounds harsh.</p>}
          <FadeControls fadeIn={clip.fadeIn} fadeOut={clip.fadeOut} max={fadeMax} onChange={onChange} onCommit={onCommit} />

          <div className="audio-zones">
            <div className="audio-zones-head">
              <strong>Loud / quiet spots</strong>
              <button type="button" className="toolbar-btn" onClick={addZone}>+ Zone at playhead</button>
            </div>
            <p className="audio-hint">Turn a section down (too loud) or up (too quiet) without touching the rest of the clip.</p>
            {zones.map((zone, index) => (
              <div key={zone.id} className="audio-zone">
                <div className="audio-zone-row">
                  <span>Zone {index + 1}</span>
                  <label>From<input type="number" min="0" max={clip.duration} step="0.1" value={zone.start} onFocus={onCommit} onChange={(event) => updateZone(zone.id, { start: Math.max(0, Math.min(Number(event.target.value), zone.end - 0.1)) })} /></label>
                  <label>To<input type="number" min="0" max={clip.duration} step="0.1" value={zone.end} onFocus={onCommit} onChange={(event) => updateZone(zone.id, { end: Math.min(clip.duration, Math.max(Number(event.target.value), zone.start + 0.1)) })} /></label>
                  <button type="button" className="track-btn" title="Remove zone" onClick={() => { onCommit(); onChange({ zones: zones.filter((item) => item.id !== zone.id) }) }}><Trash2 size={13} /></button>
                </div>
                <label className="audio-slider">
                  <span>{zone.gainDb < 0 ? 'Quieter' : zone.gainDb > 0 ? 'Louder' : 'Unchanged'} {signedDb(zone.gainDb)}</span>
                  <input type="range" min={ZONE_MIN_DB} max={ZONE_MAX_DB} step="1" value={zone.gainDb} onPointerDown={onCommit} onChange={(event) => updateZone(zone.id, { gainDb: Number(event.target.value) })} />
                </label>
              </div>
            ))}
          </div>

          <Equalizer idPrefix={`clip-${clip.id}`} eq={clip.eq} onCommit={onCommit} onChange={(eq) => onChange({ eq })} />
          <label className="property-toggle">
            <input type="checkbox" checked={clip.noiseRemoval ?? false} onChange={(event) => { onCommit(); onChange({ noiseRemoval: event.target.checked }) }} />
            Cut low rumble &amp; high hiss
          </label>
        </>
      )}
    </section>
  )
}
