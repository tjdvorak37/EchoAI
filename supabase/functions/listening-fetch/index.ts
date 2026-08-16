// Proxies the social listening connectors. Endpoints and keys are read from
// server-side secrets so they never reach the browser.
//
// The browser supplies only the source type and search terms; it can no longer
// name an arbitrary URL, which also removes an SSRF path.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const SOURCE_TYPES = ['social', 'news', 'forums', 'blogs', 'reviews', 'web']

const connectorFor = (sourceType: string) => ({
  endpoint: Deno.env.get(`LISTENING_${sourceType.toUpperCase()}_ENDPOINT`) ?? '',
  apiKey: Deno.env.get(`LISTENING_${sourceType.toUpperCase()}_API_KEY`) ?? '',
})

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

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data: userData } = await client.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!userData?.user) {
    return json({ error: 'Authentication required.' }, 401, request)
  }

  try {
    const body = await request.json()
    const requested: string[] = Array.isArray(body.sourceTypes) ? body.sourceTypes : []
    const active = requested.filter((type) => SOURCE_TYPES.includes(type))

    if (!active.length) {
      return json({ results: [], configured: [] }, 200, request)
    }

    const results = await Promise.all(
      active.map(async (sourceType) => {
        const connector = connectorFor(sourceType)
        if (!connector.endpoint) {
          return { sourceType, items: [], error: 'not configured' }
        }

        try {
          const upstream = await fetch(connector.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(connector.apiKey
                ? { Authorization: `Bearer ${connector.apiKey}`, 'x-api-key': connector.apiKey }
                : {}),
            },
            body: JSON.stringify({ ...body, sourceTypes: undefined, sourceType }),
          })

          if (!upstream.ok) {
            return { sourceType, items: [], error: `connector failed (${upstream.status})` }
          }

          const contentType = upstream.headers.get('content-type') ?? ''
          const parsed = contentType.includes('application/json')
            ? await upstream.json()
            : await upstream.text()

          return { sourceType, items: parsed, error: null }
        } catch (error) {
          return { sourceType, items: [], error: (error as Error).message }
        }
      }),
    )

    return json({
      results,
      configured: SOURCE_TYPES.filter((type) => Boolean(connectorFor(type).endpoint)),
    }, 200, request)
  } catch (error) {
    console.error('listening-fetch failed', error)
    return json({ error: 'Listening sources are unavailable right now.' }, 500, request)
  }
})
