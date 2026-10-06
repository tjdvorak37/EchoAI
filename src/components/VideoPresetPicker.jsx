import { buildClipFilter } from '../services/videoVisualPresets'

export function VideoPresetPicker({ label, presets, selectedKey, disabled, kind, onSelect }) {
  const groups = [...new Set(Object.values(presets).map((preset) => preset.group))]
  return <section className="video-preset-picker" aria-label={label}>
    {groups.map((group) => <div key={group} className="video-preset-category">
      <h4>{group}</h4>
      <div className="video-preset-grid">
        {Object.entries(presets).filter(([, preset]) => preset.group === group).map(([key, preset]) => <button
          key={key} type="button" className={`video-preset-card ${selectedKey === key ? 'active' : ''}`}
          aria-label={preset.label} aria-pressed={selectedKey === key} disabled={disabled}
          onClick={() => onSelect(key)}
          title={kind === 'transition' ? `${preset.label}: ${preset.kind === 'none' ? 'no edge transition' : `${preset.seconds}s entrance and exit`}` : preset.label}
        >
          <span className={`video-preset-sample ${kind === 'transition' ? `video-preset-motion motion-${preset.kind}` : ''}`}
            aria-hidden="true" style={kind === 'filter' ? { filter: preset.css || 'none' }
              : kind === 'effect' ? { filter: buildClipFilter({ effects: preset.effects }) }
                : { '--preset-duration': `${preset.seconds || 0.6}s`, '--preset-direction': preset.direction ?? 1, '--preset-scale': 1 + (preset.amount ?? 0.25) }}>
            <span className="video-preset-scene" />
          </span>
          <strong>{preset.label}</strong>
        </button>)}
      </div>
    </div>)}
  </section>
}
