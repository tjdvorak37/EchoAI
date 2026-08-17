import { canUseAgentMode, runUserAiAgent } from './aiAgentService'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const getAspectSize = (aspectRatio) => {
  if (aspectRatio === '1:1') return { width: 1400, height: 1400 }
  if (aspectRatio === '16:9') return { width: 1600, height: 900 }
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 }
  return { width: 1200, height: 1500 }
}

const hashString = (value) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

const buildPalette = (prompt, style) => {
  const seed = hashString(`${prompt}|${style}`)
  const palettes = [
    ['#081120', '#67e8f9', '#f9a8d4', '#f8fafc'],
    ['#111827', '#f59e0b', '#fb7185', '#f8fafc'],
    ['#0b1220', '#22c55e', '#60a5fa', '#e2e8f0'],
    ['#1f130f', '#fde68a', '#fb7185', '#fff7ed'],
  ]

  return palettes[seed % palettes.length]
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load the reference image.'))
    image.src = src
  })

const renderLocalConcept = async ({ prompt, style, aspectRatio, referenceImageSrc }) => {
  const { width, height } = getAspectSize(aspectRatio)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Canvas rendering is unavailable in this browser.')
  }

  const [base, accent, secondary, foreground] = buildPalette(prompt, style)
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, base)
  gradient.addColorStop(0.55, accent)
  gradient.addColorStop(1, secondary)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const blobs = [
    { x: width * 0.12, y: height * 0.2, r: width * 0.33, color: 'rgba(255,255,255,0.2)' },
    { x: width * 0.82, y: height * 0.78, r: width * 0.28, color: 'rgba(0,0,0,0.18)' },
    { x: width * 0.7, y: height * 0.18, r: width * 0.18, color: 'rgba(255,255,255,0.12)' },
  ]

  blobs.forEach((blob) => {
    const radial = ctx.createRadialGradient(blob.x, blob.y, 20, blob.x, blob.y, blob.r)
    radial.addColorStop(0, blob.color)
    radial.addColorStop(1, 'transparent')
    ctx.fillStyle = radial
    ctx.fillRect(0, 0, width, height)
  })

  if (referenceImageSrc) {
    try {
      const image = await loadImage(referenceImageSrc)
      const imageRatio = image.width / image.height
      const canvasRatio = width / height
      let drawWidth = width
      let drawHeight = height
      let offsetX = 0
      let offsetY = 0

      if (imageRatio > canvasRatio) {
        drawHeight = height
        drawWidth = imageRatio * drawHeight
        offsetX = (width - drawWidth) / 2
      } else {
        drawWidth = width
        drawHeight = drawWidth / imageRatio
        offsetY = (height - drawHeight) / 2
      }

      ctx.save()
      ctx.globalAlpha = 0.45
      ctx.filter = 'blur(8px) saturate(1.2)'
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
      ctx.restore()
    } catch {
      // Fallback abstract composition handles the visual if the image cannot load.
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.fillRect(width * 0.12, height * 0.14, width * 0.76, height * 0.72)

  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.font = `800 ${Math.max(52, Math.round(width * 0.05))}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 28
  const headline = prompt.trim() || 'AI generated concept'
  const headlineLines = headline.split(/\s+/).slice(0, 8)
  ctx.fillText(headlineLines.join(' ').slice(0, 42), width * 0.08, height * 0.12)

  ctx.shadowBlur = 0
  ctx.font = `600 ${Math.max(24, Math.round(width * 0.022))}px Inter, system-ui, sans-serif`
  ctx.fillStyle = foreground
  ctx.fillText(`Style: ${style}`, width * 0.08, height * 0.2)
  ctx.fillText('EchoAI image generator', width * 0.08, height * 0.24)

  ctx.font = `500 ${Math.max(18, Math.round(width * 0.018))}px Inter, system-ui, sans-serif`
  const copy = prompt.trim().slice(0, 110) || 'Describe the scene, subject, and mood to create a polished campaign-ready visual.'
  const words = copy.split(/\s+/)
  let line = ''
  const lines = []
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word
    if (next.length > 26) {
      if (line) lines.push(line)
      line = word
    } else {
      line = next
    }
  })
  if (line) lines.push(line)
  lines.slice(0, 3).forEach((item, index) => {
    ctx.fillText(item, width * 0.08, height * 0.31 + index * Math.round(height * 0.035))
  })

  return {
    imageSrc: canvas.toDataURL('image/png'),
    headline: headlineLines.join(' ').slice(0, 42),
    caption: copy,
    palette: style,
    summary: 'Locally generated AI concept image',
    source: 'local',
  }
}

const readResponseImage = async (payload) => {
  if (!payload) return null

  if (payload.imageSrc) return payload.imageSrc
  if (payload.dataUrl) return payload.dataUrl
  if (payload.imageBase64) return `data:image/png;base64,${payload.imageBase64}`
  if (payload.imageUrl) return payload.imageUrl
  return null
}

export async function generatePhotoConcept({ prompt, style, aspectRatio, referenceImageSrc, agentConfig }) {
  const cleanedPrompt = prompt.trim()
  if (!cleanedPrompt) {
    throw new Error('A prompt is required to generate an image.')
  }

  if (canUseAgentMode(agentConfig, 'image')) {
    try {
      const agentResult = await runUserAiAgent({
        agentConfig,
        mode: 'image',
        prompt: cleanedPrompt,
        payload: { prompt: cleanedPrompt, style, aspectRatio, referenceImageSrc: referenceImageSrc || null },
      })

      const imageSrc = await readResponseImage(agentResult.payload)
      if (imageSrc) {
        return {
          imageSrc,
          headline: agentResult.payload?.headline || cleanedPrompt.slice(0, 60),
          caption: agentResult.payload?.caption || cleanedPrompt,
          palette: agentResult.payload?.palette || style,
          summary: agentResult.payload?.summary || 'Generated by your AI agent',
          source: 'agent',
        }
      }
      throw new Error('The selected AI tool returned no image. Check its image capability and model access.')
    } catch (error) {
      throw new Error(`The selected AI tool could not generate an image: ${error.message}`, { cause: error })
    }
  }

  // The provider key lives in the ai-image edge function, never in this bundle.
  if (!isSupabaseConfigured) {
    return renderLocalConcept({ prompt: cleanedPrompt, style, aspectRatio, referenceImageSrc })
  }

  try {
    const { data: payload, error } = await supabase.functions.invoke('ai-image', {
      body: {
        prompt: cleanedPrompt,
        style,
        aspectRatio,
        referenceImageSrc: referenceImageSrc || null,
      },
    })

    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || error.message)
    }

    const imageSrc = await readResponseImage(payload)

    if (!imageSrc) {
      throw new Error('The image generation service returned no image.')
    }

    return {
      imageSrc,
      headline: payload.headline || cleanedPrompt.slice(0, 60),
      caption: payload.caption || cleanedPrompt,
      palette: payload.palette || style,
      summary: payload.summary || 'Generated with the connected image model',
      source: 'api',
    }
  } catch (error) {
    throw new Error(`Image generation is unavailable: ${error.message}`, { cause: error })
  }
}