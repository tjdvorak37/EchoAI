import './PhotoObjectProperties.css'

function NumericProperty({ label, value, min, max, onCommit, onError }) {
  return (
    <label>
      <span>{label}</span>
      <input
        key={value}
        type="number"
        step="0.01"
        min={min}
        max={max}
        defaultValue={Number(value.toFixed(2))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = String(Number(value.toFixed(2)))
            event.currentTarget.blur()
          }
        }}
        onBlur={(event) => {
          const input = event.currentTarget
          const next = Number(input.value)
          if (!input.value.trim() || !Number.isFinite(next) || next < min || next > max) {
            onError(`${label} must be between ${min} and ${max}.`)
            input.value = String(Number(value.toFixed(2)))
            return
          }
          if (Math.abs(next - value) > 0.005) onCommit(next)
        }}
      />
    </label>
  )
}

export function PhotoObjectProperties({ layer, canvasWidth, canvasHeight, onCommit, onError, onDuplicate, onDelete, onAlign, onUnlock }) {
  if (!layer) return <div className="panel-block photo-object-properties"><p>Select an object in the Objects panel to edit its properties.</p></div>
  const numeric = (label, value, min, max, patch) => (
    <NumericProperty label={label} value={value} min={min} max={max} onCommit={(next) => onCommit(patch(next))} onError={onError} />
  )
  return (
    <section className="panel-block photo-object-properties" aria-label="Object geometry">
      <h3>{layer.label}</h3>
      {layer.locked && <><p className="panel-note">This object is locked. Unlock it to edit its properties.</p><button type="button" className="ghost-button" onClick={onUnlock}>Unlock object</button></>}
      <p className="panel-note">{layer.isBaseImage ? 'Original photo: use Crop and Image shape below to change its framing.' : 'Position is the object anchor in canvas pixels. Shapes and images use their center; text uses its alignment anchor.'}</p>
      {!layer.isBaseImage && <fieldset className="photo-object-edit-fields" disabled={layer.locked}>
        <div className="photo-object-fields">
          {numeric('Position X (px)', layer.x / 100 * canvasWidth, 0, canvasWidth, (next) => ({ x: next / canvasWidth * 100 }))}
          {numeric('Position Y (px)', layer.y / 100 * canvasHeight, 0, canvasHeight, (next) => ({ y: next / canvasHeight * 100 }))}
          {(layer.type === 'shape' || layer.type === 'image') && numeric('Object width (px)', (layer.width ?? 50) / 100 * canvasWidth, canvasWidth * 0.02, canvasWidth, (next) => ({ width: next / canvasWidth * 100 }))}
          {layer.type === 'shape' && numeric('Object height (px)', layer.height / 100 * canvasHeight, canvasHeight * (layer.shape === 'line' ? 0.001 : 0.02), canvasHeight, (next) => ({ height: next / canvasHeight * 100 }))}
          {(layer.type === 'text' || layer.type === 'sticker') && numeric('Text size', layer.fontSize ?? 34, 16, 96, (next) => ({ fontSize: next }))}
          {numeric('Object rotation (degrees)', layer.rotation ?? 0, -180, 180, (next) => ({ rotation: next }))}
          {numeric('Object opacity (%)', layer.opacity ?? 100, 0, 100, (next) => ({ opacity: next }))}
        </div>
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
        <p className="panel-note">With Pick active and the canvas focused: arrow keys move 1 canvas pixel; Shift + arrow moves 10.</p>
      </fieldset>}
      <div className="photo-object-position-actions" role="group" aria-label="Object actions">
        <button type="button" onClick={onDuplicate}>Duplicate object</button>
        <button type="button" disabled={layer.locked} onClick={onDelete}>Delete object</button>
      </div>
    </section>
  )
}
