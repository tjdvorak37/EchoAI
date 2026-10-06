const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
export const normalizeObjectRotation = (degrees) => ((degrees + 180) % 360 + 360) % 360 - 180

export const resizeObjectFromCorner = ({ layer, width, height, deltaX, deltaY, cornerX, cornerY, canvasWidth, canvasHeight, proportional }) => {
  const radians = (layer.rotation || 0) * Math.PI / 180
  const localX = deltaX * Math.cos(radians) + deltaY * Math.sin(radians)
  const localY = -deltaX * Math.sin(radians) + deltaY * Math.cos(radians)
  const nextWidth = width + 2 * cornerX * localX
  const nextHeight = height + 2 * cornerY * localY
  if (layer.type === 'image' || layer.type === 'sticker' || proportional) {
    let scale = (nextWidth * width + nextHeight * height) / (width * width + height * height)
    const min = layer.type === 'sticker' ? 16 / layer.fontSize
      : Math.max(canvasWidth * 0.02 / width, layer.type === 'image' ? 0 : canvasHeight * (layer.shape === 'line' ? 0.001 : 0.02) / height)
    const max = layer.type === 'sticker' ? 96 / layer.fontSize
      : Math.min(canvasWidth / width, layer.type === 'image' ? Infinity : canvasHeight / height)
    scale = clamp(scale, min, max)
    return layer.type === 'sticker' ? { fontSize: layer.fontSize * scale } : {
      width: width * scale / canvasWidth * 100,
      ...(layer.type === 'shape' ? { height: height * scale / canvasHeight * 100 } : {}),
    }
  }
  return {
    width: clamp(nextWidth / canvasWidth * 100, 2, 100),
    height: clamp(nextHeight / canvasHeight * 100, layer.shape === 'line' ? 0.1 : 2, 100),
  }
}

export const rotationFromPointer = ({ rotation, startAngle, angle, snap }) => {
  const degrees = rotation + normalizeObjectRotation((angle - startAngle) * 180 / Math.PI)
  return normalizeObjectRotation(snap ? Math.round(degrees / 15) * 15 : degrees)
}

export const objectAlignmentPatch = ({ layer, bounds, canvasBounds, alignment }) => {
  const horizontal = ['left', 'center', 'right'].includes(alignment)
  const start = horizontal ? 'left' : 'top'
  const size = horizontal ? 'width' : 'height'
  const fraction = ['left', 'top'].includes(alignment) ? 0 : ['right', 'bottom'].includes(alignment) ? 1 : 0.5
  const delta = canvasBounds[start] + canvasBounds[size] * fraction - (bounds[start] + bounds[size] * fraction)
  const key = horizontal ? 'x' : 'y'
  const position = layer[key] + delta / canvasBounds[size] * 100
  if (position < -0.001 || position > 100.001) throw new Error('This alignment would place the object anchor outside the canvas. Resize the object first.')
  return { [key]: clamp(position, 0, 100) }
}
