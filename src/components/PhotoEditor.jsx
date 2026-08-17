import { useEffect, useMemo, useRef, useState } from 'react'
import './PhotoEditor.css'
import { generatePhotoConcept } from '../services/photoAiService'

const ASPECT_RATIOS = {
  '1:1': { label: 'Square', canvasWidth: 1200, canvasHeight: 1200, css: '1 / 1' },
  '4:5': { label: 'Feed', canvasWidth: 1200, canvasHeight: 1500, css: '4 / 5' },
  '16:9': { label: 'Landscape', canvasWidth: 1600, canvasHeight: 900, css: '16 / 9' },
  '9:16': { label: 'Story', canvasWidth: 1080, canvasHeight: 1920, css: '9 / 16' },
}

const STYLE_PRESETS = {
  aurora: {
    label: 'Aurora',
    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.38), rgba(168, 85, 247, 0.28) 52%, rgba(250, 204, 21, 0.16))',
    base: '#081120',
    accent: '#67e8f9',
    secondary: '#f9a8d4',
    headline: 'Neon glow for social-first campaigns',
    subcopy: 'Use this preset for launches, music drops, and anything that needs a luminous punch.',
  },
  editorial: {
    label: 'Editorial',
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.42), rgba(71, 85, 105, 0.3) 55%, rgba(148, 163, 184, 0.14))',
    base: '#0f172a',
    accent: '#f8fafc',
    secondary: '#cbd5e1',
    headline: 'High-contrast story cover',
    subcopy: 'Best for portraits, product teasers, and clean launch art that feels premium.',
  },
  sunset: {
    label: 'Sunset',
    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.35), rgba(236, 72, 153, 0.28) 50%, rgba(59, 130, 246, 0.18))',
    base: '#1f130f',
    accent: '#fde68a',
    secondary: '#fecdd3',
    headline: 'Warm, cinematic, and scroll-stopping',
    subcopy: 'Use for lifestyle, travel, food, and anything that benefits from a softer tone.',
  },
  chrome: {
    label: 'Chrome',
    background: 'linear-gradient(135deg, rgba(226, 232, 240, 0.28), rgba(148, 163, 184, 0.18) 45%, rgba(15, 23, 42, 0.18))',
    base: '#0b1220',
    accent: '#f8fafc',
    secondary: '#94a3b8',
    headline: 'Sharp, cool, and metallic',
    subcopy: 'A strong fit for tech, architecture, fashion, and polished brand moments.',
  },
}

const STICKERS = ['✨', '⚡', '📸', '🔥', '💎', '🌙', '🪩']
const TEXT_EFFECTS = {
  none: 'None',
  shadow: 'Shadow',
  outline: 'Outline',
  panel: 'Panel',
  glow: 'Glow',
  gradient: 'Gradient',
}

const MASK_SHAPES = {
  none: 'None',
  rounded: 'Rounded',
  circle: 'Circle',
  frame: 'Frame',
  diagonal: 'Diagonal',
}

const TOOLS = {
  select: 'Select',
  heal: 'Heal',
  brush: 'Brush',
  eraser: 'Eraser',
  remove: 'Remove area',
  crop: 'Crop',
}

const SHAPES = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  triangle: 'Triangle',
}

const EXPORT_FORMATS = {
  png: { label: 'PNG', mime: 'image/png', extension: 'png', lossy: false },
  jpeg: { label: 'JPEG', mime: 'image/jpeg', extension: 'jpg', lossy: true },
  webp: { label: 'WebP', mime: 'image/webp', extension: 'webp', lossy: true },
}

const DEFAULT_FILTERS = {
  brightness: 108,
  contrast: 116,
  saturation: 118,
  exposure: 100,
  blur: 0,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
  vignette: 38,
  grain: 18,
}

// Preview and export must agree, so both read this one string.
const buildFilterString = (filters) =>
  [
    `brightness(${filters.brightness}%)`,
    `brightness(${filters.exposure ?? 100}%)`,
    `contrast(${filters.contrast}%)`,
    `saturate(${filters.saturation}%)`,
    `hue-rotate(${filters.hue}deg)`,
    `sepia(${filters.sepia ?? 0}%)`,
    `grayscale(${filters.grayscale ?? 0}%)`,
    `invert(${filters.invert ?? 0}%)`,
    `blur(${filters.blur}px)`,
  ].join(' ')

const DEFAULT_PROMPT = 'Create a bold product teaser for an evening launch post.'

const defaultLayers = () => [
  {
    id: 'headline',
    type: 'text',
    label: 'Headline',
    value: 'Launch the next drop',
    x: 16,
    y: 15,
    fontSize: 56,
    weight: 800,
    color: '#f8fafc',
    align: 'left',
    effect: 'shadow',
    outlineWidth: 2,
    outlineColor: '#020617',
    shadowBlur: 24,
    shadowColor: 'rgba(2, 6, 23, 0.72)',
    shadowOffsetX: 0,
    shadowOffsetY: 8,
    panelColor: 'rgba(2, 6, 23, 0.15)',
    panelRadius: 22,
    letterSpacing: 0.5,
  },
  {
    id: 'subcopy',
    type: 'text',
    label: 'Subcopy',
    value: 'Edit, stylize, and export campaign art without leaving EchoAI.',
    x: 16,
    y: 28,
    fontSize: 22,
    weight: 500,
    color: '#e2e8f0',
    align: 'left',
    effect: 'panel',
    outlineWidth: 0,
    outlineColor: '#020617',
    shadowBlur: 12,
    shadowColor: 'rgba(2, 6, 23, 0.55)',
    shadowOffsetX: 0,
    shadowOffsetY: 6,
    panelColor: 'rgba(15, 23, 42, 0.42)',
    panelRadius: 18,
    letterSpacing: 0.1,
  },
  {
    id: 'sticker',
    type: 'sticker',
    label: 'Accent',
    value: '✨',
    x: 78,
    y: 14,
    fontSize: 52,
    weight: 700,
    color: '#67e8f9',
    align: 'center',
    effect: 'glow',
    outlineWidth: 0,
    outlineColor: '#020617',
    shadowBlur: 26,
    shadowColor: 'rgba(103, 232, 249, 0.65)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    panelColor: 'transparent',
    panelRadius: 999,
    letterSpacing: 0,
  },
]

const projectLayers = (project) => defaultLayers().map((layer) => {
  if (!project) return layer
  if (layer.id === 'headline') return { ...layer, value: project.headline || layer.value }
  if (layer.id === 'subcopy') return { ...layer, value: project.caption || layer.value }
  return layer
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'echoai-photo'

const classifyPrompt = (prompt) => {
  const value = prompt.toLowerCase()

  if (/(portrait|editorial|fashion|luxury|premium|chrome)/.test(value)) {
    return {
      preset: 'chrome',
      headline: 'Premium portrait with a polished edge',
      subcopy: 'Use crisp contrast, cool lighting, and minimal copy to keep the focus on the subject.',
      sticker: '💎',
    }
  }

  if (/(sunset|warm|lifestyle|travel|food|golden)/.test(value)) {
    return {
      preset: 'sunset',
      headline: 'Warm story art with a cinematic glow',
      subcopy: 'Layer soft color, bold typography, and a sunset palette for a relaxed social post.',
      sticker: '🌙',
    }
  }

  if (/(launch|product|drop|hype|music|neon|night)/.test(value)) {
    return {
      preset: 'aurora',
      headline: 'Neon launch concept built to stop the scroll',
      subcopy: 'Use bright accents, punchy type, and motion-heavy contrast for high-energy campaigns.',
      sticker: '⚡',
    }
  }

  return {
    preset: 'editorial',
    headline: 'Clean editorial frame with strong hierarchy',
    subcopy: 'Works well for hero images, announcements, and reusable social cover templates.',
    sticker: '✨',
  }
}

const wrapText = (ctx, text, maxWidth) => {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']

  const lines = []
  let current = words[0]

  for (const word of words.slice(1)) {
    const next = `${current} ${word}`
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }

  lines.push(current)
  return lines
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load the selected image.'))
    image.src = src
  })

const normalizeColorInputValue = (value, fallback = '#020617') => {
  if (!value || typeof value !== 'string') {
    return fallback
  }

  if (value.startsWith('#')) {
    return value.slice(0, 7)
  }

  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) {
    return fallback
  }

  const [, red, green, blue] = match
  return `#${[red, green, blue]
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

const drawStroke = (ctx, stroke, width, height) => {
  if (!stroke?.points?.length) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // The eraser clears previously painted pixels rather than painting over them.
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.size
  ctx.globalAlpha = stroke.opacity
  ctx.beginPath()

  stroke.points.forEach((point, index) => {
    const mapped = {
      x: (point.x / 100) * width,
      y: (point.y / 100) * height,
    }
    if (index === 0) {
      ctx.moveTo(mapped.x, mapped.y)
    } else {
      ctx.lineTo(mapped.x, mapped.y)
    }
  })

  ctx.stroke()
  ctx.restore()
}

// Strokes composite on their own surface first, so an eraser stroke only removes
// paint instead of cutting a hole through the photo underneath.
const renderStrokeLayer = (strokes, width, height) => {
  const layerCanvas = document.createElement('canvas')
  layerCanvas.width = width
  layerCanvas.height = height
  const layerCtx = layerCanvas.getContext('2d')
  if (!layerCtx) return null

  strokes.forEach((stroke) => drawStroke(layerCtx, stroke, width, height))
  return layerCanvas
}

const healImage = async ({ imageSrc, points, brushSize, stageMetrics }) => {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image healing is unavailable in this browser.')

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const softened = document.createElement('canvas')
  softened.width = canvas.width
  softened.height = canvas.height
  const softenedCtx = softened.getContext('2d')
  if (!softenedCtx) throw new Error('Image healing is unavailable in this browser.')

  const imageRatio = canvas.width / canvas.height
  const stageRatio = stageMetrics.width / stageMetrics.height
  let drawWidth = stageMetrics.width
  let drawHeight = stageMetrics.height
  let offsetX = 0
  let offsetY = 0
  if (imageRatio > stageRatio) {
    drawWidth = imageRatio * drawHeight
    offsetX = (stageMetrics.width - drawWidth) / 2
  } else {
    drawHeight = drawWidth / imageRatio
    offsetY = (stageMetrics.height - drawHeight) / 2
  }

  const sourceScale = canvas.width / drawWidth
  const radius = Math.max(4, brushSize * sourceScale * 0.5)
  softenedCtx.filter = `blur(${Math.max(3, radius * 0.42)}px)`
  softenedCtx.drawImage(canvas, 0, 0)

  ctx.save()
  ctx.beginPath()
  points.forEach((point) => {
    const stageX = (point.x / 100) * stageMetrics.width
    const stageY = (point.y / 100) * stageMetrics.height
    const imageX = ((stageX - offsetX) / drawWidth) * canvas.width
    const imageY = ((stageY - offsetY) / drawHeight) * canvas.height
    ctx.moveTo(imageX + radius, imageY)
    ctx.arc(imageX, imageY, radius, 0, Math.PI * 2)
  })
  ctx.clip()
  ctx.drawImage(softened, 0, 0)
  ctx.restore()

  return canvas.toDataURL('image/png')
}

const removeImageArea = async ({ imageSrc, rect, stageMetrics }) => {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Area removal is unavailable in this browser.')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const imageRatio = canvas.width / canvas.height
  const stageRatio = stageMetrics.width / stageMetrics.height
  let drawWidth = stageMetrics.width
  let drawHeight = stageMetrics.height
  let offsetX = 0
  let offsetY = 0
  if (imageRatio > stageRatio) {
    drawWidth = imageRatio * drawHeight
    offsetX = (stageMetrics.width - drawWidth) / 2
  } else {
    drawHeight = drawWidth / imageRatio
    offsetY = (stageMetrics.height - drawHeight) / 2
  }
  const x = ((rect.x / 100) * stageMetrics.width - offsetX) / drawWidth * canvas.width
  const y = ((rect.y / 100) * stageMetrics.height - offsetY) / drawHeight * canvas.height
  const width = (rect.w / 100) * stageMetrics.width / drawWidth * canvas.width
  const height = (rect.h / 100) * stageMetrics.height / drawHeight * canvas.height
  const sample = document.createElement('canvas')
  sample.width = canvas.width
  sample.height = canvas.height
  const sampleCtx = sample.getContext('2d')
  if (!sampleCtx) throw new Error('Area removal is unavailable in this browser.')
  sampleCtx.filter = `blur(${Math.max(8, Math.min(width, height) * 0.08)}px)`
  sampleCtx.drawImage(canvas, 0, 0)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.drawImage(sample, 0, 0)
  ctx.restore()
  return canvas.toDataURL('image/png')
}

const drawShapeLayer = (ctx, layer, width, height) => {
  const w = (layer.width / 100) * width
  const h = (layer.height / 100) * height
  const x = (layer.x / 100) * width
  const y = (layer.y / 100) * height

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(((layer.rotation || 0) * Math.PI) / 180)
  ctx.globalAlpha = (layer.opacity ?? 100) / 100
  ctx.fillStyle = layer.color
  ctx.strokeStyle = layer.strokeColor || layer.color
  ctx.lineWidth = layer.strokeWidth || 0
  ctx.lineCap = 'round'

  ctx.beginPath()
  if (layer.shape === 'ellipse') {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else if (layer.shape === 'line') {
    ctx.moveTo(-w / 2, 0)
    ctx.lineTo(w / 2, 0)
  } else if (layer.shape === 'triangle') {
    ctx.moveTo(0, -h / 2)
    ctx.lineTo(w / 2, h / 2)
    ctx.lineTo(-w / 2, h / 2)
    ctx.closePath()
  } else {
    ctx.roundRect(-w / 2, -h / 2, w, h, layer.radius || 0)
  }

  if (layer.shape === 'line') {
    ctx.lineWidth = Math.max(2, h)
    ctx.stroke()
  } else {
    if (layer.filled !== false) ctx.fill()
    if (layer.strokeWidth > 0) ctx.stroke()
  }

  ctx.restore()
}

const buildMaskPath = (ctx, maskShape, width, height) => {
  ctx.beginPath()

  if (maskShape === 'circle') {
    ctx.ellipse(width / 2, height / 2, width * 0.44, height * 0.44, 0, 0, Math.PI * 2)
    return
  }

  if (maskShape === 'frame') {
    ctx.roundRect(width * 0.06, height * 0.06, width * 0.88, height * 0.88, 36)
    return
  }

  if (maskShape === 'diagonal') {
    ctx.moveTo(width * 0.08, height * 0.16)
    ctx.lineTo(width * 0.92, height * 0.06)
    ctx.lineTo(width * 0.84, height * 0.84)
    ctx.lineTo(width * 0.12, height * 0.94)
    ctx.closePath()
    return
  }

  ctx.roundRect(0, 0, width, height, 28)
}

const drawTextLayer = (ctx, layer, x, y, maxWidth) => {
  const fontStack = layer.fontFamily
    ? `"${layer.fontFamily}", Inter, system-ui, sans-serif`
    : 'Inter, system-ui, sans-serif'
  ctx.font = `${layer.weight} ${layer.fontSize}px ${fontStack}`
  const lines = wrapText(ctx, layer.value, maxWidth)
  const lineHeight = layer.fontSize * 1.14
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 0)
  const totalHeight = lines.length * lineHeight

  if (layer.effect === 'panel') {
    const paddingX = 18
    const paddingY = 12
    const panelWidth = Math.min(maxWidth + paddingX * 2, Math.max(textWidth + paddingX * 2, 120))
    const panelHeight = totalHeight + paddingY * 2
    ctx.save()
    ctx.fillStyle = layer.panelColor || 'rgba(15, 23, 42, 0.35)'
    ctx.beginPath()
    ctx.roundRect(x - paddingX, y - paddingY, panelWidth, panelHeight, layer.panelRadius || 16)
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.font = `${layer.weight} ${layer.fontSize}px ${fontStack}`
  ctx.textAlign = layer.align || 'left'
  ctx.textBaseline = 'top'
  ctx.direction = 'ltr'
  ctx.letterSpacing = `${layer.letterSpacing || 0}px`

  if (layer.effect === 'glow') {
    ctx.shadowColor = layer.shadowColor || layer.color
    ctx.shadowBlur = layer.shadowBlur || 18
  } else if (layer.effect === 'shadow' || layer.effect === 'panel') {
    ctx.shadowColor = layer.shadowColor || 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = layer.shadowBlur || 18
    ctx.shadowOffsetX = layer.shadowOffsetX || 0
    ctx.shadowOffsetY = layer.shadowOffsetY || 4
  }

  if (layer.effect === 'gradient') {
    const gradient = ctx.createLinearGradient(x, y, x + maxWidth, y + layer.fontSize)
    gradient.addColorStop(0, layer.color)
    gradient.addColorStop(1, '#f8fafc')
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = layer.color
  }

  if (layer.effect === 'outline' && layer.outlineWidth > 0) {
    ctx.lineWidth = layer.outlineWidth
    ctx.strokeStyle = layer.outlineColor || '#000000'
    lines.forEach((line, index) => {
      ctx.strokeText(line, x, y + index * lineHeight)
    })
  }

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight)
  })

  ctx.restore()
}

const renderComposition = async ({
  canvas,
  imageSrc,
  maskShape,
  filters,
  preset,
  backgroundColor,
  layers,
  brushStrokes,
  stageMetrics,
}) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas export is unavailable in this browser.')
  }

  const width = canvas.width
  const height = canvas.height

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = backgroundColor || preset.base
  ctx.fillRect(0, 0, width, height)

  if (imageSrc) {
    try {
      const image = await loadImage(imageSrc)
      const stageImageWidth = stageMetrics.width
      const stageImageHeight = stageMetrics.height
      const imageRatio = image.width / image.height
      const stageRatio = stageImageWidth / stageImageHeight
      let drawWidth = stageImageWidth
      let drawHeight = stageImageHeight
      let offsetX = 0
      let offsetY = 0

      if (imageRatio > stageRatio) {
        drawHeight = stageImageHeight
        drawWidth = imageRatio * drawHeight
        offsetX = (stageImageWidth - drawWidth) / 2
      } else {
        drawWidth = stageImageWidth
        drawHeight = drawWidth / imageRatio
        offsetY = (stageImageHeight - drawHeight) / 2
      }

      ctx.save()
      if (maskShape !== 'none') {
        buildMaskPath(ctx, maskShape, width, height)
        ctx.clip()
      }

      ctx.filter = buildFilterString(filters)
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
      ctx.restore()
    } catch {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(width * 0.12, height * 0.12, width * 0.76, height * 0.72)
    }
  }

  if (brushStrokes.length) {
    const strokeLayer = renderStrokeLayer(brushStrokes, width, height)
    if (strokeLayer) {
      ctx.drawImage(strokeLayer, 0, 0)
    }
  }

  if (imageSrc || layers.length || brushStrokes.length) {
    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.18, width / 2, height / 2, width * 0.72)
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vignette.addColorStop(1, 'rgba(2, 6, 23, 0.55)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, width, height)
  }

  if ((imageSrc || layers.length || brushStrokes.length) && filters.grain > 0) {
    const dotCount = Math.round((width * height * filters.grain) / 110000)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    for (let index = 0; index < dotCount; index += 1) {
      ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1)
    }
  }

  // Logo layers need decoding before the synchronous draw pass below.
  const logoImages = new Map()
  await Promise.all(
    layers
      .filter((layer) => layer.type === 'image' && layer.src && !layer.hidden)
      .map(async (layer) => {
        try {
          logoImages.set(layer.id, await loadImage(layer.src))
        } catch {
          // A logo that will not decode is skipped rather than failing the export.
        }
      }),
  )

  layers.forEach((layer) => {
    if (layer.hidden) return

    const x = (layer.x / 100) * width
    const y = (layer.y / 100) * height

    if (layer.type === 'image') {
      const image = logoImages.get(layer.id)
      if (!image) return

      const drawWidth = (layer.width / 100) * width
      const drawHeight = drawWidth * (image.height / image.width)

      ctx.save()
      ctx.globalAlpha = (layer.opacity ?? 100) / 100
      ctx.translate(x, y)
      ctx.rotate(((layer.rotation || 0) * Math.PI) / 180)
      ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
      ctx.restore()
      return
    }

    if (layer.type === 'shape') {
      drawShapeLayer(ctx, layer, width, height)
      return
    }

    if (layer.type === 'sticker') {
      ctx.save()
      ctx.globalAlpha = (layer.opacity ?? 100) / 100
      ctx.translate(x, y)
      ctx.rotate(((layer.rotation || 0) * Math.PI) / 180)
      ctx.font = `${layer.fontSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = layer.shadowColor || 'rgba(0, 0, 0, 0.45)'
      ctx.shadowBlur = layer.shadowBlur || 24
      ctx.fillText(layer.value, 0, 0)
      ctx.restore()
      return
    }

    ctx.save()
    ctx.globalAlpha = (layer.opacity ?? 100) / 100
    if (layer.rotation) {
      ctx.translate(x, y)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.translate(-x, -y)
    }
    drawTextLayer(ctx, layer, x, y, width * 0.48)
    ctx.restore()
  })

  return canvas.toDataURL('image/png')
}

export function PhotoEditor({ assets, onExport, agentConfig, brandKit, initialProject }) {
  const imageAssets = useMemo(() => assets.filter((asset) => asset.type === 'image'), [assets])
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [uploadedImage, setUploadedImage] = useState('')
  const [generatedImageSrc, setGeneratedImageSrc] = useState(initialProject?.imageSrc || '')
  const [generatedImageMeta, setGeneratedImageMeta] = useState(initialProject ? { source: initialProject.imageSource || initialProject.source, palette: 'editorial' } : null)
  const [aiImagePrompt, setAiImagePrompt] = useState(initialProject?.visualPrompt || DEFAULT_PROMPT)
  const [aiImageStyle, setAiImageStyle] = useState('aurora')
  const [aiImageLoading, setAiImageLoading] = useState(false)
  const [aiImageError, setAiImageError] = useState('')
  const [prompt, setPrompt] = useState(initialProject?.visualPrompt || DEFAULT_PROMPT)
  const [presetId, setPresetId] = useState('aurora')
  const [aspectRatio, setAspectRatio] = useState(initialProject?.outputType === 'image' ? '1:1' : '4:5')
  const [headline, setHeadline] = useState(initialProject?.headline || '')
  const [subcopy, setSubcopy] = useState(initialProject?.caption || '')
  const [activeTool, setActiveTool] = useState('select')
  const [maskShape, setMaskShape] = useState('none')
  const [brushColor, setBrushColor] = useState('#ffffff')
  const [brushSize, setBrushSize] = useState(24)
  const [brushOpacity, setBrushOpacity] = useState(0.8)
  const [brushStrokes, setBrushStrokes] = useState([])
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 100, h: 100 })
  const [removeRect, setRemoveRect] = useState(null)
  const [canvasBackground, setCanvasBackground] = useState(initialProject ? '#0f172a' : '#ffffff')
  const [stageMetrics, setStageMetrics] = useState({ width: 1000, height: 1250 })
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [exportFormat, setExportFormat] = useState('png')
  const [exportQuality, setExportQuality] = useState(92)
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 })
  const [layers, setLayers] = useState(() => (initialProject ? projectLayers(initialProject) : []))
  const [activeLayerId, setActiveLayerId] = useState(initialProject ? 'headline' : '')
  const [notice, setNotice] = useState(initialProject ? 'Generated project loaded. Every layer remains editable.' : 'Blank workspace ready for upload.')
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const [canvasZoom, setCanvasZoom] = useState(100)
  const stageRef = useRef(null)
  const stageViewportRef = useRef(null)
  const paintCanvasRef = useRef(null)
  const dragRef = useRef(null)
  const cropDragRef = useRef(null)
  const removeDragRef = useRef(null)
  const brushStrokeRef = useRef(null)
  const layerIdRef = useRef(0)
  const [stageViewportSize, setStageViewportSize] = useState({ width: 900, height: 720 })

  const selectedAsset = imageAssets.find((asset) => asset.id === selectedAssetId) ?? null
  const selectedImageSrc = generatedImageSrc || uploadedImage || selectedAsset?.previewUrl || ''
  const preset = STYLE_PRESETS[presetId] ?? STYLE_PRESETS.aurora
  const aspect = ASPECT_RATIOS[aspectRatio] ?? ASPECT_RATIOS['4:5']
  const resolvedActiveLayerId = layers.some((layer) => layer.id === activeLayerId)
    ? activeLayerId
    : (layers[0]?.id ?? '')
  const activeTextLayer = layers.find((layer) => layer.id === resolvedActiveLayerId && layer.type === 'text') ?? null
  const stageClipPath =
    maskShape === 'circle'
      ? 'circle(44% at 50% 50%)'
      : maskShape === 'frame'
        ? 'inset(6% round 30px)'
        : maskShape === 'diagonal'
          ? 'polygon(8% 16%, 92% 6%, 84% 84%, 12% 94%)'
          : maskShape === 'rounded'
            ? 'inset(0 round 28px)'
            : 'none'

  const stageDisplaySize = useMemo(() => {
    const ratio = aspect.canvasWidth / aspect.canvasHeight
    const availableWidth = Math.max(240, stageViewportSize.width - (compactMode ? 20 : 36))
    const availableHeight = Math.max(220, stageViewportSize.height - (compactMode ? 20 : 36))

    let width = availableWidth
    let height = width / ratio

    if (height > availableHeight) {
      height = availableHeight
      width = height * ratio
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    }
  }, [aspect, compactMode, stageViewportSize])

  const updateLayer = (layerId, patch) => {
    setLayers((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)))
  }

  // --- History -------------------------------------------------------------
  // Snapshots everything a user can undo. Sliders call commitHistory on
  // pointerdown so one drag produces one undo step, not one per pixel.
  const historyRef = useRef({ past: [], future: [] })

  const buildSnapshot = () => ({
    layers,
    filters,
    brushStrokes,
    maskShape,
    cropRect,
    presetId,
    aspectRatio,
    generatedImageSrc,
    uploadedImage,
    selectedAssetId,
    canvasBackground,
  })

  const applySnapshot = (snapshot) => {
    setLayers(snapshot.layers)
    setFilters(snapshot.filters)
    setBrushStrokes(snapshot.brushStrokes)
    setMaskShape(snapshot.maskShape)
    setCropRect(snapshot.cropRect)
    setPresetId(snapshot.presetId)
    setAspectRatio(snapshot.aspectRatio)
    setGeneratedImageSrc(snapshot.generatedImageSrc)
    setUploadedImage(snapshot.uploadedImage)
    setSelectedAssetId(snapshot.selectedAssetId)
    setCanvasBackground(snapshot.canvasBackground || '#ffffff')
  }

  const syncHistoryCounts = () => {
    setHistoryCounts({
      past: historyRef.current.past.length,
      future: historyRef.current.future.length,
    })
  }

  const commitHistory = () => {
    historyRef.current.past.push(buildSnapshot())
    if (historyRef.current.past.length > 60) {
      historyRef.current.past.shift()
    }
    historyRef.current.future = []
    syncHistoryCounts()
  }

  const undo = () => {
    const previous = historyRef.current.past.pop()
    if (!previous) return
    historyRef.current.future.push(buildSnapshot())
    applySnapshot(previous)
    syncHistoryCounts()
    setNotice('Undid the last change.')
  }

  const redo = () => {
    const next = historyRef.current.future.pop()
    if (!next) return
    historyRef.current.past.push(buildSnapshot())
    applySnapshot(next)
    syncHistoryCounts()
    setNotice('Redid the last change.')
  }

  // --- Layer operations ----------------------------------------------------
  const nextLayerId = (kind) => {
    layerIdRef.current += 1
    return `${kind}-${layerIdRef.current}`
  }

  const addLayer = (layer) => {
    commitHistory()
    setLayers((prev) => [...prev, layer])
    setActiveLayerId(layer.id)
  }

  const addTextLayer = () => {
    addLayer({
      id: nextLayerId('text'),
      type: 'text',
      label: 'Text',
      value: 'New text layer',
      x: 20,
      y: 50,
      fontSize: 34,
      weight: 700,
      color: '#f8fafc',
      align: 'left',
      effect: 'shadow',
      outlineWidth: 0,
      outlineColor: '#020617',
      shadowBlur: 18,
      shadowColor: 'rgba(2, 6, 23, 0.6)',
      shadowOffsetX: 0,
      shadowOffsetY: 6,
      panelColor: 'rgba(15, 23, 42, 0.42)',
      panelRadius: 18,
      letterSpacing: 0,
      opacity: 100,
      rotation: 0,
    })
    setNotice('Added a text layer.')
  }

  const addShapeLayer = (shape) => {
    addLayer({
      id: nextLayerId('shape'),
      type: 'shape',
      label: SHAPES[shape] ?? 'Shape',
      shape,
      value: SHAPES[shape] ?? 'Shape',
      x: 50,
      y: 50,
      width: 30,
      height: shape === 'line' ? 1 : 20,
      color: preset.accent,
      strokeColor: preset.secondary,
      strokeWidth: 0,
      radius: shape === 'rectangle' ? 18 : 0,
      filled: true,
      opacity: 90,
      rotation: 0,
    })
    setNotice(`Added a ${SHAPES[shape] ?? 'shape'} layer.`)
  }

  const duplicateLayer = (layerId) => {
    const source = layers.find((layer) => layer.id === layerId)
    if (!source) return
    const copy = {
      ...source,
      id: nextLayerId(source.type),
      label: `${source.label} copy`,
      x: clamp(source.x + 4, 0, 100),
      y: clamp(source.y + 4, 0, 100),
    }
    commitHistory()
    setLayers((prev) => [...prev, copy])
    setActiveLayerId(copy.id)
    setNotice('Duplicated the layer.')
  }

  const deleteLayer = (layerId) => {
    if (layers.length <= 1) {
      setNotice('Keep at least one layer on the canvas.')
      return
    }
    commitHistory()
    setLayers((prev) => prev.filter((layer) => layer.id !== layerId))
    setNotice('Deleted the layer.')
  }

  const moveLayerOrder = (layerId, direction) => {
    const index = layers.findIndex((layer) => layer.id === layerId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= layers.length) return

    commitHistory()
    setLayers((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const toggleLayerVisibility = (layerId) => {
    commitHistory()
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, hidden: !layer.hidden } : layer)),
    )
  }

  const resetFilters = () => {
    commitHistory()
    setFilters(DEFAULT_FILTERS)
    setNotice('Adjustments reset.')
  }

  useEffect(() => {
    if (!stageRef.current) return undefined

    const updateMetrics = () => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      setStageMetrics((prev) => {
        const next = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
        if (prev.width === next.width && prev.height === next.height) {
          return prev
        }
        return next
      })
    }

    updateMetrics()
    const observer = new ResizeObserver(updateMetrics)
    observer.observe(stageRef.current)
    window.addEventListener('resize', updateMetrics)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateMetrics)
    }
  }, [])

  useEffect(() => {
    if (!stageViewportRef.current) return undefined

    const updateViewport = () => {
      const rect = stageViewportRef.current?.getBoundingClientRect()
      if (!rect) return

      setStageViewportSize((prev) => {
        const next = {
          width: Math.max(260, Math.round(rect.width)),
          height: Math.max(260, Math.round(rect.height)),
        }

        if (prev.width === next.width && prev.height === next.height) {
          return prev
        }

        return next
      })
    }

    updateViewport()
    const observer = new ResizeObserver(updateViewport)
    observer.observe(stageViewportRef.current)
    window.addEventListener('resize', updateViewport)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  useEffect(() => {
    const canvas = paintCanvasRef.current
    if (!canvas) return

    canvas.width = stageMetrics.width
    canvas.height = stageMetrics.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    brushStrokes.forEach((stroke) => drawStroke(ctx, stroke, canvas.width, canvas.height))
  }, [brushStrokes, cropRect, stageMetrics])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
          return
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && resolvedActiveLayerId) {
        event.preventDefault()
        duplicateLayer(resolvedActiveLayerId)
        return
      }

      if ((event.key !== 'Delete' && event.key !== 'Backspace') || !resolvedActiveLayerId) {
        return
      }

      event.preventDefault()
      deleteLayer(resolvedActiveLayerId)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })

  const getStagePoint = (event) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }

    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    }
  }

  const beginDrag = (layer, event) => {
    if (activeTool !== 'select') return
    if (!stageRef.current) return
    event.preventDefault()
    const stageRect = stageRef.current.getBoundingClientRect()
    const currentX = (layer.x / 100) * stageRect.width
    const currentY = (layer.y / 100) * stageRect.height

    dragRef.current = {
      layerId: layer.id,
      offsetX: event.clientX - stageRect.left - currentX,
      offsetY: event.clientY - stageRect.top - currentY,
    }

    const handleMove = (moveEvent) => {
      if (!dragRef.current || !stageRef.current) return
      const rect = stageRef.current.getBoundingClientRect()
      const nextX = ((moveEvent.clientX - rect.left - dragRef.current.offsetX) / rect.width) * 100
      const nextY = ((moveEvent.clientY - rect.top - dragRef.current.offsetY) / rect.height) * 100
      setLayers((prev) =>
        prev.map((item) =>
          item.id === dragRef.current.layerId
            ? { ...item, x: clamp(nextX, 4, 92), y: clamp(nextY, 6, 88) }
            : item,
        ),
      )
    }

    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  const startBrushStroke = (event) => {
    const painting = activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'heal'
    if (!painting || !paintCanvasRef.current || !stageRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const erase = activeTool === 'eraser'
    const healing = activeTool === 'heal'
    const point = getStagePoint(event)
    const stroke = {
      id: `stroke-${Date.now()}`,
      erase,
      healing,
      color: brushColor,
      size: brushSize,
      opacity: brushOpacity,
      points: [point],
    }

    brushStrokeRef.current = stroke

    const canvas = paintCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = brushColor
    ctx.lineWidth = brushSize
    ctx.globalAlpha = brushOpacity
    ctx.beginPath()
    const mapped = {
      x: (point.x / 100) * canvas.width,
      y: (point.y / 100) * canvas.height,
    }
    ctx.moveTo(mapped.x, mapped.y)
    ctx.restore()

    const moveStroke = (moveEvent) => {
      if (!brushStrokeRef.current || !paintCanvasRef.current) return
      const nextPoint = getStagePoint(moveEvent)
      const currentStroke = brushStrokeRef.current
      const lastPoint = currentStroke.points[currentStroke.points.length - 1]
      currentStroke.points.push(nextPoint)

      if (currentStroke.healing) return
      const moveCanvas = paintCanvasRef.current
      const moveCtx = moveCanvas.getContext('2d')
      if (!moveCtx) return
      moveCtx.save()
      moveCtx.globalCompositeOperation = currentStroke.erase ? 'destination-out' : 'source-over'
      moveCtx.lineCap = 'round'
      moveCtx.lineJoin = 'round'
      moveCtx.strokeStyle = currentStroke.color
      moveCtx.lineWidth = currentStroke.size
      moveCtx.globalAlpha = currentStroke.opacity
      moveCtx.beginPath()
      const from = {
        x: (lastPoint.x / 100) * moveCanvas.width,
        y: (lastPoint.y / 100) * moveCanvas.height,
      }
      const to = {
        x: (nextPoint.x / 100) * moveCanvas.width,
        y: (nextPoint.y / 100) * moveCanvas.height,
      }
      moveCtx.moveTo(from.x, from.y)
      moveCtx.lineTo(to.x, to.y)
      moveCtx.stroke()
      moveCtx.restore()
    }

    const finishStroke = async () => {
      const completedStroke = brushStrokeRef.current
      if (completedStroke) {
        commitHistory()
        if (completedStroke.healing) {
          if (!selectedImageSrc) {
            setNotice('Load an image before using Heal.')
          } else {
            try {
              setGeneratedImageSrc(await healImage({
                imageSrc: selectedImageSrc,
                points: completedStroke.points,
                brushSize,
                stageMetrics,
              }))
              setUploadedImage('')
              setSelectedAssetId('')
              setNotice('Healed the selected area in the image pixels.')
            } catch (error) {
              setNotice(error.message)
            }
          }
        } else {
          setBrushStrokes((prev) => [...prev, completedStroke])
        }
      }
      brushStrokeRef.current = null
      window.removeEventListener('pointermove', moveStroke)
      window.removeEventListener('pointerup', finishStroke)
      window.removeEventListener('pointercancel', finishStroke)
    }

    window.addEventListener('pointermove', moveStroke)
    window.addEventListener('pointerup', finishStroke)
    window.addEventListener('pointercancel', finishStroke)
  }

  const startRemoveArea = (event) => {
    if (activeTool !== 'remove' || !stageRef.current || !selectedImageSrc) return
    event.preventDefault()
    event.stopPropagation()
    const start = getStagePoint(event)
    removeDragRef.current = { start }
    const move = (moveEvent) => {
      const end = getStagePoint(moveEvent)
      const x = Math.min(start.x, end.x)
      const y = Math.min(start.y, end.y)
      const nextRect = { x, y, w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) }
      removeDragRef.current.rect = nextRect
      setRemoveRect(nextRect)
    }
    const finish = async () => {
      const rect = removeDragRef.current?.rect
      removeDragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      if (!rect || rect.w < 1 || rect.h < 1) return
      commitHistory()
      try {
        setGeneratedImageSrc(await removeImageArea({ imageSrc: selectedImageSrc, rect, stageMetrics }))
        setUploadedImage('')
        setSelectedAssetId('')
        setRemoveRect(null)
        setNotice('Removed the selected area from the image. Use Undo if you need the original back.')
      } catch (error) {
        setNotice(error.message)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  const updateCropRect = (nextRect) => {
    setCropRect((prev) => {
      const merged = { ...prev, ...nextRect }
      const width = clamp(merged.w, 20, 100)
      const height = clamp(merged.h, 20, 100)
      const x = clamp(merged.x, 0, 100 - width)
      const y = clamp(merged.y, 0, 100 - height)
      return { x, y, w: width, h: height }
    })
  }

  const startCropDrag = (event, mode = 'move') => {
    if (activeTool !== 'crop') return
    event.preventDefault()
    event.stopPropagation()
    cropDragRef.current = {
      mode,
      startPoint: getStagePoint(event),
      startRect: cropRect,
    }

    const moveCrop = (moveEvent) => {
      if (!cropDragRef.current) return
      const currentPoint = getStagePoint(moveEvent)
      const deltaX = currentPoint.x - cropDragRef.current.startPoint.x
      const deltaY = currentPoint.y - cropDragRef.current.startPoint.y
      const { startRect: rect, mode: dragMode } = cropDragRef.current

      if (dragMode === 'move') {
        updateCropRect({ x: rect.x + deltaX, y: rect.y + deltaY })
        return
      }

      const resizeMap = {
        nw: { x: rect.x + deltaX, y: rect.y + deltaY, w: rect.w - deltaX, h: rect.h - deltaY },
        ne: { y: rect.y + deltaY, w: rect.w + deltaX, h: rect.h - deltaY },
        sw: { x: rect.x + deltaX, w: rect.w - deltaX, h: rect.h + deltaY },
        se: { w: rect.w + deltaX, h: rect.h + deltaY },
      }

      updateCropRect(resizeMap[dragMode] ?? rect)
    }

    const endCropDrag = () => {
      cropDragRef.current = null
      window.removeEventListener('pointermove', moveCrop)
      window.removeEventListener('pointerup', endCropDrag)
      window.removeEventListener('pointercancel', endCropDrag)
    }

    window.addEventListener('pointermove', moveCrop)
    window.addEventListener('pointerup', endCropDrag)
    window.addEventListener('pointercancel', endCropDrag)
  }

  const handleGenerateImage = async () => {
    if (!aiImagePrompt.trim()) {
      setAiImageError('Describe the image you want to generate.')
      return
    }

    setAiImageLoading(true)
    setAiImageError('')

    try {
      const result = await generatePhotoConcept({
        prompt: aiImagePrompt,
        style: aiImageStyle,
        aspectRatio,
        referenceImageSrc: selectedImageSrc,
        agentConfig,
      })

      setGeneratedImageSrc(result.imageSrc)
      setGeneratedImageMeta(result)
      setSelectedAssetId('')
      setUploadedImage('')
      setActiveTool('crop')
      setNotice(`Generated ${result.source === 'api' ? 'AI' : 'local'} concept image. Crop and retouch the image before adding final text layers.`)
      if (result.headline) setHeadline(result.headline)
      if (result.caption) setSubcopy(result.caption)
      if (result.palette && STYLE_PRESETS[result.palette]) setPresetId(result.palette)
      setLayers((prev) =>
        prev.map((layer) => {
          if (layer.id === 'headline') return { ...layer, value: result.headline || layer.value }
          if (layer.id === 'subcopy') return { ...layer, value: result.caption || layer.value }
          return layer
        }),
      )
    } catch (error) {
      setAiImageError(error.message)
    } finally {
      setAiImageLoading(false)
    }
  }

  const clearBaseImage = () => {
    setGeneratedImageSrc('')
    setGeneratedImageMeta(null)
    setUploadedImage('')
    setSelectedAssetId('')
    setActiveTool('select')
    setNotice('Base image cleared. The canvas is ready for a new upload.')
  }

  const useLibraryImage = () => {
    const firstImage = imageAssets[0]
    if (!firstImage) {
      setNotice('Your workspace has no image assets yet.')
      return
    }
    setSelectedAssetId(firstImage.id)
    setUploadedImage('')
    setGeneratedImageSrc('')
    setNotice(`Using ${firstImage.name} as the base image.`)
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setUploadedImage(String(reader.result || ''))
      setActiveTool('heal')
      setNotice(`Loaded ${file.name} into the canvas. Use Heal, Crop, or Brush to retouch the underlying image.`)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const applyPrompt = () => {
    const concept = classifyPrompt(prompt)
    setPresetId(concept.preset)
    setHeadline(concept.headline)
    setSubcopy(concept.subcopy)
    setLayers((prev) =>
      prev.map((layer) => {
        if (layer.id === 'headline') return { ...layer, value: concept.headline }
        if (layer.id === 'subcopy') return { ...layer, value: concept.subcopy }
        if (layer.id === 'sticker') return { ...layer, value: concept.sticker }
        return layer
      }),
    )
    setActiveLayerId('headline')
    setNotice(`AI concept generated from: ${prompt}`)
  }

  const resetEditor = () => {
    commitHistory()
    setPrompt('')
    setPresetId('editorial')
    setAspectRatio('4:5')
    setHeadline('')
    setSubcopy('')
    setGeneratedImageSrc('')
    setGeneratedImageMeta(null)
    setUploadedImage('')
    setSelectedAssetId('')
    setFilters(DEFAULT_FILTERS)
    setCanvasBackground('#ffffff')
    setBrushStrokes([])
    setCropRect({ x: 0, y: 0, w: 100, h: 100 })
    setLayers([])
    setActiveLayerId('')
    setCanvasZoom(100)
    setActiveTool('select')
    setNotice('New blank workspace ready for upload.')
  }

  const addLogoLayer = (logo) => {
    addLayer({
      id: nextLayerId('logo'),
      type: 'image',
      label: logo.label || 'Logo',
      src: logo.dataUrl,
      value: logo.label || 'Logo',
      x: 82,
      y: 88,
      width: 18,
      opacity: 100,
      rotation: 0,
    })
    setNotice(`Added the ${logo.label} logo.`)
  }

  const applyBrandColor = (value) => {
    if (!resolvedActiveLayerId) return
    commitHistory()
    updateLayer(resolvedActiveLayerId, { color: value })
    setNotice('Applied a brand colour to the selected layer.')
  }

  const applyBrandFont = (family) => {
    if (!resolvedActiveLayerId) return
    commitHistory()
    updateLayer(resolvedActiveLayerId, { fontFamily: family })
    setNotice(family ? `Set the layer font to ${family}.` : 'Reset the layer font.')
  }

  const addStickerLayer = (sticker) => {
    addLayer({
      id: nextLayerId('sticker'),
      type: 'sticker',
      label: 'Sticker',
      value: sticker,
      x: 82,
      y: 72,
      fontSize: 56,
      weight: 700,
      color: preset.accent,
      align: 'center',
      opacity: 100,
      rotation: 0,
    })
    setNotice('Sticker added to the layout.')
  }

  const updateTextEffect = (patch) => {
    if (!activeTextLayer) return
    updateLayer(activeTextLayer.id, patch)
  }

  const exportCanvas = async () => {
    // Canvas silently falls back to a default face if a brand font is still
    // loading, so wait for the font set to settle first.
    if (document.fonts?.ready) {
      await document.fonts.ready
    }

    const stageCanvas = document.createElement('canvas')
    stageCanvas.width = stageMetrics.width
    stageCanvas.height = stageMetrics.height
    const stageDataUrl = await renderComposition({
      canvas: stageCanvas,
      imageSrc: selectedImageSrc,
      maskShape,
      filters,
      preset,
      backgroundColor: canvasBackground,
      layers,
      brushStrokes,
      stageMetrics,
    })

    const exportCanvasEl = document.createElement('canvas')
    exportCanvasEl.width = aspect.canvasWidth
    exportCanvasEl.height = aspect.canvasHeight
    const exportCtx = exportCanvasEl.getContext('2d')

    if (!exportCtx) {
      setNotice('Canvas export is unavailable in this browser.')
      return
    }

    exportCtx.fillStyle = canvasBackground || preset.base
    exportCtx.fillRect(0, 0, exportCanvasEl.width, exportCanvasEl.height)

    const stageImage = await loadImage(stageDataUrl)
    const sourceX = (cropRect.x / 100) * stageMetrics.width
    const sourceY = (cropRect.y / 100) * stageMetrics.height
    const sourceWidth = (cropRect.w / 100) * stageMetrics.width
    const sourceHeight = (cropRect.h / 100) * stageMetrics.height
    exportCtx.drawImage(stageImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, exportCanvasEl.width, exportCanvasEl.height)

    const format = EXPORT_FORMATS[exportFormat] ?? EXPORT_FORMATS.png

    // JPEG has no alpha, so anything transparent would render black without this.
    if (format.mime === 'image/jpeg') {
      exportCtx.globalCompositeOperation = 'destination-over'
      exportCtx.fillStyle = preset.base
      exportCtx.fillRect(0, 0, exportCanvasEl.width, exportCanvasEl.height)
      exportCtx.globalCompositeOperation = 'source-over'
    }

    const exportName = `${slugify(headline || prompt)}-${aspectRatio.replace(':', 'x')}.${format.extension}`
    const dataUrl = format.lossy
      ? exportCanvasEl.toDataURL(format.mime, clamp(exportQuality, 10, 100) / 100)
      : exportCanvasEl.toDataURL(format.mime)

    onExport?.({
      exportName,
      dataUrl,
      prompt,
      caption: subcopy,
      headline,
      palette: preset.label,
      aspectRatio,
      sizeBytes: Math.max(300000, Math.round(dataUrl.length * 0.72)),
      summary: `Photo design exported from the ${preset.label} preset.`,
    })

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = exportName
    link.click()
    setNotice(`Exported ${exportName} and sent it to your workspace.`)
  }

  return (
    <section className={`photo-creator-shell ${compactMode ? 'compact' : ''}`}>
      <header className="photo-creator-header">
        <div>
          <p className="small-title">Photo Creator</p>
          <h2>Professional photo editor for social campaigns</h2>
        </div>
        <div className="photo-creator-actions">
          <button type="button" className="ghost-button" onClick={() => setCompactMode((prev) => !prev)}>
            {compactMode ? 'Comfort tools' : 'Compact tools'}
          </button>
          <button type="button" className="ghost-button" onClick={() => setLeftSidebarCollapsed((prev) => !prev)}>
            {leftSidebarCollapsed ? 'Show left tools' : 'Hide left tools'}
          </button>
          <button type="button" className="ghost-button" onClick={() => setRightSidebarCollapsed((prev) => !prev)}>
            {rightSidebarCollapsed ? 'Show inspector' : 'Hide inspector'}
          </button>
          <button type="button" className="ghost-button" onClick={resetEditor}>New blank workspace</button>
          <button
            type="button"
            className="ghost-button"
            onClick={undo}
            disabled={historyCounts.past === 0}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={redo}
            disabled={historyCounts.future === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <button type="button" className="primary-button" onClick={exportCanvas}>
            Export {EXPORT_FORMATS[exportFormat]?.label ?? 'PNG'}
          </button>
        </div>
      </header>

      <div className={`photo-creator-grid ${compactMode ? 'compact' : ''} ${leftSidebarCollapsed ? 'left-collapsed' : ''} ${rightSidebarCollapsed ? 'right-collapsed' : ''}`}>
        <aside className={`photo-sidebar photo-sidebar-left ${leftSidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="photo-sidebar-toolbar">
            <p className="section-label">Source & tools</p>
            <button type="button" className="ghost-button" onClick={() => setLeftSidebarCollapsed((prev) => !prev)}>
              {leftSidebarCollapsed ? 'Open' : 'Collapse'}
            </button>
          </div>

          {leftSidebarCollapsed ? (
            <button type="button" className="photo-sidebar-collapsed-card" onClick={() => setLeftSidebarCollapsed(false)}>
              Show source tools
            </button>
          ) : (
            <>
          <div className="panel-block">
            <p className="section-label">Source</p>
            <div className="source-actions">
              <label className="photo-upload-chip">
                Upload from device
                <input type="file" accept="image/*" onChange={handleUpload} />
              </label>
              <div className="source-action-row">
                <button type="button" className="ghost-button" onClick={clearBaseImage}>
                  Clear canvas image
                </button>
                <button type="button" className="ghost-button" onClick={useLibraryImage}>
                  Use library image
                </button>
              </div>
            </div>
            <div className="source-list">
              {imageAssets.length === 0 && <p className="muted">Your workspace has no image assets yet.</p>}
              {imageAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={selectedAssetId === asset.id ? 'source-card active' : 'source-card'}
                  onClick={() => {
                    setSelectedAssetId(asset.id)
                    setUploadedImage('')
                    setNotice(`Using ${asset.name} as the base image.`)
                  }}
                >
                  <span className="source-thumb">{asset.previewUrl ? <img src={asset.previewUrl} alt={asset.name} /> : '🖼️'}</span>
                  <span>
                    <strong>{asset.name}</strong>
                    <small>{asset.summary}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel-block">
            <p className="section-label">AI image generator</p>
            <label>
              Prompt
              <textarea
                rows="4"
                value={aiImagePrompt}
                onChange={(event) => setAiImagePrompt(event.target.value)}
                placeholder="Describe the scene, subject, and vibe..."
              />
            </label>
            <label>
              Style
              <select value={aiImageStyle} onChange={(event) => setAiImageStyle(event.target.value)}>
                {Object.entries(STYLE_PRESETS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="primary-button full-width" onClick={handleGenerateImage} disabled={aiImageLoading}>
              {aiImageLoading ? 'Generating...' : 'Generate image'}
            </button>
            {generatedImageMeta && (
              <p className="muted">{generatedImageMeta.source === 'api' ? 'Connected AI model' : 'Local concept fallback'} • {generatedImageMeta.palette}</p>
            )}
            {aiImageError && <p className="auth-message auth-error">{aiImageError}</p>}
            <label>
              Social prompt
              <textarea
                rows="3"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Used for the concept cards and export notes..."
              />
            </label>
            <button type="button" className="ghost-button full-width" onClick={applyPrompt}>
              Sync prompt to text layers
            </button>
          </div>

          <div className="panel-block">
            <p className="section-label">Quick styles</p>
            <div className="preset-grid">
              {Object.entries(STYLE_PRESETS).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  className={presetId === key ? 'preset-card active' : 'preset-card'}
                  onClick={() => setPresetId(key)}
                  style={{ background: value.background }}
                >
                  <strong>{value.label}</strong>
                  <span>{value.headline}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel-block">
            <p className="section-label">Tools</p>
            <div className="tool-grid">
              {Object.entries(TOOLS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={activeTool === key ? 'tool-chip active' : 'tool-chip'}
                  onClick={() => setActiveTool(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted">
              Heal smooths small distractions, Remove area cleans a selected rectangle, and Eraser removes paint strokes.
            </p>
            <label>
              Mask shape
              <select value={maskShape} onChange={(event) => setMaskShape(event.target.value)}>
                {Object.entries(MASK_SHAPES).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Brush color
              <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} />
            </label>
            <label className="slider-row">
              <span>Brush size</span>
              <input type="range" min="4" max="96" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
            </label>
            <label className="slider-row">
              <span>Brush opacity</span>
              <input type="range" min="0.1" max="1" step="0.05" value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} />
            </label>
          </div>
            </>
          )}
        </aside>

        <div className="photo-stage-panel">
          <div className="stage-chrome">
            <div>
              <p className="section-label">Canvas</p>
              <h3>{aspect.label} layout</h3>
            </div>
            <div className="stage-status">
              <span className="status-pill">{activeTool.toUpperCase()}</span>
              <p className="muted">{notice}</p>
            </div>
            <div className="canvas-controls" aria-label="Canvas controls">
              <button type="button" className="chip" onClick={() => setCanvasZoom((value) => clamp(value - 10, 50, 200))}>−</button>
              <span>{canvasZoom}%</span>
              <button type="button" className="chip" onClick={() => setCanvasZoom((value) => clamp(value + 10, 50, 200))}>+</button>
              <button type="button" className="chip" onClick={() => setCanvasZoom(100)}>Fit</button>
            </div>
          </div>

          <div ref={stageViewportRef} className="photo-stage-wrap">
            <div
              ref={stageRef}
              className="photo-stage"
              onPointerDown={(event) => {
                if (activeTool === 'remove') startRemoveArea(event)
                else startBrushStroke(event)
              }}
              style={{
                width: `${stageDisplaySize.width}px`,
                height: `${stageDisplaySize.height}px`,
                aspectRatio: aspect.css,
                background: canvasBackground,
                transform: `scale(${canvasZoom / 100})`,
                cursor:
                  activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'heal'
                    ? 'crosshair'
                    : activeTool === 'remove'
                      ? 'crosshair'
                    : activeTool === 'crop'
                      ? 'move'
                      : 'default',
                clipPath: stageClipPath,
              }}
            >
              {selectedImageSrc ? (
                <img
                  className="photo-stage-image"
                  src={selectedImageSrc}
                  alt="Selected composition"
                  style={{
                    filter: buildFilterString(filters),
                  }}
                />
              ) : (
                <div className="photo-stage-empty">
                  <span>Drop in a photo or generate a concept to start</span>
                </div>
              )}

              {(selectedImageSrc || layers.length || brushStrokes.length) && (
                <>
                  <div className="photo-stage-vignette" style={{ opacity: clamp(filters.vignette / 100, 0.18, 0.7) }} />
                  <div className="photo-stage-noise" style={{ opacity: clamp(filters.grain / 80, 0.05, 0.22) }} />
                </>
              )}
              <canvas ref={paintCanvasRef} className="photo-paint-layer" aria-hidden="true" />

              {activeTool === 'crop' && (
                <div className="crop-overlay">
                  <button
                    type="button"
                    className="crop-handle crop-handle-nw"
                    onPointerDown={(event) => startCropDrag(event, 'nw')}
                  />
                  <button
                    type="button"
                    className="crop-handle crop-handle-ne"
                    onPointerDown={(event) => startCropDrag(event, 'ne')}
                  />
                  <button
                    type="button"
                    className="crop-handle crop-handle-sw"
                    onPointerDown={(event) => startCropDrag(event, 'sw')}
                  />
                  <button
                    type="button"
                    className="crop-handle crop-handle-se"
                    onPointerDown={(event) => startCropDrag(event, 'se')}
                  />
                  <div
                    className="crop-frame"
                    onPointerDown={(event) => startCropDrag(event, 'move')}
                    style={{
                      left: `${cropRect.x}%`,
                      top: `${cropRect.y}%`,
                      width: `${cropRect.w}%`,
                      height: `${cropRect.h}%`,
                    }}
                  />
                </div>
              )}
              {activeTool === 'remove' && removeRect && (
                <div
                  className="remove-area-overlay"
                  style={{ left: `${removeRect.x}%`, top: `${removeRect.y}%`, width: `${removeRect.w}%`, height: `${removeRect.h}%` }}
                >
                  Remove area
                </div>
              )}

              {layers.filter((layer) => !layer.hidden).map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={layer.id === resolvedActiveLayerId ? 'photo-layer active' : 'photo-layer'}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    opacity: (layer.opacity ?? 100) / 100,
                    transform: `${
                      layer.type === 'sticker' || layer.type === 'shape' || layer.type === 'image'
                        ? 'translate(-50%, -50%)'
                        : layer.align === 'center'
                          ? 'translate(-50%, -50%)'
                          : layer.align === 'right'
                            ? 'translate(-100%, -50%)'
                            : 'translate(0, -50%)'
                    } rotate(${layer.rotation || 0}deg)`,
                  }}
                  onPointerDown={(event) => beginDrag(layer, event)}
                  onClick={() => setActiveLayerId(layer.id)}
                >
                  {layer.type === 'image' ? (
                    <img
                      src={layer.src}
                      alt={layer.label}
                      style={{
                        display: 'block',
                        width: `${(layer.width / 100) * stageDisplaySize.width}px`,
                        height: 'auto',
                      }}
                    />
                  ) : layer.type === 'shape' ? (
                    <span
                      style={{
                        display: 'block',
                        width: `${(layer.width / 100) * stageDisplaySize.width}px`,
                        height: `${(layer.height / 100) * stageDisplaySize.height}px`,
                        background: layer.filled === false ? 'transparent' : layer.color,
                        border: layer.strokeWidth > 0 ? `${layer.strokeWidth}px solid ${layer.strokeColor}` : 'none',
                        borderRadius:
                          layer.shape === 'ellipse' ? '50%' : `${layer.radius || 0}px`,
                        clipPath:
                          layer.shape === 'triangle' ? 'polygon(50% 0%, 100% 100%, 0% 100%)' : 'none',
                      }}
                    />
                  ) : layer.type === 'sticker' ? (
                    <span style={{ fontSize: `${layer.fontSize}px` }}>{layer.value}</span>
                  ) : (
                    <span
                      style={{
                        fontSize: `${layer.fontSize}px`,
                        fontWeight: layer.weight,
                        fontFamily: layer.fontFamily
                          ? `"${layer.fontFamily}", Inter, system-ui, sans-serif`
                          : undefined,
                        color: layer.color,
                        textAlign: layer.align,
                        filter: layer.effect === 'glow' ? 'drop-shadow(0 0 12px rgba(255,255,255,0.7))' : 'none',
                        maxWidth: '18ch',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {layer.value}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="stage-footer">
            <p>Drag text, shape, and sticker layers directly on the canvas.</p>
            <div className="chip-row">
              {STICKERS.map((sticker) => (
                <button key={sticker} type="button" className="chip" onClick={() => addStickerLayer(sticker)}>
                  {sticker}
                </button>
              ))}
              <button type="button" className="chip" onClick={addTextLayer}>+ Text</button>
              {(brandKit?.logos ?? []).map((logo) => (
                <button key={logo.id} type="button" className="chip" onClick={() => addLogoLayer(logo)}>
                  <img src={logo.dataUrl} alt={logo.label} style={{ height: 18, width: 'auto' }} />
                </button>
              ))}
              {Object.entries(SHAPES).map(([key, label]) => (
                <button key={key} type="button" className="chip" onClick={() => addShapeLayer(key)}>
                  + {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className={`photo-sidebar photo-sidebar-right ${rightSidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="photo-sidebar-toolbar">
            <p className="section-label">Inspector</p>
            <button type="button" className="ghost-button" onClick={() => setRightSidebarCollapsed((prev) => !prev)}>
              {rightSidebarCollapsed ? 'Open' : 'Collapse'}
            </button>
          </div>

          {rightSidebarCollapsed ? (
            <button type="button" className="photo-sidebar-collapsed-card" onClick={() => setRightSidebarCollapsed(false)}>
              Show inspector
            </button>
          ) : (
            <>
          <div className="panel-block">
            <p className="section-label">Inspector</p>
            <label>
              Aspect ratio
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                {Object.entries(ASPECT_RATIOS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </label>
            <label>
              Canvas background
              <input type="color" value={canvasBackground} onChange={(event) => setCanvasBackground(event.target.value)} />
            </label>
            <label>
              Active layer
              <select value={resolvedActiveLayerId} onChange={(event) => setActiveLayerId(event.target.value)}>
                {layers.map((layer) => (
                  <option key={layer.id} value={layer.id}>{layer.label}</option>
                ))}
              </select>
            </label>
            <label>
              Layer effect
              <select
                value={activeTextLayer?.effect ?? 'none'}
                onChange={(event) => updateTextEffect({ effect: event.target.value })}
                disabled={!activeTextLayer}
              >
                {Object.entries(TEXT_EFFECTS).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </select>
            </label>
            {layers.map((layer) =>
              layer.id === resolvedActiveLayerId ? (
                <div key={layer.id} className="layer-inspector">
                  <label>
                    Content
                    <input
                      value={layer.value}
                      onChange={(event) => updateLayer(layer.id, { value: event.target.value })}
                    />
                  </label>
                  <label>
                    Size
                    <input
                      type="range"
                      min="16"
                      max="96"
                      value={layer.fontSize}
                      onChange={(event) => updateLayer(layer.id, { fontSize: Number(event.target.value) })}
                    />
                  </label>
                  <label className="slider-row">
                    <span>Opacity {layer.opacity ?? 100}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={layer.opacity ?? 100}
                      onPointerDown={commitHistory}
                      onChange={(event) => updateLayer(layer.id, { opacity: Number(event.target.value) })}
                    />
                  </label>
                  <label className="slider-row">
                    <span>Rotation {layer.rotation ?? 0}°</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={layer.rotation ?? 0}
                      onPointerDown={commitHistory}
                      onChange={(event) => updateLayer(layer.id, { rotation: Number(event.target.value) })}
                    />
                  </label>
                  {layer.type === 'shape' && (
                    <>
                      <label className="slider-row">
                        <span>Width</span>
                        <input
                          type="range"
                          min="2"
                          max="100"
                          value={layer.width}
                          onPointerDown={commitHistory}
                          onChange={(event) => updateLayer(layer.id, { width: Number(event.target.value) })}
                        />
                      </label>
                      <label className="slider-row">
                        <span>Height</span>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={layer.height}
                          onPointerDown={commitHistory}
                          onChange={(event) => updateLayer(layer.id, { height: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Fill color
                        <input
                          type="color"
                          value={normalizeColorInputValue(layer.color, '#67e8f9')}
                          onChange={(event) => updateLayer(layer.id, { color: event.target.value })}
                        />
                      </label>
                      <label>
                        Border width
                        <input
                          type="range"
                          min="0"
                          max="24"
                          value={layer.strokeWidth ?? 0}
                          onPointerDown={commitHistory}
                          onChange={(event) => updateLayer(layer.id, { strokeWidth: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Border color
                        <input
                          type="color"
                          value={normalizeColorInputValue(layer.strokeColor, '#f9a8d4')}
                          onChange={(event) => updateLayer(layer.id, { strokeColor: event.target.value })}
                        />
                      </label>
                      <label>
                        Filled
                        <input
                          type="checkbox"
                          checked={layer.filled !== false}
                          onChange={(event) => updateLayer(layer.id, { filled: event.target.checked })}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    X position
                    <input
                      type="range"
                      min="4"
                      max="92"
                      value={layer.x}
                      onChange={(event) => updateLayer(layer.id, { x: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Y position
                    <input
                      type="range"
                      min="6"
                      max="88"
                      value={layer.y}
                      onChange={(event) => updateLayer(layer.id, { y: Number(event.target.value) })}
                    />
                  </label>
                  {layer.type === 'text' && (
                    <>
                      <label>
                        Outline width
                        <input
                          type="range"
                          min="0"
                          max="12"
                          value={layer.outlineWidth ?? 0}
                          onChange={(event) => updateLayer(layer.id, { outlineWidth: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Outline color
                        <input
                          type="color"
                          value={layer.outlineColor ?? '#020617'}
                          onChange={(event) => updateLayer(layer.id, { outlineColor: event.target.value })}
                        />
                      </label>
                      <label>
                        Shadow blur
                        <input
                          type="range"
                          min="0"
                          max="40"
                          value={layer.shadowBlur ?? 0}
                          onChange={(event) => updateLayer(layer.id, { shadowBlur: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Shadow color
                        <input
                          type="color"
                          value={normalizeColorInputValue(layer.shadowColor, '#020617')}
                          onChange={(event) => updateLayer(layer.id, { shadowColor: event.target.value })}
                        />
                      </label>
                      <label>
                        Panel color
                        <input
                          type="color"
                          value={normalizeColorInputValue(layer.panelColor, '#0f172a')}
                          onChange={(event) => updateLayer(layer.id, { panelColor: `${event.target.value}cc` })}
                        />
                      </label>
                      <label>
                        Letter spacing
                        <input
                          type="range"
                          min="-2"
                          max="8"
                          step="0.5"
                          value={layer.letterSpacing ?? 0}
                          onChange={(event) => updateLayer(layer.id, { letterSpacing: Number(event.target.value) })}
                        />
                      </label>
                    </>
                  )}
                  {layer.type === 'text' && (
                    <label>
                      Color
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(event) => updateLayer(layer.id, { color: event.target.value })}
                      />
                    </label>
                  )}
                  <button type="button" className="ghost-button full-width" onClick={() => deleteLayer(layer.id)}>
                    Remove layer
                  </button>
                </div>
              ) : null,
            )}
          </div>

          <div className="panel-block">
            <div className="photo-sidebar-toolbar">
              <p className="section-label">Adjustments</p>
              <button type="button" className="ghost-button" onClick={resetFilters}>Reset</button>
            </div>
            {[
              ['brightness', 'Brightness'],
              ['exposure', 'Exposure'],
              ['contrast', 'Contrast'],
              ['saturation', 'Saturation'],
              ['hue', 'Hue'],
              ['sepia', 'Sepia'],
              ['grayscale', 'Black & white'],
              ['invert', 'Invert'],
              ['blur', 'Blur'],
              ['vignette', 'Vignette'],
              ['grain', 'Grain'],
            ].map(([key, label]) => (
              <label key={key} className="slider-row">
                <span>{label}</span>
                <input
                  type="range"
                  min={key === 'blur' ? 0 : key === 'hue' ? -45 : 0}
                  max={
                    key === 'blur'
                      ? 6
                      : key === 'hue'
                        ? 45
                        : ['sepia', 'grayscale', 'invert'].includes(key)
                          ? 100
                          : 200
                  }
                  step={key === 'blur' ? 0.1 : 1}
                  value={filters[key]}
                  // One undo step per drag, rather than one per pixel moved.
                  onPointerDown={commitHistory}
                  onChange={(event) => setFilters((prev) => ({ ...prev, [key]: Number(event.target.value) }))}
                />
              </label>
            ))}
          </div>

          <div className="panel-block">
            <p className="section-label">Export</p>
            <label>
              Format
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                {Object.entries(EXPORT_FORMATS).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </label>
            {EXPORT_FORMATS[exportFormat]?.lossy && (
              <label className="slider-row">
                <span>Quality {exportQuality}%</span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={exportQuality}
                  onChange={(event) => setExportQuality(Number(event.target.value))}
                />
              </label>
            )}
          </div>

          <div className="panel-block">
            <p className="section-label">Layers</p>
            <p className="panel-note">Top of this list draws first; the bottom entry sits in front.</p>
            {[...layers].reverse().map((layer) => (
              <div
                key={`manage-${layer.id}`}
                className={`it-row ${layer.id === resolvedActiveLayerId ? 'active' : ''}`}
                style={{ gap: '0.35rem', alignItems: 'center' }}
              >
                <button
                  type="button"
                  className="text-button"
                  style={{ flex: 1, textAlign: 'left', opacity: layer.hidden ? 0.45 : 1 }}
                  onClick={() => setActiveLayerId(layer.id)}
                >
                  {layer.type === 'sticker' ? layer.value : layer.label}
                </button>
                <button
                  type="button"
                  className="chip"
                  title={layer.hidden ? 'Show layer' : 'Hide layer'}
                  onClick={() => toggleLayerVisibility(layer.id)}
                >
                  {layer.hidden ? 'Show' : 'Hide'}
                </button>
                <button type="button" className="chip" title="Bring forward" onClick={() => moveLayerOrder(layer.id, 1)}>
                  ↑
                </button>
                <button type="button" className="chip" title="Send backward" onClick={() => moveLayerOrder(layer.id, -1)}>
                  ↓
                </button>
                <button type="button" className="chip" title="Duplicate" onClick={() => duplicateLayer(layer.id)}>
                  Copy
                </button>
                <button type="button" className="chip" title="Delete" onClick={() => deleteLayer(layer.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="panel-block">
            <p className="section-label">Brand kit</p>
            {(brandKit?.colors?.length || brandKit?.fonts?.length || brandKit?.logos?.length) ? (
              <>
                {brandKit.colors?.length > 0 && (
                  <>
                    <p className="muted">Colours — click to apply to the selected layer</p>
                    <div className="chip-row">
                      {brandKit.colors.map((color) => (
                        <button
                          key={color.id}
                          type="button"
                          className="chip"
                          title={`${color.label} ${color.value}`}
                          onClick={() => applyBrandColor(color.value)}
                          style={{
                            background: color.value,
                            color: '#fff',
                            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                          }}
                        >
                          {color.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {brandKit.fonts?.length > 0 && (
                  <label>
                    Brand font
                    <select
                      value={activeTextLayer?.fontFamily ?? ''}
                      disabled={!activeTextLayer}
                      onChange={(event) => applyBrandFont(event.target.value)}
                    >
                      <option value="">Default (Inter)</option>
                      {brandKit.fonts
                        .filter((font) => font.family)
                        .map((font) => (
                          <option key={font.id} value={font.family}>
                            {font.label || font.family}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

                {brandKit.logos?.length > 0 && (
                  <>
                    <p className="muted">Logos</p>
                    <div className="chip-row">
                      {brandKit.logos.map((logo) => (
                        <button
                          key={logo.id}
                          type="button"
                          className="chip"
                          onClick={() => addLogoLayer(logo)}
                          title={`Add ${logo.label}`}
                        >
                          <img src={logo.dataUrl} alt={logo.label} style={{ height: 22, width: 'auto' }} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="muted">
                No brand kit yet. Add your colours, licensed fonts, and logos under Integrations →
                Brand kit and they&apos;ll show up here.
              </p>
            )}
          </div>

          <div className="panel-block">
            <p className="section-label">Concept notes</p>
            <div className="concept-card">
              <strong>{headline}</strong>
              <p>{subcopy}</p>
              <small>Preset: {preset.label}</small>
            </div>
          </div>
            </>
          )}
        </aside>
      </div>
    </section>
  )
}