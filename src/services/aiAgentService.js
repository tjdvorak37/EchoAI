import { isSupabaseConfigured, supabase } from '../lib/supabase'

const parseResponsePayload = async (response) => {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

export const AGENT_CAPABILITIES = [
  { key: 'message', title: 'Writing & strategy', description: 'Copy, captions, scripts, planning, and campaign reasoning.' },
  { key: 'document', title: 'Document intelligence', description: 'Extract, compare, summarize, and ground work in supplied files.' },
  { key: 'image', title: 'Image generation', description: 'Create original campaign images from prompts and references.' },
  { key: 'image_edit', title: 'Generative image editing', description: 'Inpaint, outpaint, remove objects, replace backgrounds, and restore.' },
  { key: 'character', title: 'Characters & personas', description: 'Create reusable character sheets and maintain visual identity.' },
  { key: 'video', title: 'Video generation', description: 'Generate storyboards, text-to-video, and image-to-video scenes.' },
  { key: 'audio', title: 'Audio & voice', description: 'Voiceover, transcription, captions, sound, and speech workflows.' },
  { key: 'vision', title: 'Visual understanding', description: 'Analyze uploaded images and video frames for content and quality.' },
  { key: 'moderation', title: 'Safety review', description: 'Review generated text and media before it enters a project.' },
]

export const DEFAULT_AGENT_CAPABILITIES = AGENT_CAPABILITIES.map((item) => item.key)

const CAPABILITY_ALIASES = {
  copy: 'message',
  script: 'message',
  storyboard: 'video',
  image_generation: 'image',
  image_editing: 'image_edit',
  persona: 'character',
  character_generation: 'character',
  video_generation: 'video',
  speech: 'audio',
  transcription: 'audio',
}

const resolveCapability = (mode) => CAPABILITY_ALIASES[mode] || mode

const createRequestId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const normalizeSuggestions = (payload, prompt) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload?.suggestions) {
    return payload.suggestions
  }

  if (payload?.copy && payload?.image) {
    return [{ title: payload.title || 'Agent output', copy: payload.copy, image: payload.image }]
  }

  if (typeof payload === 'string' && payload.trim()) {
    return [{ title: 'Agent output', copy: payload.trim(), image: `Custom agent suggestion for: ${prompt.slice(0, 40)}` }]
  }

  return []
}

export const canUseAgentMode = (agentConfig, mode) => {
  if (!agentConfig?.enabled || !agentConfig?.endpoint) {
    return false
  }

  if (!Array.isArray(agentConfig.capabilities) || agentConfig.capabilities.length === 0) {
    return true
  }

  const capability = resolveCapability(mode)
  return agentConfig.capabilities.includes(capability) || agentConfig.capabilities.includes(mode)
}

export const runUserAiAgent = async ({ agentConfig, mode, payload, prompt, persona, output }) => {
  if (!canUseAgentMode(agentConfig, mode)) {
    return { usedAgent: false, payload: null }
  }

  const requestBody = {
    contractVersion: '2.0',
    requestId: createRequestId(),
    mode,
    capability: resolveCapability(mode),
    model: agentConfig.model || 'default',
    provider: agentConfig.provider || 'custom_router',
    connectionId: agentConfig.connectionId || null,
    agentName: agentConfig.name || 'My AI Agent',
    capabilities: agentConfig.capabilities || [],
    routing: agentConfig.routing || { strategy: 'best_quality', allowFallback: true },
    persona: persona || null,
    output: output || null,
    ...payload,
  }

  if (isSupabaseConfigured) {
    const { data, error } = await supabase.functions.invoke('inhouse-ai', { body: requestBody })
    if (error) {
      const detail = await error.context?.json?.().catch(() => null)
      throw new Error(detail?.error || detail?.detail?.error?.message || error.message)
    }
    return {
      usedAgent: true,
      payload: data,
      suggestions: normalizeSuggestions(data, prompt || payload?.prompt || ''),
    }
  }

  let response
  try {
    response = await fetch(agentConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agentConfig.apiKey ? { Authorization: `Bearer ${agentConfig.apiKey}` } : {}),
      },
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('The AI endpoint could not be reached from this browser. Check HTTPS and CORS. The endpoint must allow this EchoAI origin and respond to OPTIONS preflight requests; a provider website URL cannot be used directly.', { cause: error })
    }
    throw error
  }

  if (!response.ok) {
    throw new Error(`AI agent sync failed (${response.status})`)
  }

  const parsed = await parseResponsePayload(response)
  return {
    usedAgent: true,
    payload: parsed,
    suggestions: normalizeSuggestions(parsed, prompt || payload?.prompt || ''),
  }
}

const readMediaItem = (payload, kind) => {
  if (!payload) return null
  const directUrl = payload[`${kind}Url`] || payload.url
  const directData = payload[`${kind}Src`] || payload.dataUrl
  const base64 = payload[`${kind}Base64`]
  if (directData) return { kind, src: directData, mime: payload.mime || `${kind}/png` }
  if (base64) return { kind, src: `data:${payload.mime || `${kind}/png`};base64,${base64}`, mime: payload.mime || `${kind}/png` }
  if (directUrl) return { kind, src: directUrl, mime: payload.mime || '' }
  return null
}

export const normalizeAgentOutput = (payload) => {
  if (!payload) return { text: '', media: [], raw: payload }
  if (typeof payload === 'string') return { text: payload, media: [], raw: payload }

  const media = []
  ;['image', 'video', 'audio'].forEach((kind) => {
    const item = readMediaItem(payload, kind)
    if (item) media.push(item)
  })
  if (Array.isArray(payload.media)) {
    payload.media.forEach((item) => {
      if (item?.url || item?.src || item?.dataUrl) {
        media.push({ kind: item.kind || item.type || 'file', src: item.src || item.dataUrl || item.url, mime: item.mime || '' })
      }
    })
  }

  return {
    text: payload.text || payload.copy || payload.caption || payload.summary || '',
    title: payload.title || '',
    media,
    scenes: Array.isArray(payload.scenes) ? payload.scenes : [],
    persona: payload.persona || payload.character || null,
    usage: payload.usage || null,
    raw: payload,
  }
}

export const runCreativeAgentJob = async ({ agentConfig, capability, prompt, persona, references = [], settings = {} }) => {
  if (!prompt?.trim()) throw new Error('Describe what the in-house AI should create.')
  if (!canUseAgentMode(agentConfig, capability)) {
    throw new Error(`Enable the ${resolveCapability(capability)} capability before running this job.`)
  }

  const result = await runUserAiAgent({
    agentConfig,
    mode: capability,
    prompt,
    persona,
    output: settings,
    payload: {
      prompt: prompt.trim(),
      references: references.map(({ name, type, previewUrl, summary }) => ({
        name,
        type,
        url: previewUrl || null,
        summary: summary || '',
      })),
      task: 'Create production-ready media and return editable metadata when supported.',
    },
  })

  return { ...normalizeAgentOutput(result.payload), usedAgent: result.usedAgent }
}
