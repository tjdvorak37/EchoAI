import './PhotoObjectSelectionPanel.css'

export function PhotoObjectSelectionPanel({ objects, primaryId, onGroup, onUngroup, onAlign, onDistribute, onLock, onDuplicate, onDelete, onClear }) {
  const reference = objects.find((object) => object.id === primaryId)
  const grouped = objects.some((object) => object.objectGroupId)
  const canTransform = objects.every((object) => !object.hidden && !object.isBaseImage && !object.locked)
  return (
    <section className="panel-block photo-object-selection-panel" aria-label="Selected objects">
      <h3>{objects.length} objects selected</h3>
      <p className="panel-note">Shift-click adds or removes objects. A normal Pick selects visible group members; Alt-click selects an individual member.</p>
      <p className="panel-note">Alignment reference: <strong>{reference?.label}</strong> (last picked object).</p>
      <div className="photo-selection-actions">
        <button type="button" disabled={objects.length < 2 || !canTransform} onClick={onGroup}>Group objects</button>
        <button type="button" disabled={!grouped || objects.some((object) => object.locked)} onClick={onUngroup}>Ungroup objects</button>
        <button type="button" disabled={objects.some((object) => object.isBaseImage)} onClick={onLock}>{objects.every((object) => object.locked) ? 'Unlock selection' : 'Lock selection'}</button>
        <button type="button" onClick={onDuplicate}>Duplicate selection</button>
        <button type="button" disabled={objects.some((object) => object.locked)} onClick={onDelete}>Delete selection</button>
        <button type="button" onClick={onClear}>Clear object selection</button>
      </div>
      {objects.length > 1 && <div className="photo-selection-actions" role="group" aria-label="Align selected objects to reference">
        {[
          ['left', 'Match left edges'], ['center', 'Match horizontal centers'], ['right', 'Match right edges'],
          ['top', 'Match top edges'], ['middle', 'Match vertical centers'], ['bottom', 'Match bottom edges'],
        ].map(([alignment, label]) => <button key={alignment} type="button" disabled={!canTransform} onClick={() => onAlign(alignment)}>{label}</button>)}
      </div>}
      {objects.length >= 3 && <div className="photo-selection-actions" role="group" aria-label="Distribute selected objects">
        {[
          ['horizontal', 'centers', 'Distribute horizontal centers'],
          ['vertical', 'centers', 'Distribute vertical centers'],
          ['horizontal', 'gaps', 'Equal horizontal gaps'],
          ['vertical', 'gaps', 'Equal vertical gaps'],
        ].map(([axis, mode, label]) => <button key={label} type="button" disabled={!canTransform} onClick={() => onDistribute(axis, mode)}>{label}</button>)}
      </div>}
      <p className="panel-note">Pick-drag or arrow keys move selected objects together. Grouping preserves object properties and stacking; it does not flatten the design.</p>
    </section>
  )
}
