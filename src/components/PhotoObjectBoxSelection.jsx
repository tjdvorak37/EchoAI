import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { boxSelectedObjectIds } from '../services/photoObjectSelection'

export function PhotoObjectBoxSelection({ stageRef, layers, selectedIds, onSelect }) {
  const [box, setBox] = useState(null)
  const latest = useRef({ layers, selectedIds, onSelect })
  useEffect(() => { latest.current = { layers, selectedIds, onSelect } }, [layers, selectedIds, onSelect])

  useEffect(() => {
    const stage = stageRef.current
    let cleanupGesture
    const down = (event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button, input, select, summary, .photo-layer'))) return
      if (cleanupGesture) return
      const { layers, selectedIds } = latest.current
      event.preventDefault()
      const startX = event.clientX
      const startY = event.clientY
      const pointerId = event.pointerId
      let bounds
      const measure = (moveEvent) => ({
        left: Math.min(startX, moveEvent.clientX), top: Math.min(startY, moveEvent.clientY),
        width: Math.abs(moveEvent.clientX - startX), height: Math.abs(moveEvent.clientY - startY),
      })
      const cleanup = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancelPointer)
        window.removeEventListener('keydown', keyDown, true)
        window.removeEventListener('blur', cancel)
        setBox(null)
        cleanupGesture = undefined
      }
      const cancel = () => cleanup()
      const cancelPointer = (cancelEvent) => { if (cancelEvent.pointerId === pointerId) cancel() }
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        bounds = measure(moveEvent)
        setBox(bounds)
      }
      const up = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return
        bounds = measure(upEvent)
        const objects = [...stage.querySelectorAll('.photo-layer')].map((element) => ({
          layer: layers.find((layer) => layer.id === element.dataset.layerId),
          bounds: element.getBoundingClientRect(),
        })).filter((object) => object.layer)
        const picked = bounds.width < 3 && bounds.height < 3 ? []
          : boxSelectedObjectIds(layers, objects, bounds, { individual: event.altKey })
        const ids = event.shiftKey ? [...new Set([...selectedIds, ...picked])] : picked
        cleanup()
        latest.current.onSelect(ids)
      }
      const keyDown = (keyEvent) => {
        if (keyEvent.key !== 'Escape') return
        keyEvent.preventDefault()
        keyEvent.stopPropagation()
        cancel()
      }
      cleanupGesture = cleanup
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancelPointer)
      window.addEventListener('keydown', keyDown, true)
      window.addEventListener('blur', cancel)
    }
    stage.addEventListener('pointerdown', down)
    return () => {
      stage.removeEventListener('pointerdown', down)
      cleanupGesture?.()
    }
  }, [stageRef])

  return box && createPortal(<div className="photo-design-selection-box" aria-hidden="true" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />, document.body)
}
