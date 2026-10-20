import { z } from 'zod'
import { addPoints, body, buildDeviceState, db, getBalance, getRules, handler, HttpError, maybe, must, requireUser } from '../_lib/core'

export const onRequestPost = handler(async (ctx) => {
  const userId = await requireUser(ctx)
  const { package: pkg, minutes } = await body(
    ctx,
    z.object({ package: z.string(), minutes: z.number().int().refine((m) => m > 0 && m <= 120 && m % 15 === 0) }),
  )
  const sb = db(ctx.env)
  const app = (await getRules(sb, userId)).blocked.find((b) => b.package === pkg)
  if (!app) throw new HttpError(400, 'that app cannot be unlocked with points')

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
