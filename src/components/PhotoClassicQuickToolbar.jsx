import { Expand, Grid3X3, Magnet, Ruler, ScanLine, ZoomIn, ZoomOut } from 'lucide-react'
import { NumericProperty } from './PhotoObjectProperties'
import { pixelsToUnits, unitsToPixels } from '../services/photoMeasurements'
import './PhotoClassicQuickToolbar.css'

export function PhotoClassicQuickToolbar({ groups, zoom, onZoom, onFit, rulers, grid, guides, snapping,
  onRulers, onGrid, onGuides, onSnapping, nudgePixels, onNudge, settings, onError }) {
  return <div className="photo-classic-quick-toolbar" aria-label="Classic quick editing toolbar">
    <div className="photo-classic-quick-commands">
      {groups.map((group) => <div key={group.label} className="photo-classic-quick-group" role="group" aria-label={group.label}>
        {group.actions.map(({ label, icon: Icon, onClick, disabled, title, pressed }) => <button
          key={label} type="button" className="photo-topbar-icon" aria-label={label} title={title || label}
          onClick={onClick} disabled={disabled} aria-pressed={pressed}
        ><Icon size={17} aria-hidden="true" /></button>)}
      </div>)}
    </div>
    <div className="photo-classic-quick-group photo-classic-view-controls" role="group" aria-label="Document view controls">
      <button type="button" className="photo-topbar-icon" aria-label="Zoom out" title="Zoom out (Ctrl+-)" disabled={zoom <= 25} onClick={() => onZoom(Math.max(25, zoom - 10))}><ZoomOut size={17} /></button>
      <NumericProperty label="Zoom (%)" value={zoom} min={25} max={400} precision={0} onCommit={onZoom} onError={onError} />
      <button type="button" className="photo-topbar-icon" aria-label="Zoom in" title="Zoom in (Ctrl++)" disabled={zoom >= 400} onClick={() => onZoom(Math.min(400, zoom + 10))}><ZoomIn size={17} /></button>
      <button type="button" className="photo-topbar-icon" aria-label="Fit page" title="Fit page and center view (Ctrl+0)" onClick={onFit}><Expand size={17} /></button>
      {[
        ['Rulers', Ruler, rulers, onRulers, 'Show document rulers'],
        ['Grid', Grid3X3, grid, onGrid, 'Show visual grid (grid snapping is not enabled)'],
        ['Guides', ScanLine, guides, onGuides, 'Show canvas center guides'],
        ['Snap', Magnet, snapping, onSnapping, 'Snap to object/page edges and centers; hold Alt to bypass'],
      ].map(([label, Icon, pressed, onClick, title]) => <button key={label} type="button" className="photo-topbar-icon" aria-label={label} title={title} aria-pressed={pressed} onClick={onClick}><Icon size={17} /></button>)}
      <NumericProperty key={settings.unit} label={`Nudge (${settings.unit})`} value={pixelsToUnits(nudgePixels, settings)}
        min={pixelsToUnits(0.01, settings)} max={pixelsToUnits(8192, settings)} precision={settings.unit === 'px' ? 2 : 4}
        onCommit={(value) => onNudge(unitsToPixels(value, settings))} onError={onError} />
    </div>
  </div>
}
