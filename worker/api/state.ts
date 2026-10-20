import { buildDeviceState, db, handler, requireUser } from '../lib/core'

export const GET = handler(async (ctx) => {
  const userId = await requireUser(ctx)
  return buildDeviceState(db(ctx.env), userId)
})
