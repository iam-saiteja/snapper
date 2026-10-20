import { z } from 'zod'

// "Today" is always India time, on the client, the server and in Postgres.
export const TIME_ZONE = 'Asia/Kolkata'

export function todayIST(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM (24h)')

export const TaskInput = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  deadline: hhmm.default('21:00'),
  quiz: z
    .object({
      questions: z.number().int().min(1).max(20).default(5),
      passScore: z.number().int().min(1).default(4),
    })
    .default({ questions: 5, passScore: 4 }),
  points: z.number().int().min(0).default(20),
  penalty: z.number().int().min(0).default(15),
})

export const ReminderInput = z.object({
  time: hhmm,
  text: z.string().min(1),
})

// Admin import format. Days are either absolute ("date") or relative to "start" ("day": 1 = start).
export const PlanImport = z
  .object({
    plan: z.string().min(1).default('Plan'),
    // Optional: blocking/sleep rules saved together with the schedule (they take effect tomorrow).
    rules: z.lazy(() => Rules).optional(),
    start: z.iso.date().optional(),
    days: z
      .array(
        z.object({
          day: z.number().int().min(1).optional(),
          date: z.iso.date().optional(),
          tasks: z.array(TaskInput).default([]),
          reminders: z.array(ReminderInput).default([]),
        }),
      )
      .default([]),
  })
  .superRefine((p, ctx) => {
    p.days.forEach((d, i) => {
      if (!d.date && !(d.day && p.start)) {
        ctx.addIssue({ code: 'custom', path: ['days', i], message: 'needs "date", or "day" plus a top-level "start"' })
      }
    })
  })

export type PlanImport = z.infer<typeof PlanImport>

export function resolveDayDate(plan: PlanImport, d: PlanImport['days'][number]): string {
  return d.date ?? addDays(plan.start!, d.day! - 1)
}

export const BlockedApp = z.object({
  package: z.string(),
  name: z.string(),
  costPer15Min: z.number().int().min(1),
  // Even while the app is unlocked, Shorts/Reels stay blocked unless this is true.
  allowShortsWhenUnlocked: z.boolean().default(false),
})

// Android app categories as detected on the phone. "payments" = apps that can open UPI payment links.
export const AppCategory = z.enum(['social', 'video', 'games', 'audio', 'image', 'news', 'maps', 'productivity', 'payments'])
export type AppCategory = z.infer<typeof AppCategory>

export const Weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
const ALL_DAYS = Weekday.options

export const SleepWindow = z.object({
  start: hhmm,
  end: hhmm,
  // The days on which the window *starts* (23:00 Fri → 06:30 Sat is a "fri" window).
  days: z.array(Weekday).default([...ALL_DAYS]),
})

export const Sleep = z.object({
  windows: z.array(SleepWindow).default([]),
  // Allowed during sleep on top of calls, clock/alarms, keyboard and the home screen.
  allowApps: z.array(z.string()).default([]),
  // Chrome is allowed only while it shows one of these sites (host or URL).
  allowWebsites: z.array(z.string()).default([]),
})
export type Sleep = z.infer<typeof Sleep>

export const Rules = z.object({
  blocked: z.array(BlockedApp).default([]),
  // Locked while the point balance is below zero.
  penaltyLock: z.array(z.object({ package: z.string(), name: z.string() })).default([]),
  // Every installed app in these categories is blocked like "blocked" (unlock with points).
  blockCategories: z.array(AppCategory).default([]),
  categoryCostPer15Min: z.number().int().min(1).default(10),
  // Every installed app in these categories is locked while points are below zero.
  penaltyLockCategories: z.array(AppCategory).default([]),
  // Never matched by blockCategories / penaltyLockCategories.
  exceptApps: z.array(z.string()).default([]),
  sleep: Sleep.default({ windows: [], allowApps: [], allowWebsites: [] }),
  // Content filter: the phone stays locked until Private DNS is set to this host, and that setting is locked.
  dns: z
    .object({ lock: z.boolean().default(false), host: z.string().min(3).default('family.adguard-dns.com') })
    .default({ lock: false, host: 'family.adguard-dns.com' }),
  violationPenalty: z.number().int().min(0).default(50),
  maxQuizAttemptsPerTask: z.number().int().min(1).default(3),
  emergency: z
    .object({
      maxMinutes: z.number().int().min(1).max(120).default(20),
      maxPerWeek: z.number().int().min(0).default(3),
    })
    .default({ maxMinutes: 20, maxPerWeek: 3 }),
})

export type Rules = z.infer<typeof Rules>

export const DEFAULT_RULES: Rules = {
  blocked: [
    { package: 'com.instagram.android', name: 'Instagram', costPer15Min: 10, allowShortsWhenUnlocked: false },
    { package: 'com.google.android.youtube', name: 'YouTube', costPer15Min: 10, allowShortsWhenUnlocked: false },
  ],
  penaltyLock: [
    { package: 'com.phonepe.app', name: 'PhonePe' },
    { package: 'com.dreamplug.androidapp', name: 'CRED' },
    { package: 'com.google.android.apps.nbu.paisa.user', name: 'Google Pay' },
    { package: 'net.one97.paytm', name: 'Paytm' },
  ],
  blockCategories: ['social'],
  categoryCostPer15Min: 10,
  penaltyLockCategories: ['payments'],
  exceptApps: ['com.whatsapp', 'com.whatsapp.w4b'],
  sleep: { windows: [], allowApps: [], allowWebsites: [] },
  dns: { lock: false, host: 'family.adguard-dns.com' },
  violationPenalty: 50,
  maxQuizAttemptsPerTask: 3,
  emergency: { maxMinutes: 20, maxPerWeek: 3 },
}

// Pseudo-packages for AI-reviewed unlocks of sleep mode and the DNS lock (never unlockable with points).
export const SLEEP_UNLOCK = 'snapper:sleep'
export const DNS_UNLOCK = 'snapper:dns'

// What the native blocker needs. Built on the server so the phone can't compute its own way out.
export type DeviceState = {
  serverTime: number
  balance: number
  blocked: { package: string; name: string; costPer15Min: number; allowShortsWhenUnlocked: boolean }[]
  penaltyLocked: { package: string; name: string }[]
  blockCategories: AppCategory[]
  categoryCostPer15Min: number
  // Only non-empty while the balance is below zero.
  penaltyLockedCategories: AppCategory[]
  // What locks when the balance goes below zero (for display).
  penaltyLockConfigured: { apps: { package: string; name: string }[]; categories: AppCategory[] }
  exceptApps: string[]
  sleep: Sleep
  dns: { lock: boolean; host: string }
  // User's own blocks from the Apps tab. 'soft' = removable; 'until_tasks' = blocked while tasks pending.
  appBlocks: { package: string; name: string; mode: 'soft' | 'until_tasks' }[]
  pendingTasksToday: number
  unlocks: { package: string; endsAt: number }[]
  reminders: { id: string; at: number; text: string }[]
}
