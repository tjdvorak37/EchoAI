import { useEffect, useLayoutEffect, useRef } from 'react'
import { normalizeObjectRotation, resizeObjectFromCorner, rotationFromPointer } from '../services/photoObjectTransforms'
import './PhotoObjectHandles.css'

const CORNERS = [
  ['top-left', -1, -1], ['top-right', 1, -1],
  ['bottom-left', -1, 1], ['bottom-right', 1, 1],
]

export function PhotoObjectHandles({ layer, stageRef, displaySize, canvasWidth, canvasHeight, zoom, onPreview, onFinish, onCancel }) {
  const overlayRef = useRef(null)
  const gestureRef = useRef(null)
  const centered = ['shape', 'image', 'sticker'].includes(layer.type)

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const stage = overlay.closest('.photo-stage')
    const object = [...stage.querySelectorAll('.photo-layer')].find((element) => element.dataset.layerId === layer.id)
    if (!object || !overlay) return undefined
    const measure = () => {
      const style = getComputedStyle(object)
      overlay.style.width = style.width
      overlay.style.height = style.height
      overlay.style.transform = object.style.transform
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(object)
    return () => observer.disconnect()
  }, [layer, stageRef, displaySize])

  useEffect(() => () => gestureRef.current?.cancel(), [])

  const objectSize = () => {
    const measuredWidth = parseFloat(overlayRef.current.style.width) / stageRef.current.clientWidth * canvasWidth
    const measuredHeight = parseFloat(overlayRef.current.style.height) / stageRef.current.clientHeight * canvasHeight
    if (layer.type === 'shape') return { width: layer.width / 100 * canvasWidth, height: layer.height / 100 * canvasHeight }
    if (layer.type === 'image') {
      const width = layer.width / 100 * canvasWidth
      return { width, height: measuredHeight * width / measuredWidth }
    }
    return { width: measuredWidth, height: measuredHeight }
  }

  const startGesture = (event, kind, cornerX, cornerY) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    gestureRef.current?.cancel()
    const stage = stageRef.current
    const stageBounds = stage.getBoundingClientRect()
    const scaleX = stageBounds.width / stage.offsetWidth
    const scaleY = stageBounds.height / stage.offsetHeight
    const centerX = stageBounds.left + (stage.clientLeft + stage.clientWidth * layer.x / 100) * scaleX
    const centerY = stageBounds.top + (stage.clientTop + stage.clientHeight * layer.y / 100) * scaleY
    const { width, height } = objectSize()
    const startX = event.clientX
    const startY = event.clientY
    const startAngle = Math.atan2(startY - centerY, startX - centerX)
    const pointerId = event.pointerId
    let patch = {}
    let changed = false
    const cleanUp = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancelPointer)
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('blur', cancel)
      gestureRef.current = null
    }
    const cancel = () => {
      cleanUp()
      onCancel(layer)
    }
    const cancelPointer = (cancelEvent) => {
      if (cancelEvent.pointerId === pointerId) cancel()
    }
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      patch = kind === 'rotate' ? { rotation: rotationFromPointer({
        rotation: layer.rotation || 0,
        startAngle,
        angle: Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX),
        snap: moveEvent.shiftKey,
      }) } : resizeObjectFromCorner({
        layer, width, height, canvasWidth, canvasHeight, cornerX, cornerY,
        deltaX: (moveEvent.clientX - startX) / scaleX / stage.clientWidth * canvasWidth,
        deltaY: (moveEvent.clientY - startY) / scaleY / stage.clientHeight * canvasHeight,
        proportional: moveEvent.shiftKey,
      })
      changed = Object.entries(patch).some(([key, value]) => Math.abs(value - (layer[key] ?? 0)) > 0.0001)
      onPreview(layer.id, patch)
    }
    const finish = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return
      cleanUp()
      if (changed) onFinish()
    }
    const keyDown = (keyEvent) => {
      if (keyEvent.key !== 'Escape') return
      keyEvent.preventDefault()
      keyEvent.stopPropagation()
      cancel()
    }
    gestureRef.current = { cancel }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancelPointer)
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('blur', cancel)
  }

  return (
    <div
      ref={overlayRef}
      className="photo-object-handles"
      style={{ left: `${layer.x}%`, top: `${layer.y}%`, '--object-handle-scale': 1 / (zoom / 100) }}
      role="group"
      aria-label={`Transform ${layer.label}`}
    >
      {centered && <>
        {CORNERS.map(([name, x, y]) => (
          <button key={name} type="button" className={`photo-resize-handle ${name}`} aria-label={`Resize ${name}`} title="Resize from center; Shift preserves shape proportions" onPointerDown={(event) => startGesture(event, 'resize', x, y)} onKeyDown={(event) => {
            if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return
            event.preventDefault()
            event.stopPropagation()
            const scale = event.key === 'ArrowUp' ? 1.02 : 0.98
            const { width, height } = objectSize()
            const radians = (layer.rotation || 0) * Math.PI / 180
            const deltaX = width * (scale - 1) / 2
            const deltaY = height * (scale - 1) / 2
            onFinish(resizeObjectFromCorner({
              layer, width, height,
              deltaX: deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
              deltaY: deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
              cornerX: 1, cornerY: 1, canvasWidth, canvasHeight, proportional: true,
            }))
          }} />
        ))}
        <button type="button" className="photo-rotation-handle" aria-label="Rotate object" title="Drag to rotate; Shift snaps to 15 degrees; arrow keys rotate by 1 degree" onPointerDown={(event) => startGesture(event, 'rotate')} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
          event.preventDefault()
          event.stopPropagation()
          onFinish({ rotation: normalizeObjectRotation((layer.rotation || 0) + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 15 : 1)) })
        }} />
      </>}
    </div>
  )
}
