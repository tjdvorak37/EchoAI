import { useState } from 'react'
import { PHOTO_UNITS, measuredCanvasSize, pixelsToUnits, unitsToPixels } from '../services/photoMeasurements'
import './PhotoPageSetup.css'

export function PhotoPageSetup({ width, height, settings, onApply, onUnitChange, onError, create = false }) {
  const [draft, setDraft] = useState(() => ({
    width: Number(pixelsToUnits(width, settings).toFixed(4)),
    height: Number(pixelsToUnits(height, settings).toFixed(4)),
    ...settings,
    documentUnit: settings.unit,
  }))
  const convertDraft = (unit) => {
    const next = { unit, ppi: Number(draft.ppi) }
    const convert = (value) => {
      if (!String(value).trim() || !Number.isFinite(Number(value))) return value
      const converted = pixelsToUnits(unitsToPixels(Number(value), draft), next)
      return Number.isFinite(converted) ? Number(converted.toFixed(4)) : value
    }
    return { ...draft, unit, documentUnit: unit, width: convert(draft.width), height: convert(draft.height) }
  }
  // Undo/redo changes the document unit without discarding pending page edits.
  if (!create && draft.documentUnit !== settings.unit) {
    setDraft(convertDraft(settings.unit))
  }
  const changeUnit = (unit) => {
    const oldSettings = { unit: draft.unit, ppi: Number(draft.ppi) }
    try {
      measuredCanvasSize(draft.width, draft.height, oldSettings)
      setDraft(convertDraft(unit))
      if (!create) onUnitChange(unit)
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
