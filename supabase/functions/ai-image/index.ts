// Proxies image generation so the provider key stays server-side. The key was
// previously a VITE_ variable, which meant it shipped inside the JS bundle and
// any visitor could read and spend it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const ENDPOINT = Deno.env.get('IMAGE_GEN_ENDPOINT') ?? ''
const API_KEY = Deno.env.get('IMAGE_GEN_API_KEY') ?? ''
const MODEL = Deno.env.get('IMAGE_GEN_MODEL') ?? 'image-1'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, request)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Authentication required.' }, 401, request)
  }

  // Only signed-in customers may spend generation credits.
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data: userData } = await client.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!userData?.user) {
    return json({ error: 'Authentication required.' }, 401, request)
  }

  if (!ENDPOINT) {
    return json({ error: 'No image provider is configured.' }, 503, request)
  }

  try {
    const { prompt, style, aspectRatio, referenceImageSrc } = await request.json()

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return json({ error: 'A prompt is required.' }, 400, request)
    }

    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify({
        prompt: prompt.slice(0, 2000),
        style,
        aspectRatio,
        model: MODEL,
        referenceImageSrc: referenceImageSrc || null,
      }),
    })

    if (!upstream.ok) {
      return json({ error: `Image generation failed (${upstream.status})` }, 502, request)
    }

    return json(await upstream.json(), 200, request)
  } catch (error) {
    console.error('ai-image failed', error)
    return json({ error: 'Image generation is unavailable right now.' }, 500, request)
  }
})
