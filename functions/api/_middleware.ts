import type { Env } from '../_lib/core'

// Auth is bearer-token only (no cookies), so a wildcard origin is safe and lets the
// Capacitor app (https://localhost) call these endpoints.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-device-token',
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const res = await ctx.next()
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
  return out
}
