import { translateObjectSelection } from './photoObjectSelection.js'

export const snapObjectTranslation = ({ moving, targets, deltaX, deltaY, width, height, scaleX, scaleY, enabled = true }) => {
  const layers = moving.map((object) => object.layer)
  const raw = translateObjectSelection(layers, deltaX, deltaY)
  const dx = raw[0].x - layers[0].x
  const dy = raw[0].y - layers[0].y
  if (!enabled) return { patches: raw, guides: [] }

  const bounds = {
    left: Math.min(...moving.map((object) => object.bounds.left)),
    top: Math.min(...moving.map((object) => object.bounds.top)),
    right: Math.max(...moving.map((object) => object.bounds.left + object.bounds.width)),
    bottom: Math.max(...moving.map((object) => object.bounds.top + object.bounds.height)),
  }
  const movingIds = new Set(layers.map((layer) => layer.id))
  const visibleTargets = targets.filter(({ layer }) => !movingIds.has(layer.id) && !layer.hidden && !layer.isBaseImage)
  const guides = []
  const snapAxis = (key, start, end, size, dimension, scale, delta) => {
    const anchors = [bounds[start], (bounds[start] + bounds[end]) / 2, bounds[end]]
    const lines = [0, dimension / 2, dimension, ...visibleTargets.flatMap((object) => [
      object.bounds[start], object.bounds[start] + object.bounds[size] / 2, object.bounds[start] + object.bounds[size],
    ])]
    let best
    for (const target of lines) {
      for (const anchor of anchors) {
        const correction = target - anchor - delta / 100 * dimension
        if (Math.abs(correction) * scale > 6) continue
        const next = delta + correction / dimension * 100
        if (layers.some((layer) => layer[key] + next < -0.000001 || layer[key] + next > 100.000001)) continue
        if (!best || Math.abs(correction) < Math.abs(best.correction)) best = { correction, next, target }
      }
    }
    if (!best) return delta
    guides.push({ axis: key, position: best.target / dimension * 100 })
    return best.next
  }
  const snappedX = snapAxis('x', 'left', 'right', 'width', width, scaleX, dx)
  const snappedY = snapAxis('y', 'top', 'bottom', 'height', height, scaleY, dy)
  return { patches: translateObjectSelection(layers, snappedX, snappedY), guides }
}
