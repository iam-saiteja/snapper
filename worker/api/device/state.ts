import { DNS_UNLOCK } from '../../../shared/schema'
import { HttpError, addPoints, buildDeviceState, db, getRules, handler, maybe, must, ok, sha256Hex, type Db } from '../../lib/core'

// Called by the native background sync every few minutes. Reports whether the blocker (accessibility service)
// is still on and which Private DNS host is set; turning either off costs points.
export const GET = handler(async (ctx) => {
  const token = ctx.request.headers.get('x-device-token')
  if (!token) throw new HttpError(401, 'missing device token')
  const sb = db(ctx.env)
  const device = maybe(
    await sb
      .from('devices')
      .select('id, user_id, a11y_enabled, dns_ok_host')
      .eq('token_hash', await sha256Hex(token))
      .maybeSingle(),
  )
  if (!device) throw new HttpError(401, 'unknown device')

  const params = new URL(ctx.request.url).searchParams
  const a11y = params.get('a11y') !== '0'
  const rules = await getRules(sb, device.user_id)
  if (device.a11y_enabled && !a11y) {
    await violation(sb, device.user_id, 'blocker_disabled', rules.violationPenalty, 'blocker was turned off')
  }

  // DNS: compare the host the phone actually has against the host the rules require *now*. Older app
  // versions only send dns=1/0 (matching their cached host), which is the best available signal for them.
  const requiredHost = rules.dns.host.toLowerCase()
  const reportedHost = params.get('dnsHost')
  const dnsOk = reportedHost !== null ? reportedHost.trim().toLowerCase() === requiredHost : params.get('dns') === '1'
  const authorizedChange = await hasActiveUnlock(sb, device.user_id, DNS_UNLOCK)
  // Penalise only a phone that was verified on this exact host and then moved away, outside an
  // AI-approved DNS unlock. Changing dns.host in the rules, or an approved change, is never a violation.
  if (rules.dns.lock && device.dns_ok_host === requiredHost && !dnsOk && !authorizedChange) {
    await violation(sb, device.user_id, 'dns_changed', rules.violationPenalty, 'Private DNS was changed')
  }

  ok(
    await sb
      .from('devices')
      .update({
        a11y_enabled: a11y,
        dns_ok: dnsOk,
        // Cleared whenever it isn't compliant, so a missed or authorised change is penalised at most once
        // and only re-armed after the phone is verified on the required host again.
        dns_ok_host: rules.dns.lock && dnsOk ? requiredHost : null,
        last_seen: new Date().toISOString(),
      })
      .eq('id', device.id),
  )
  return buildDeviceState(sb, device.user_id)
})

async function hasActiveUnlock(sb: Db, userId: string, pkg: string): Promise<boolean> {
  const rows = must(
    await sb.from('unlocks').select('id').eq('user_id', userId).eq('package', pkg).gt('ends_at', new Date().toISOString()).limit(1),
  )
  return rows.length > 0
}

async function violation(sb: Db, userId: string, kind: string, penalty: number, reason: string) {
  ok(await sb.from('violations').insert({ user_id: userId, kind }))
  if (penalty > 0) await addPoints(sb, userId, -penalty, reason)
}
