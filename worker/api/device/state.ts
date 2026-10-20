import { HttpError, addPoints, buildDeviceState, db, getRules, handler, maybe, ok, sha256Hex, type Db } from '../../lib/core'

// Called by the native background worker every ~15 minutes. Reports whether the
// blocker (accessibility service) is still on and whether Private DNS is set; turning either off costs points.
export const GET = handler(async (ctx) => {
  const token = ctx.request.headers.get('x-device-token')
  if (!token) throw new HttpError(401, 'missing device token')
  const sb = db(ctx.env)
  const device = maybe(
    await sb.from('devices').select('id, user_id, a11y_enabled, dns_ok').eq('token_hash', await sha256Hex(token)).maybeSingle(),
  )
  if (!device) throw new HttpError(401, 'unknown device')

  const params = new URL(ctx.request.url).searchParams
  const a11y = params.get('a11y') !== '0'
  const dnsOk = params.get('dns') === '1'
  const rules = await getRules(sb, device.user_id)
  if (device.a11y_enabled && !a11y) await violation(sb, device.user_id, 'blocker_disabled', rules.violationPenalty, 'blocker was turned off')
  // Only a change away from a correctly set DNS counts; a phone that never had it set is just locked.
  if (rules.dns.lock && device.dns_ok && !dnsOk) {
    await violation(sb, device.user_id, 'dns_changed', rules.violationPenalty, 'Private DNS was changed')
  }
  ok(
    await sb
      .from('devices')
      .update({ a11y_enabled: a11y, dns_ok: dnsOk, last_seen: new Date().toISOString() })
      .eq('id', device.id),
  )
  return buildDeviceState(sb, device.user_id)
})

async function violation(sb: Db, userId: string, kind: string, penalty: number, reason: string) {
  ok(await sb.from('violations').insert({ user_id: userId, kind }))
  if (penalty > 0) await addPoints(sb, userId, -penalty, reason)
}
