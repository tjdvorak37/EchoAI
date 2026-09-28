export const PHOTO_PROJECT_FORMAT = 'echoai-photo-project'
export const PHOTO_PROJECT_VERSION = 2

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export const createPhotoProject = (state) => ({
  format: PHOTO_PROJECT_FORMAT,
  version: PHOTO_PROJECT_VERSION,
  savedAt: new Date().toISOString(),
  document: {
    imageSrc: state.imageSrc || '',
    prompt: state.prompt || '',
    headline: state.headline || '',
    subcopy: state.subcopy || '',
    presetId: state.presetId || 'aurora',
    aspectRatio: state.aspectRatio || '4:5',
    canvasSize: state.canvasSize || null,
    canvasBackground: state.canvasBackground ?? '#ffffff',
    maskShape: state.maskShape || 'none',
    cropRect: state.cropRect || { x: 0, y: 0, w: 100, h: 100 },
    filters: state.filters || {},
    hueSat: state.hueSat || null,
    layerMask: state.layerMask || null,
    brushStrokes: state.brushStrokes || [],
    layers: state.layers || [],
    selection: state.selection || null,
    exportFormat: state.exportFormat || 'png',
    exportQuality: state.exportQuality ?? 92,
  },
})

export const parsePhotoProject = (text) => {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This project file is not valid JSON.')
  }

  const document = parsed?.format === PHOTO_PROJECT_FORMAT ? parsed.document : parsed
  if (!isRecord(document) || !Array.isArray(document.layers) || !isRecord(document.filters)) {
    throw new Error('This file is not a valid EchoAI photo project.')
  }
  if (document.layers.some((layer) => !isRecord(layer) || typeof layer.id !== 'string' || typeof layer.type !== 'string')) {
    throw new Error('The project contains an invalid layer.')
  }
  if (document.imageSrc && typeof document.imageSrc !== 'string') {
    throw new Error('The project image is invalid.')
  }
  return {
    prompt: '',
    headline: '',
    subcopy: '',
    presetId: 'aurora',
    canvasBackground: '#ffffff',
    maskShape: 'none',
    cropRect: { x: 0, y: 0, w: 100, h: 100 },
    hueSat: null,
    layerMask: null,
    selection: null,
    exportFormat: 'png',
    exportQuality: 92,
    ...document,
    aspectRatio: document.aspectRatio || document.aspect || '4:5',
    filters: { ...document.filters },
    layers: document.layers.map((layer) => ({ ...layer })),
    brushStrokes: Array.isArray(document.brushStrokes) ? document.brushStrokes : [],
  }
}
