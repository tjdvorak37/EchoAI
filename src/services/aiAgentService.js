const parseResponsePayload = async (response) => {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
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

  return agentConfig.capabilities.includes(mode)
}

export const runUserAiAgent = async ({ agentConfig, mode, payload, prompt }) => {
  if (!canUseAgentMode(agentConfig, mode)) {
    return { usedAgent: false, payload: null }
  }

  const response = await fetch(agentConfig.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(agentConfig.apiKey ? { Authorization: `Bearer ${agentConfig.apiKey}` } : {}),
    },
    body: JSON.stringify({
      mode,
      model: agentConfig.model || 'default',
      agentName: agentConfig.name || 'My AI Agent',
      capabilities: agentConfig.capabilities || [],
      ...payload,
    }),
  })

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
