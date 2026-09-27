import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { HUE_RANGES, HUE_SAT_PRESETS, defaultHueSat } from '../services/photoPixelOps'

const SPECTRUM = 'linear-gradient(90deg, #f00, #ff0 16.6%, #0f0 33.3%, #0ff 50%, #00f 66.6%, #f0f 83.3%, #f00)'

const Slider = ({ label, min, max, value, onChange, background }) => (
  <label className="hs-slider">
    <span>{label}</span>
    <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || 0)))} aria-label={`${label} value`} />
    <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} style={background ? { background } : undefined} aria-label={label} />
  </label>
)

// Photoshop-style Hue/Saturation (Ctrl+U). Edits preview live; Cancel restores the value it opened with.
export function PhotoHueSaturationDialog({ initial, onPreview, onApply, onCancel }) {
  const [settings, setSettings] = useState(() => structuredClone(initial ?? defaultHueSat()))
  const [rangeKey, setRangeKey] = useState('master')
  const [preview, setPreview] = useState(true)
  const [preset, setPreset] = useState('custom')
  const openedWith = useRef(initial)
  const previewRef = useRef(onPreview)

  useEffect(() => {
    previewRef.current = onPreview
  })

  useEffect(() => {
    previewRef.current(preview ? settings : openedWith.current)
  }, [settings, preview])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const range = settings.ranges[rangeKey]
  const updateRange = (patch) => {
    setPreset('custom')
    setSettings((current) => ({ ...current, ranges: { ...current.ranges, [rangeKey]: { ...current.ranges[rangeKey], ...patch } } }))
  }
  const update = (patch) => {
    setPreset('custom')
    setSettings((current) => ({ ...current, ...patch }))
  }

  const hueShift = settings.colorize ? 0 : range.hue
  const after = settings.colorize
    ? `linear-gradient(90deg, hsl(${settings.colorizeHue} ${settings.colorizeSaturation}% 10%), hsl(${settings.colorizeHue} ${settings.colorizeSaturation}% 50%), hsl(${settings.colorizeHue} ${settings.colorizeSaturation}% 90%))`
    : `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((h, index) => `hsl(${h + (rangeKey === 'master' || HUE_RANGES[rangeKey].center === h % 360 ? hueShift : 0)} ${Math.max(0, 100 + range.saturation)}% ${50 + range.lightness / 2}%) ${(index / 6) * 100}%`).join(', ')})`

  return (
    <div className="hs-backdrop" onClick={onCancel}>
      <div className="hs-dialog" role="dialog" aria-modal="true" aria-label="Hue/Saturation" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>Hue/Saturation</h3>
          <button type="button" className="hs-close" onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
        </header>

        <div className="hs-body">
          <div className="hs-main">
            <label className="hs-preset">
              <span>Preset</span>
              <select
                value={preset}
                onChange={(event) => {
                  const next = HUE_SAT_PRESETS[event.target.value]
                  if (!next) return
                  setPreset(event.target.value)
                  setSettings(next.build())
                  setRangeKey('master')
                }}
              >
                <option value="custom">Custom</option>
                {Object.entries(HUE_SAT_PRESETS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </label>

            <div className="hs-ranges" role="radiogroup" aria-label="Color range">
              {Object.entries(HUE_RANGES).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={rangeKey === key}
                  className={rangeKey === key ? 'active' : ''}
                  disabled={settings.colorize && key !== 'master'}
                  title={meta.label}
                  onClick={() => setRangeKey(key)}
                >
                  <span style={{ background: meta.swatch }} />
                  <small>{meta.label}</small>
                </button>
              ))}
            </div>

            {settings.colorize ? (
              <>
                <Slider label="Hue" min={0} max={360} value={settings.colorizeHue} onChange={(value) => update({ colorizeHue: value })} background={SPECTRUM} />
                <Slider label="Saturation" min={0} max={100} value={settings.colorizeSaturation} onChange={(value) => update({ colorizeSaturation: value })} />
                <Slider label="Lightness" min={-100} max={100} value={settings.colorizeLightness} onChange={(value) => update({ colorizeLightness: value })} background="linear-gradient(90deg, #000, #888, #fff)" />
              </>
            ) : (
              <>
                <Slider label="Hue" min={-180} max={180} value={range.hue} onChange={(value) => updateRange({ hue: value })} background={SPECTRUM} />
                <Slider label="Saturation" min={-100} max={100} value={range.saturation} onChange={(value) => updateRange({ saturation: value })} background="linear-gradient(90deg, #888, #e11d48)" />
                <Slider label="Lightness" min={-100} max={100} value={range.lightness} onChange={(value) => updateRange({ lightness: value })} background="linear-gradient(90deg, #000, #888, #fff)" />
              </>
            )}

            <label className="hs-check">
              <input type="checkbox" checked={settings.colorize} onChange={(event) => update({ colorize: event.target.checked })} />
              Colorize
            </label>

            <div className="hs-before-after" aria-hidden="true">
              <small>Before · After</small>
              <span style={{ background: SPECTRUM }} />
              <span style={{ background: after }} />
            </div>
          </div>

          <div className="hs-actions">
            <button type="button" className="primary-button" onClick={() => onApply(settings)}>OK</button>
            <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
            <button type="button" className="ghost-button" onClick={() => { setPreset('default'); setSettings(defaultHueSat()) }}>Reset</button>
            <label className="hs-check">
              <input type="checkbox" checked={preview} onChange={(event) => setPreview(event.target.checked)} />
              Preview
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
