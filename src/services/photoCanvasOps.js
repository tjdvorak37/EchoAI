import { applyHueSaturation, isNeutralHueSat, maskEdges } from './photoPixelOps'

// Pixel work runs at this size; exports scale from it. 2048px keeps Select Subject fast on 12MP photos.
export const WORK_MAX = 2048

export const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be loaded.'))
    image.src = src
  })

const makeCanvas = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export const loadWorkImage = async (src, maxSide = WORK_MAX) => {
  const image = await loadImageElement(src)
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, width, height)
  return { src, width, height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, imageData: ctx.getImageData(0, 0, width, height) }
}

export const cloneImageData = (imageData) => new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)

export const imageDataToDataUrl = (imageData, type = 'image/png') => {
  const canvas = makeCanvas(imageData.width, imageData.height)
  canvas.getContext('2d').putImageData(imageData, 0, 0)
  return canvas.toDataURL(type)
}

export const maskToCanvas = (mask, width, height, rgb = [255, 255, 255]) => {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const index = pixel * 4
    image.data[index] = rgb[0]
    image.data[index + 1] = rgb[1]
    image.data[index + 2] = rgb[2]
    image.data[index + 3] = mask[pixel]
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export const maskToDataUrl = (mask, width, height) => maskToCanvas(mask, width, height).toDataURL('image/png')

export const dataUrlToMask = async (src, width, height) => {
  const image = await loadImageElement(src)
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  const mask = new Uint8Array(width * height)
  for (let pixel = 0; pixel < mask.length; pixel += 1) mask[pixel] = data[pixel * 4 + 3]
  return mask
}

// Original pixels -> Hue/Saturation -> layer mask. Returns a canvas at work resolution.
export const renderProcessedBase = async ({ work, hueSat, layerMask }) => {
  const canvas = makeCanvas(work.width, work.height)
  const ctx = canvas.getContext('2d')
  const pixels = cloneImageData(work.imageData)
  if (!isNeutralHueSat(hueSat)) applyHueSaturation(pixels, hueSat)
  ctx.putImageData(pixels, 0, 0)
  if (layerMask?.src && layerMask.enabled !== false) {
    const maskImage = await loadImageElement(layerMask.src)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(maskImage, 0, 0, work.width, work.height)
    ctx.globalCompositeOperation = 'source-over'
  }
  return canvas
}

export const canvasToObjectUrl = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Could not encode the image.'))), 'image/png')
  })

// Tint for the selected area plus a separate edge image so only the "marching ants" animate.
export const selectionOverlayUrls = (mask, width, height) => {
  const tint = maskToCanvas(mask, width, height, [59, 130, 246])
  const tintCtx = tint.getContext('2d')
  tintCtx.globalCompositeOperation = 'destination-in'
  tintCtx.fillStyle = 'rgba(0,0,0,0.22)'
  tintCtx.fillRect(0, 0, width, height)

  const edges = maskEdges(mask, width, height)
  const edgeCanvas = makeCanvas(width, height)
  const edgeCtx = edgeCanvas.getContext('2d')
  const image = edgeCtx.createImageData(width, height)
  for (let pixel = 0; pixel < edges.length; pixel += 1) {
    if (!edges[pixel]) continue
    const x = pixel % width
    const y = (pixel - x) / width
    const value = ((x + y) >> 2) & 1 ? 255 : 0
    const index = pixel * 4
    image.data[index] = value
    image.data[index + 1] = value
    image.data[index + 2] = value
    image.data[index + 3] = 255
  }
  edgeCtx.putImageData(image, 0, 0)
  return { tintUrl: tint.toDataURL('image/png'), edgeUrl: edgeCanvas.toDataURL('image/png') }
}

// Where an image of (w, h) sits inside a box when shown with object-fit: contain.
export const fitContain = (imageWidth, imageHeight, boxWidth, boxHeight) => {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height }
}

// Destructive whole-image transforms (rotate, flip) return a new PNG data URL.
export const transformImageSrc = async (src, kind) => {
  const image = await loadImageElement(src)
  const rotate = kind === 'rotate-cw' || kind === 'rotate-ccw'
  const canvas = makeCanvas(rotate ? image.naturalHeight : image.naturalWidth, rotate ? image.naturalWidth : image.naturalHeight)
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  if (kind === 'rotate-cw') ctx.rotate(Math.PI / 2)
  if (kind === 'rotate-ccw') ctx.rotate(-Math.PI / 2)
  if (kind === 'flip-h') ctx.scale(-1, 1)
  if (kind === 'flip-v') ctx.scale(1, -1)
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  return canvas.toDataURL('image/png')
}
