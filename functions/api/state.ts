import { buildDeviceState, db, handler, requireUser } from '../_lib/core'

export const onRequestGet = handler(async (ctx) => {
  const userId = await requireUser(ctx)
  return buildDeviceState(db(ctx.env), userId)
})
