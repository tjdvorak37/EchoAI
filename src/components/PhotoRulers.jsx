import { useLayoutEffect, useRef, useState } from 'react'
import { pixelsPerUnit, rulerTicks } from '../services/photoMeasurements'
import './PhotoRulers.css'

export function PhotoRulers({ stageRef, viewportRef, width, height, settings, zoom, pan }) {
  const [geometry, setGeometry] = useState(null)
  const overlayRef = useRef(null)
  useLayoutEffect(() => {
    const viewport = overlayRef.current.closest('.photo-stage-wrap')
    const stage = viewport.querySelector('.photo-stage')
    const measure = () => {
      const page = stage.getBoundingClientRect()
      const frame = viewport.getBoundingClientRect()
      const scaleX = page.width / stage.offsetWidth
      const scaleY = page.height / stage.offsetHeight
      setGeometry({
        width: viewport.clientWidth, height: viewport.clientHeight,
        x: page.left - frame.left - viewport.clientLeft + stage.clientLeft * scaleX,
        y: page.top - frame.top - viewport.clientTop + stage.clientTop * scaleY,
        scaleX: stage.clientWidth * scaleX / width * pixelsPerUnit(settings),
        scaleY: stage.clientHeight * scaleY / height * pixelsPerUnit(settings),
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    observer.observe(viewport)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [stageRef, viewportRef, width, height, settings, zoom, pan])
  return (
    <div ref={overlayRef} className="photo-document-rulers" aria-label={`Document rulers in ${settings.unit}`}>
      {geometry && <>
      <svg className="photo-document-ruler-top" width={geometry.width} height="20" aria-hidden="true">
        <rect width="100%" height="20" fill="#f1f5f9" />
        {rulerTicks(geometry.width, geometry.x, geometry.scaleX).map((tick) => <g key={tick.label}>
          <line x1={tick.position} x2={tick.position} y1={tick.major ? 12 : 16} y2="20" />
          {tick.major && <text x={tick.position + 2} y="10">{tick.label}</text>}
        </g>)}
      </svg>
      <svg className="photo-document-ruler-left" width="20" height={geometry.height} aria-hidden="true">
        <rect width="20" height="100%" fill="#f1f5f9" />
        {rulerTicks(geometry.height, geometry.y, geometry.scaleY).map((tick) => <g key={tick.label}>
          <line x1={tick.major ? 12 : 16} x2="20" y1={tick.position} y2={tick.position} />
          {tick.major && <text transform={`translate(10 ${tick.position - 2}) rotate(-90)`}>{tick.label}</text>}
        </g>)}
      </svg>
      <span className="photo-document-ruler-unit">{settings.unit}</span>
      </>}
    </div>
  )
}
