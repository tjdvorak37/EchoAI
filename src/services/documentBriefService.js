import JSZip from 'jszip'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { canUseAgentMode, runUserAiAgent } from './aiAgentService'
import { generatePhotoConcept } from './photoAiService'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MAX_SOURCE_CHARS = 24000
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'html', 'xml'])

const extensionOf = (name) => name.toLowerCase().split('.').pop() || ''

const normalizeText = (value) =>
  String(value || '')
    .replaceAll(String.fromCharCode(0), '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const elementsByName = (node, localName) => Array.from(node.getElementsByTagNameNS('*', localName))

const textFromXml = (xml) => {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  return normalizeText(elementsByName(document, 't').map((node) => node.textContent).join(' '))
}

const readOfficeDocument = async (file, extension) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  if (extension === 'docx') {
    const documentXml = await zip.file('word/document.xml')?.async('text')
    if (!documentXml) throw new Error('This Word document has no readable body text.')
    return textFromXml(documentXml)
  }

  if (extension === 'pptx') {
    const slides = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]))
    const text = await Promise.all(slides.map(async (path) => textFromXml(await zip.file(path).async('text'))))
    return normalizeText(text.map((slide, index) => `Slide ${index + 1}: ${slide}`).join('\n'))
  }

  const sharedStringsFile = zip.file('xl/sharedStrings.xml')
  const sharedStrings = sharedStringsFile
    ? elementsByName(new DOMParser().parseFromString(await sharedStringsFile.async('text'), 'application/xml'), 'si')
      .map((node) => normalizeText(elementsByName(node, 't').map((text) => text.textContent).join(' ')))
    : []
  const sheets = Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]))
  const rows = await Promise.all(sheets.map(async (path, sheetIndex) => {
    const xml = new DOMParser().parseFromString(await zip.file(path).async('text'), 'application/xml')
    const sheetRows = elementsByName(xml, 'row').map((row) =>
      elementsByName(row, 'c').map((cell) => {
        const value = elementsByName(cell, 'v')[0]?.textContent || elementsByName(cell, 't')[0]?.textContent || ''
        return cell.getAttribute('t') === 's' ? sharedStrings[Number(value)] || '' : value
      }).filter(Boolean).join(' | '),
    ).filter(Boolean)
    return `Sheet ${sheetIndex + 1}:\n${sheetRows.join('\n')}`
  }))
  return normalizeText(rows.join('\n\n'))
}

const readPdf = async (file) => {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(`Page ${pageNumber}: ${content.items.map((item) => item.str).join(' ')}`)
  }
  return normalizeText(pages.join('\n'))
}

const readImageDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`))
  reader.readAsDataURL(file)
})

export const readBriefFile = async (file) => {
  const extension = extensionOf(file.name)
  let text
  let imageSrc = ''

  if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith('text/')) {
    text = await file.text()
  } else if (extension === 'pdf') {
    text = await readPdf(file)
  } else if (['docx', 'pptx', 'xlsx'].includes(extension)) {
    text = await readOfficeDocument(file, extension)
  } else if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
    text = `${file.type.startsWith('image/') ? 'Image' : 'Video'} reference named ${file.name}`
    if (file.type.startsWith('image/')) imageSrc = await readImageDataUrl(file)
  } else {
    throw new Error('Use PDF, DOCX, PPTX, XLSX, CSV, JSON, text, image, or video files.')
  }

  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    type: file.type || `application/${extension}`,
    size: file.size,
    text: normalizeText(text).slice(0, MAX_SOURCE_CHARS),
    imageSrc,
  }
}

// Workspace assets are metadata records, not File handles, so the stored summary
// stands in for the extracted text a real upload would produce.
export const briefSourceFromAsset = (asset) => {
  const label = asset.type === 'video' ? 'Video' : asset.type === 'image' ? 'Image' : 'Document'
  const text = asset.summary || `${label} reference named ${asset.name}`

  return {
    id: `asset:${asset.id}`,
    name: asset.name,
    type: asset.mime || `${asset.type}/*`,
    size: asset.size || 0,
    text: normalizeText(text).slice(0, MAX_SOURCE_CHARS),
    imageSrc: asset.type === 'image' ? asset.previewUrl || '' : '',
  }
}

const fallbackProject = ({ instruction, outputType, sources }) => {
  const sourceText = sources.map((source) => source.text).join(' ')
  const words = normalizeText(`${instruction} ${sourceText}`).split(/\s+/).filter((word) => word.length > 3)
  const headline = instruction.split(/[.!?\n]/)[0].trim().slice(0, 72) || 'Campaign ready creative'
  const detail = sourceText.slice(0, 220) || 'Use the supplied references to build a clear, focused campaign.'

  return {
    title: headline,
    headline,
    caption: detail,
    visualPrompt: `${instruction}. Use the facts and themes from: ${sourceText.slice(0, 1400)}`,
    outputType,
    keywords: [...new Set(words.map((word) => word.toLowerCase()))].slice(0, 8),
    scenes: [
      { title: 'Hook', direction: headline },
      { title: 'Proof', direction: detail.slice(0, 120) },
      { title: 'Action', direction: 'Close with one clear call to action.' },
    ],
    source: 'local',
  }
}

const normalizeAgentProject = (payload, fallback) => {
  const value = payload?.project || payload?.creative || payload
  if (!value || typeof value !== 'object') return fallback
  return {
    ...fallback,
    ...value,
    title: value.title || value.headline || fallback.title,
    headline: value.headline || value.title || fallback.headline,
    caption: value.caption || value.copy || fallback.caption,
    visualPrompt: value.visualPrompt || value.imagePrompt || value.prompt || fallback.visualPrompt,
    scenes: Array.isArray(value.scenes) ? value.scenes : fallback.scenes,
    source: 'agent',
  }
}

export async function buildCreativeProject({ instruction, outputType, sources, agentConfig }) {
  const fallback = fallbackProject({ instruction, outputType, sources })
  let project = fallback

  if (canUseAgentMode(agentConfig, outputType === 'video' ? 'video' : 'message')) {
    try {
      const result = await runUserAiAgent({
        agentConfig,
        mode: outputType === 'video' ? 'video' : 'message',
        prompt: instruction,
        payload: {
          task: 'Create a structured marketing creative from multiple source documents.',
          instruction,
          outputType,
          sources: sources.map(({ name, type, text }) => ({ name, type, text })),
          responseFormat: {
            title: 'string',
            headline: 'string',
            caption: 'string',
            visualPrompt: 'string',
            scenes: [{ title: 'string', direction: 'string' }],
          },
        },
      })
      project = normalizeAgentProject(result.payload, fallback)
    } catch (error) {
      project = { ...fallback, warning: `Connected agent unavailable: ${error.message}` }
    }
  }

  if (outputType === 'flyer' || outputType === 'image') {
    const image = await generatePhotoConcept({
      prompt: project.visualPrompt,
      style: 'editorial',
      aspectRatio: outputType === 'flyer' ? '4:5' : '1:1',
      referenceImageSrc: sources.find((source) => source.imageSrc)?.imageSrc || '',
      references: sources.map(({ name, type, text, imageSrc }) => ({ name, type, text, imageSrc: imageSrc || null })),
      agentConfig,
    })
    return { ...project, imageSrc: image.imageSrc, imageSource: image.source }
  }

  return project
}