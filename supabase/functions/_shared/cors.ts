const appUrl = Deno.env.get('APP_URL') ?? ''
const localhostOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://localhost:5173',
  'https://localhost:5174',
  'https://127.0.0.1:5173',
  'https://127.0.0.1:5174',
])

const isAllowedOrigin = (origin: string | null) => {
  if (!origin) return true
  if (appUrl && origin === appUrl) return true
  // Accept the apex and www forms of the configured domain interchangeably.
  if (appUrl && origin === appUrl.replace('://www.', '://')) return true
  if (appUrl && origin === appUrl.replace('://', '://www.')) return true
  if (localhostOrigins.has(origin)) return true
  return /^https?:\/\/.*\.app\.github\.dev$/.test(origin)
}

export const getCorsHeaders = (request?: Request) => {
  const origin = request?.headers.get('Origin') ?? null
  const allowedOrigin = isAllowedOrigin(origin) ? (origin ?? appUrl ?? '*') : (appUrl || '*')

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export const corsHeaders = getCorsHeaders()

export const json = (body: unknown, status = 200, request?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
  })
