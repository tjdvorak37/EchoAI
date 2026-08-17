import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { getCorsHeaders, json } from '../_shared/cors.ts'

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, request)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401, request)

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false } },
  )
  const { data } = await client.auth.getUser(authorization.slice('Bearer '.length))
  if (!data.user) return json({ error: 'Authentication required.' }, 401, request)

  const body = await request.json().catch(() => ({}))
  if (body.action !== 'delete') return json({ error: 'Unsupported account action.' }, 400, request)

  const { error } = await admin().auth.admin.deleteUser(data.user.id)
  if (error) return json({ error: 'Unable to delete your account.' }, 500, request)
  return json({ deleted: true }, 200, request)
})
