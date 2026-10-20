import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_RULES, Rules, todayIST, type DeviceState } from '../../shared/schema'

export interface Env {
  GEMINI_API: string
  GROQ_API: string
  SUPABASE_SECRET_KEY: string
  SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_URL?: string
  GEMINI_MODEL?: string
  GROQ_MODEL?: string
}

// Untyped schema: rows are validated where it matters (zod) rather than generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any>

export type Ctx = { request: Request; env: Env }
export type Route = (ctx: Ctx) => Promise<Response>

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export function handler(fn: (ctx: Ctx) => Promise<unknown>): Route {
  return async (ctx) => {
    try {
      const out = await fn(ctx)
      return out instanceof Response ? out : json(out)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      console.error(e)
      return json({ error: 'server error' }, 500)
    }
  }
}

export async function body<T>(ctx: Ctx, schema: { parse(v: unknown): T }): Promise<T> {
  try {
    return schema.parse(await ctx.request.json())
  } catch {
    throw new HttpError(400, 'bad request body')
  }
}

export function db(env: Env): Db {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || !env.SUPABASE_SECRET_KEY) throw new Error('Supabase env not configured')
  return createClient<any>(url, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function requireUser(ctx: Ctx): Promise<string> {
  const token = ctx.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'not signed in')
  const { data, error } = await db(ctx.env).auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'not signed in')
  return data.user.id
}

type Result = { data: unknown; error: { message: string } | null }

/** Unwrap a Supabase result that must have data. */
export function must<R extends Result>(res: R): NonNullable<R['data']> {
  if (res.error) throw new Error(res.error.message)
  if (res.data == null) throw new Error('no data')
  return res.data as NonNullable<R['data']>
}

/** Unwrap a `.maybeSingle()` result. */
export function maybe<R extends Result>(res: R): R['data'] {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Check a write that returns no rows. */
export function ok(res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message)
}

export async function getRules(sb: Db, userId: string): Promise<Rules> {
  const row = maybe(
    await sb
      .from('rules')
      .select('rules')
      .eq('user_id', userId)
      .lte('effective_date', todayIST())
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
  const parsed = Rules.safeParse(row?.rules)
  return parsed.success ? parsed.data : DEFAULT_RULES
}

export async function getBalance(sb: Db, userId: string): Promise<number> {
  return must(await sb.rpc('point_balance', { uid: userId })) as number
}

export async function addPoints(sb: Db, userId: string, delta: number, reason: string, ref?: string) {
  ok(await sb.from('points_ledger').insert({ user_id: userId, delta, reason, ref }))
}

export async function buildDeviceState(sb: Db, userId: string): Promise<DeviceState> {
  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 3600_000)
  const [rules, balance, unlocks, reminders] = await Promise.all([
    getRules(sb, userId),
    getBalance(sb, userId),
    sb.from('unlocks').select('package, ends_at').eq('user_id', userId).gt('ends_at', now.toISOString()),
    sb
      .from('reminders')
      .select('id, remind_at, text')
      .eq('user_id', userId)
      .gt('remind_at', now.toISOString())
      .lt('remind_at', in48h.toISOString()),
  ])
  return {
    serverTime: now.getTime(),
    balance,
    blocked: rules.blocked,
    penaltyLocked: balance < 0 ? rules.penaltyLock : [],
    blockCategories: rules.blockCategories,
    categoryCostPer15Min: rules.categoryCostPer15Min,
    penaltyLockedCategories: balance < 0 ? rules.penaltyLockCategories : [],
    penaltyLockConfigured: { apps: rules.penaltyLock, categories: rules.penaltyLockCategories },
    exceptApps: rules.exceptApps,
    sleep: rules.sleep,
    dns: rules.dns,
    unlocks: must(unlocks).map((u) => ({ package: u.package, endsAt: Date.parse(u.ends_at) })),
    reminders: must(reminders).map((r) => ({ id: r.id, at: Date.parse(r.remind_at), text: r.text })),
  }
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
