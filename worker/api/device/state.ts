import { HttpError, addPoints, buildDeviceState, db, getRules, handler, maybe, ok, sha256Hex } from '../../lib/core'

// Called by the native background worker every ~15 minutes. Reports whether the
// blocker (accessibility service) is still on; switching it off costs points.
export const GET = handler(async (ctx) => {
  const token = ctx.request.headers.get('x-device-token')
  if (!token) throw new HttpError(401, 'missing device token')
  const sb = db(ctx.env)
  const device = maybe(
    await sb.from('devices').select('id, user_id, a11y_enabled').eq('token_hash', await sha256Hex(token)).maybeSingle(),
  )
  if (!device) throw new HttpError(401, 'unknown device')

  const a11y = new URL(ctx.request.url).searchParams.get('a11y') !== '0'
  if (device.a11y_enabled && !a11y) {
    const rules = await getRules(sb, device.user_id)
    ok(await sb.from('violations').insert({ user_id: device.user_id, kind: 'blocker_disabled' }))
    if (rules.violationPenalty > 0) await addPoints(sb, device.user_id, -rules.violationPenalty, 'blocker was turned off')
  }
  ok(await sb.from('devices').update({ a11y_enabled: a11y, last_seen: new Date().toISOString() }).eq('id', device.id))
  return buildDeviceState(sb, device.user_id)
})
