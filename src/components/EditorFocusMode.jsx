import { Maximize2, Minimize2, Scan } from 'lucide-react'

export function EditorFocusToggle({ focused, onToggle, fullscreen, onToggleFullscreen, label }) {
	return (
		<div className="editor-focus-controls" aria-label={`${label} view controls`}>
			<button
				type="button"
				className={`editor-focus-button ${focused ? 'is-focused' : ''}`}
				onClick={onToggle}
				aria-pressed={focused}
				title={focused ? 'Restore the full site view (F)' : 'Focus on editing (F)'}
			>
				<span className="editor-focus-button-inner">
					{focused ? <Minimize2 size={15} aria-hidden="true" /> : <Scan size={15} aria-hidden="true" />}
					{focused ? 'Restore site' : 'Focus on editing'}
					<kbd>F</kbd>
				</span>
			</button>
			<button
				type="button"
				className="editor-fullscreen-button"
				onClick={onToggleFullscreen}
				aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
				title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
			>
				{fullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
			</button>
		</div>
	)
}
