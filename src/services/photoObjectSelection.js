export const pickObjectIds = (layers, layer, individual = false) => (
  layer.objectGroupId && !individual && !layer.hidden && !layer.isBaseImage
    ? layers.filter((item) => item.objectGroupId === layer.objectGroupId && !item.hidden && !item.isBaseImage).map((item) => item.id)
    : [layer.id]
)

export const toggleObjectIds = (selectedIds, pickedIds) => {
  const remove = pickedIds.every((id) => selectedIds.includes(id))
  return remove ? selectedIds.filter((id) => !pickedIds.includes(id)) : [...new Set([...selectedIds, ...pickedIds])]
}

export const translateObjectSelection = (layers, deltaX, deltaY) => {
  const dx = Math.max(-Math.min(...layers.map((layer) => layer.x)), Math.min(100 - Math.max(...layers.map((layer) => layer.x)), deltaX))
  const dy = Math.max(-Math.min(...layers.map((layer) => layer.y)), Math.min(100 - Math.max(...layers.map((layer) => layer.y)), deltaY))
  return layers.map((layer) => ({ id: layer.id, x: layer.x + dx, y: layer.y + dy }))
}

export const selectionAlignmentPatches = (objects, primaryId, alignment, canvasWidth, canvasHeight) => {
  const reference = objects.find((object) => object.layer.id === primaryId)
  if (!reference) throw new Error('Select a reference object before aligning.')
  const horizontal = ['left', 'center', 'right'].includes(alignment)
  const start = horizontal ? 'left' : 'top'
  const size = horizontal ? 'width' : 'height'
  const fraction = ['left', 'top'].includes(alignment) ? 0 : ['right', 'bottom'].includes(alignment) ? 1 : 0.5
  const target = reference.bounds[start] + reference.bounds[size] * fraction
  return objects.map(({ layer, bounds }) => {
    const key = horizontal ? 'x' : 'y'
    const next = layer[key] + (target - (bounds[start] + bounds[size] * fraction)) / (horizontal ? canvasWidth : canvasHeight) * 100
    if (next < -0.001 || next > 100.001) throw new Error('Alignment would place an object anchor outside the canvas. Move the reference object first.')
    return { id: layer.id, [key]: Math.max(0, Math.min(100, next)) }
  })
}

export const boxSelectedObjectIds = (layers, objects, box, { individual = false } = {}) => {
  const ids = new Set()
  for (const { layer, bounds } of objects) {
    if (layer.hidden || layer.isBaseImage) continue
    if (bounds.left < box.left || bounds.top < box.top
      || bounds.left + bounds.width > box.left + box.width
      || bounds.top + bounds.height > box.top + box.height) continue
    for (const id of pickObjectIds(layers, layer, individual)) ids.add(id)
  }
  return layers.filter((layer) => ids.has(layer.id)).map((layer) => layer.id)
}

export const distributionPatches = (objects, axis, mode, canvasWidth, canvasHeight) => {
  if (objects.length < 3) throw new Error('Select at least three visible, unlocked objects to distribute.')
  const horizontal = axis === 'horizontal'
  const start = horizontal ? 'left' : 'top'
  const size = horizontal ? 'width' : 'height'
  const key = horizontal ? 'x' : 'y'
  const dimension = horizontal ? canvasWidth : canvasHeight
  const sorted = [...objects].sort((a, b) => a.bounds[start] + a.bounds[size] / 2 - b.bounds[start] - b.bounds[size] / 2)
  const first = sorted[0]
  const last = sorted.at(-1)
  const gap = (last.bounds[start] + last.bounds[size] - first.bounds[start] - sorted.reduce((sum, object) => sum + object.bounds[size], 0)) / (sorted.length - 1)
  if (mode === 'gaps' && gap < -0.001) throw new Error('There is not enough space for non-overlapping equal gaps. Move the outer objects farther apart.')
  const firstCenter = first.bounds[start] + first.bounds[size] / 2
  const centerStep = (last.bounds[start] + last.bounds[size] / 2 - firstCenter) / (sorted.length - 1)
  let edge = first.bounds[start]
  return sorted.map(({ layer, bounds }, index) => {
    const target = mode === 'gaps' ? edge : firstCenter + centerStep * index - bounds[size] / 2
    edge += bounds[size] + gap
    const next = layer[key] + (target - bounds[start]) / dimension * 100
    if (next < -0.001 || next > 100.001) throw new Error('Distribution would place an object anchor outside the canvas. Move the outer objects first.')
    return { id: layer.id, [key]: index === 0 || index === sorted.length - 1 ? layer[key] : Math.max(0, Math.min(100, next)) }
  })
}
