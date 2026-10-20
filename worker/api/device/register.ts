import { db, handler, ok, requireUser, sha256Hex } from '../../lib/core'

// Gives the phone's background worker a long-lived token that can only read blocker state.
export const POST = handler(async (ctx) => {
  const userId = await requireUser(ctx)
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  ok(await db(ctx.env).from('devices').insert({ user_id: userId, token_hash: await sha256Hex(token) }))
  return { token }
})
