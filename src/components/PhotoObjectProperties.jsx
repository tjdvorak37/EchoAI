import './PhotoObjectProperties.css'
import { DEFAULT_PHOTO_MEASUREMENTS, pixelsToUnits, unitsToPixels } from '../services/photoMeasurements'

export function NumericProperty({ label, ariaLabel = label, value, min, max, onCommit, onError, precision = 2 }) {
  const displayed = Number(value.toFixed(precision))
  return (
    <label>
      <span>{label}</span>
      <input
        key={value}
        aria-label={ariaLabel}
        type="number"
        step={10 ** -precision}
        min={min}
        max={max}
        defaultValue={displayed}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = String(displayed)
            event.currentTarget.blur()
          }
        }}
        onBlur={(event) => {
          const input = event.currentTarget
          const next = Number(input.value)
          if (input.value.trim() && next === displayed) return
          if (!input.value.trim() || !Number.isFinite(next) || next < min || next > max) {
            onError(`${label} must be between ${min} and ${max}.`)
            input.value = String(displayed)
            return
          }
          if (Math.abs(next - value) > 0.5 * 10 ** -precision) onCommit(next)
        }}
      />
    </label>
  )
}

export function PhotoObjectGeometryFields({ layer, canvasWidth, canvasHeight, settings = DEFAULT_PHOTO_MEASUREMENTS, onCommit, onError, compact = false }) {
  const compactLabel = (label) => label
    .replace('Position X', 'X').replace('Position Y', 'Y')
    .replace('Object width', 'W').replace('Object height', 'H')
    .replace('Object rotation (degrees)', 'Rotation').replace('Object opacity (%)', 'Opacity (%)')
  const numeric = (label, value, min, max, patch) => (
    <NumericProperty label={compact ? compactLabel(label) : label}
      ariaLabel={compact ? label === 'Object rotation (degrees)' ? 'Rotation' : label === 'Object opacity (%)' ? 'Object opacity' : `Tool ${label}` : label}
      precision={settings.unit === 'px' ? 2 : 4}
      value={value} min={min} max={max} onCommit={(next) => onCommit(patch(next))} onError={onError} />
  )
  const dimension = (label, percent, canvas, minimum, key) => numeric(
    `${label} (${settings.unit})`, pixelsToUnits(percent / 100 * canvas, settings),
    pixelsToUnits(minimum * canvas, settings), pixelsToUnits(canvas, settings),
    (next) => ({ [key]: unitsToPixels(next, settings) / canvas * 100 }),
  )
  return <fieldset className={`photo-object-fields ${compact ? 'photo-object-fields-compact' : ''}`} disabled={layer.locked}>
    {dimension('Position X', layer.x, canvasWidth, 0, 'x')}
    {dimension('Position Y', layer.y, canvasHeight, 0, 'y')}
    {(layer.type === 'shape' || layer.type === 'image') && dimension('Object width', layer.width ?? 50, canvasWidth, 0.02, 'width')}
    {layer.type === 'shape' && dimension('Object height', layer.height, canvasHeight, layer.shape === 'line' ? 0.001 : 0.02, 'height')}
    {(layer.type === 'text' || layer.type === 'sticker') && numeric('Text size', layer.fontSize ?? 34, 16, 96, (next) => ({ fontSize: next }))}
    {numeric('Object rotation (degrees)', layer.rotation ?? 0, -180, 180, (next) => ({ rotation: next }))}
    {numeric('Object opacity (%)', layer.opacity ?? 100, 0, 100, (next) => ({ opacity: next }))}
  </fieldset>
}

export function PhotoObjectProperties({ layer, canvasWidth, canvasHeight, settings = DEFAULT_PHOTO_MEASUREMENTS, onCommit, onError, onDuplicate, onDelete, onAlign, onUnlock }) {
  if (!layer) return <div className="panel-block photo-object-properties"><p>Select an object in the Objects panel to edit its properties.</p></div>
  return (
    <section className="panel-block photo-object-properties" aria-label="Object geometry">
      <h3>{layer.label}</h3>
      {layer.locked && <><p className="panel-note">This object is locked. Unlock it to edit its properties.</p><button type="button" className="ghost-button" onClick={onUnlock}>Unlock object</button></>}
      <p className="panel-note">{layer.isBaseImage ? 'Original photo: use Crop and Image shape below to change its framing.' : `Position is the object anchor in ${settings.unit} at ${settings.ppi} PPI. Shapes and images use their center; text uses its alignment anchor.`}</p>
      {!layer.isBaseImage && <fieldset className="photo-object-edit-fields" disabled={layer.locked}>
        <PhotoObjectGeometryFields layer={layer} canvasWidth={canvasWidth} canvasHeight={canvasHeight} settings={settings} onCommit={onCommit} onError={onError} />
        {layer.type === 'image' && <p className="panel-note">Image width keeps the original aspect ratio.</p>}
        <div className="photo-object-position-actions" role="group" aria-label="Object anchor positioning">
          <button type="button" onClick={() => onCommit({ x: 50 })}>Center X anchor</button>
          <button type="button" onClick={() => onCommit({ y: 50 })}>Center Y anchor</button>
        </div>
        <div className="photo-object-position-actions" role="group" aria-label="Align object to canvas">
          {[
            ['left', 'Align left'], ['center', 'Align horizontal center'], ['right', 'Align right'],
            ['top', 'Align top'], ['middle', 'Align vertical center'], ['bottom', 'Align bottom'],
          ].map(([alignment, label]) => (
            <button key={alignment} type="button" disabled={layer.hidden} onClick={() => onAlign(alignment)}>{label}</button>
          ))}
        </div>
        <p className="panel-note">Alignment uses the visible object's rotated bounding box. Pick shows resize/rotation handles for shapes, images, and stickers. Resize keeps the center fixed; Shift preserves shape proportions or snaps rotation to 15 degrees.</p>
        <p className="panel-note">With Pick active and the canvas focused: arrow keys use the toolbar Nudge distance (default 1 canvas pixel); Shift + arrow moves ten times that distance.</p>
      </fieldset>}
      <div className="photo-object-position-actions" role="group" aria-label="Object actions">
        <button type="button" onClick={onDuplicate}>Duplicate object</button>
        <button type="button" disabled={layer.locked} onClick={onDelete}>Delete object</button>
      </div>
    </section>
  )
}
