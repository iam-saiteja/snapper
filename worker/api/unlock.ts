import { z } from 'zod'
import { SLEEP_UNLOCK } from '../../shared/schema'
import { addPoints, body, buildDeviceState, db, getBalance, getRules, handler, HttpError, maybe, must, requireUser } from '../lib/core'

export const POST = handler(async (ctx) => {
  const userId = await requireUser(ctx)
  const { package: pkg, minutes, name } = await body(
    ctx,
    z.object({
      package: z.string().min(1).max(200),
      name: z.string().max(100).optional(),
      minutes: z.number().int().refine((m) => m > 0 && m <= 120 && m % 15 === 0),
    }),
  )
  // Sleep mode and Settings only open through an AI-reviewed emergency, never with points.
  if (pkg === SLEEP_UNLOCK || pkg === 'com.android.settings') throw new HttpError(400, 'use an emergency request for this')
  const sb = db(ctx.env)
  const rules = await getRules(sb, userId)
  const explicit = rules.blocked.find((b) => b.package === pkg)
  // Category-blocked apps are detected on the phone, so the server can't list them; any package
  // not excepted may be unlocked at the category price (unlocking a non-blocked app gains nothing).
  const byCategory = !explicit && rules.blockCategories.length > 0 && !rules.exceptApps.includes(pkg)
  if (!explicit && !byCategory) throw new HttpError(400, 'that app cannot be unlocked with points')
  const app = { name: explicit?.name ?? name ?? pkg, costPer15Min: explicit?.costPer15Min ?? rules.categoryCostPer15Min }

  const cost = app.costPer15Min * (minutes / 15)
  const balance = await getBalance(sb, userId)
  if (balance < cost) throw new HttpError(402, `need ${cost} points, you have ${balance}`)

  // Extend from the end of any running unlock instead of overlapping it.
  const running = maybe(
    await sb
      .from('unlocks')
      .select('ends_at')
      .eq('user_id', userId)
      .eq('package', pkg)
      .gt('ends_at', new Date().toISOString())
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
  const start = running ? new Date(running.ends_at) : new Date()
  const unlock = must(
    await sb
      .from('unlocks')
      .insert({
        user_id: userId,
        package: pkg,
        kind: 'points',
        cost,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
      })
      .select('id')
      .single(),
  )
  await addPoints(sb, userId, -cost, `unlock ${app.name} ${minutes}m`, unlock.id)
  return buildDeviceState(sb, userId)
})
