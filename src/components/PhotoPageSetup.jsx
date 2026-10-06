import { useState } from 'react'
import { PHOTO_UNITS, measuredCanvasSize, pixelsToUnits } from '../services/photoMeasurements'
import './PhotoPageSetup.css'

export function PhotoPageSetup({ width, height, settings, onApply, onError, create = false }) {
  const [draft, setDraft] = useState(() => ({
    width: Number(pixelsToUnits(width, settings).toFixed(4)),
    height: Number(pixelsToUnits(height, settings).toFixed(4)),
    ...settings,
  }))
  const changeUnit = (unit) => {
    const oldSettings = { unit: draft.unit, ppi: Number(draft.ppi) }
    try {
      const size = measuredCanvasSize(draft.width, draft.height, oldSettings)
      const next = { unit, ppi: Number(draft.ppi) }
      setDraft({ ...next, width: Number(pixelsToUnits(size.width, next).toFixed(4)), height: Number(pixelsToUnits(size.height, next).toFixed(4)) })
    } catch (error) { onError(error.message) }
  }
  const apply = (event) => {
    event.preventDefault()
    try {
      const settings = { unit: draft.unit, ppi: Number(draft.ppi) }
      onApply({ ...measuredCanvasSize(draft.width, draft.height, settings), settings })
    } catch (error) { onError(error.message) }
  }
  const field = (key, label, min, max) => <label>{label}<input
    aria-label={label}
    type="number" step="any" min={min} max={max}
    value={draft[key]}
    onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
  /></label>
  return (
    <form className="photo-page-setup" aria-label={create ? 'New document measurements' : 'Page setup'} onSubmit={apply}>
      <strong>{create ? 'Document size' : 'Page'}</strong>
      {field('width', 'Page width', 0.0001)}
      {field('height', 'Page height', 0.0001)}
      <label>Units<select aria-label="Document units" value={draft.unit} onChange={(event) => changeUnit(event.target.value)}>
        {Object.entries(PHOTO_UNITS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {field('ppi', 'Resolution (PPI)', 36, 1200)}
      <button type="button" aria-label="Swap page orientation" title="Swap page width and height" onClick={() => setDraft({ ...draft, width: draft.height, height: draft.width })}>Swap</button>
      <button type="submit">{create ? 'Create new design' : 'Apply page setup'}</button>
    </form>
  )
}
