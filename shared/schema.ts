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
    plan: z.string().min(1),
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
      .min(1),
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

export const Rules = z.object({
  blocked: z.array(BlockedApp),
  // Locked while the point balance is below zero.
  penaltyLock: z.array(z.object({ package: z.string(), name: z.string() })),
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
  violationPenalty: 50,
  maxQuizAttemptsPerTask: 3,
  emergency: { maxMinutes: 20, maxPerWeek: 3 },
}

// What the native blocker needs. Built on the server so the phone can't compute its own way out.
export type DeviceState = {
  serverTime: number
  balance: number
  blocked: { package: string; name: string; costPer15Min: number; allowShortsWhenUnlocked: boolean }[]
  penaltyLocked: { package: string; name: string }[]
  unlocks: { package: string; endsAt: number }[]
  reminders: { id: string; at: number; text: string }[]
}
