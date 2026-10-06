import { useEffect } from 'react'
import { X } from 'lucide-react'

const PHOTO_SHORTCUTS = [
  ['Tools', [
    ['V', 'Move / select layers'],
    ['M', 'Rectangular marquee'],
    ['L', 'Lasso (Shift+L: polygonal lasso)'],
    ['W', 'Object selection (Shift+W: magic wand)'],
    ['C', 'Crop'],
    ['B', 'Brush'],
    ['E', 'Eraser'],
    ['J', 'Healing brush'],
    ['G', 'Paint bucket'],
    ['T', 'Add text'],
    ['U', 'Add rectangle'],
    ['[  /  ]', 'Smaller / larger brush'],
  ]],
  ['Selection & masks', [
    ['Ctrl+A', 'Select all'],
    ['Ctrl+D', 'Deselect'],
    ['Ctrl+Shift+I', 'Invert selection'],
    ['Shift / Alt + drag', 'Add to / subtract from selection'],
    ['Enter', 'Close polygonal lasso'],
    ['Esc', 'Cancel lasso or close dialog'],
  ]],
  ['Adjustments & layers', [
    ['Ctrl+U', 'Hue/Saturation'],
    ['Ctrl+J', 'Duplicate layer'],
    ['Delete', 'Delete layer'],
    ['Ctrl+Shift+E', 'Flatten image'],
    ['Right-click layer', 'Layer menu'],
  ]],
  ['Classic object editing', [
    ['Shift + click', 'Add / remove design objects from selection'],
    ['Alt + click', 'Select one object within a group'],
    ['Drag empty canvas', 'Pick/Move: select fully enclosed design objects'],
    ['Shift / Alt + box drag', 'Add to selection / select individual group members'],
    ['Alt during object drag', 'Bypass Classic edge/center snapping'],
    ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup selected design objects'],
    ['Ctrl+C / Ctrl+V', 'Copy / paste design objects (including selections)'],
    ['Arrow keys', 'Pick: nudge the focused canvas object by 1 canvas pixel'],
    ['Shift + arrow keys', 'Pick: nudge by 10 canvas pixels'],
    ['Enter / Esc', 'Numeric properties: apply / cancel the draft'],
    ['Shift + handle drag', 'Preserve shape proportions / snap rotation to 15 degrees'],
    ['Up / Down on resize handle', 'Scale selected object by 2%'],
    ['Left / Right on rotation handle', 'Rotate by 1 degree (15 with Shift)'],
  ]],
  ['View & file', [
    ['F', 'Focus mode (editor only / full site)'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['Ctrl+ + / Ctrl+ −', 'Zoom in / out'],
    ['Ctrl+0', 'Fit on screen'],
    ['Ctrl+Alt+Shift+W', 'Export'],
    ['?', 'Show this list'],
  ]],
]

export function PhotoShortcutsOverlay({ onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' || event.key === '?') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="hs-backdrop" onClick={onClose}>
      <div className="shortcut-sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>Keyboard shortcuts</h3>
          <button type="button" className="hs-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="shortcut-columns">
          {PHOTO_SHORTCUTS.map(([group, items]) => (
            <section key={group}>
              <h4>{group}</h4>
              <dl>
                {items.map(([keys, action]) => (
                  <div key={keys}>
                    <dt>{keys.split(' / ').map((part) => <kbd key={part}>{part}</kbd>)}</dt>
                    <dd>{action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="muted">On a Mac, use ⌘ instead of Ctrl.</p>
      </div>
    </div>
  )
}
