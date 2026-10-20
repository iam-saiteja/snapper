import { addDays, todayIST, type Rules } from '../../shared/schema'
import { getBalance, must, type Db } from './core'

const istDay = (ts: string) => todayIST(new Date(ts))
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/**
 * Everything the unlock AI should know about the user before deciding: past requests and their outcomes,
 * rule violations, task record, points and what is locked. Plain text, newest first. This is what lets it
 * say things like "you asked for this two days ago and it was refused" or "you broke the DNS rule last week".
 */
export async function historyContext(sb: Db, userId: string, rules: Rules): Promise<string> {
  const today = todayIST()
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString()
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString()
  const [balance, requests, violations, tasks, ledger] = await Promise.all([
    getBalance(sb, userId),
    must(
      await sb
        .from('emergencies')
        .select('package, explanation, approved, minutes, reason, created_at')
        .eq('user_id', userId)
        .gt('created_at', since30)
        .order('created_at', { ascending: false })
        .limit(25),
    ),
    must(
      await sb
        .from('violations')
        .select('kind, created_at')
        .eq('user_id', userId)
        .gt('created_at', since30)
        .order('created_at', { ascending: false }),
    ),
    must(
      await sb
        .from('tasks')
        .select('task_date, title, status')
        .eq('user_id', userId)
        .gte('task_date', addDays(today, -14))
        .lte('task_date', today)
        .order('task_date', { ascending: false }),
    ),
    must(await sb.from('points_ledger').select('delta').eq('user_id', userId).gt('created_at', since7)),
  ])

  const done = tasks.filter((t) => t.status === 'done').length
  const missed = tasks.filter((t) => t.status === 'missed').length
  const weekPoints = ledger.reduce((s, l) => s + l.delta, 0)

  const lines = [
    `Today: ${today} (India time). Point balance: ${balance}. Points change in the last 7 days: ${weekPoints >= 0 ? '+' : ''}${weekPoints}.`,
    `Tasks in the last 14 days: ${done} completed, ${missed} missed, ${tasks.length} total.`,
  ]

  if (violations.length) {
    const counts = violations.reduce<Record<string, { n: number; last: string }>>((acc, v) => {
      acc[v.kind] ??= { n: 0, last: v.created_at }
      acc[v.kind].n++
      return acc
    }, {})
    lines.push(
      'Rule violations in the last 30 days: ' +
        Object.entries(counts)
          .map(([kind, { n, last }]) => `${describeViolation(kind)} ×${n} (most recent ${istDay(last)})`)
          .join('; ') +
        '.',
    )
  } else {
    lines.push('No rule violations in the last 30 days.')
  }

  if (requests.length) {
    lines.push('Past unlock requests (newest first):')
    for (const r of requests) {
      lines.push(
        `- ${istDay(r.created_at)} · ${r.package} · ${r.approved ? `APPROVED ${r.minutes}m` : 'REFUSED'} · ` +
          `they said: "${clip(r.explanation, 160)}"` +
          (r.reason ? ` · decision: ${clip(r.reason, 120)}` : ''),
      )
    }
  } else {
    lines.push('No unlock requests in the last 30 days.')
  }

  lines.push(
    `DNS content filter (${rules.dns.host}): ${rules.dns.lock ? 'ON' : 'off'}. ` +
      `Sleep windows configured: ${rules.sleep.windows.length}.`,
  )
  return lines.join('\n')
}

function describeViolation(kind: string): string {
  if (kind === 'blocker_disabled') return 'turned the blocker off'
  if (kind === 'dns_changed') return 'changed the content-filter DNS'
  return kind
}
