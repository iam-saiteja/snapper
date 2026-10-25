import { z } from 'zod'
import { aiJson } from '../../lib/ai'
import { body, db, handler, HttpError, maybe, must, requireUser } from '../../lib/core'

const Generated = z.object({ question: z.string().min(5), keyPoints: z.string() })

// A fresh question about a ringing reminder. Answering it acknowledges the reminder.
export const POST = handler(async (ctx) => {
  const userId = await requireUser(ctx)
  const { reminderId } = await body(ctx, z.object({ reminderId: z.uuid() }))
  const sb = db(ctx.env)

  const reminder = maybe(
    await sb.from('reminders').select('id, text, acked_at').eq('id', reminderId).eq('user_id', userId).maybeSingle(),
  )
  if (!reminder) throw new HttpError(404, 'reminder not found')
  if (reminder.acked_at) return { acknowledged: true }

  const asked = must(
    await sb.from('reminder_acks').select('question').eq('reminder_id', reminderId).order('created_at', { ascending: false }).limit(10),
  ).map((a) => a.question)

  const gen = await aiJson(
    ctx.env,
    'A reminder just rang on the user\'s phone. Ask ONE short, easy question that proves they are awake and ' +
      'have read this reminder, answerable by voice in a few words: what they are about to do, when, or their ' +
      'first step. It is a check-in, not a quiz: no technical detail is needed to answer it. Never a yes/no ' +
      'question. Make it different every time. ' +
      'Return JSON: {"question":"the question","keyPoints":"what a genuine answer should address"}',
    `Reminder: ${reminder.text}\nNonce: ${crypto.randomUUID().slice(0, 8)}\n` +
      (asked.length ? `Do NOT repeat these earlier questions:\n- ${asked.join('\n- ')}` : ''),
    Generated,
  )

  const ack = must(
    await sb
      .from('reminder_acks')
      .insert({ user_id: userId, reminder_id: reminderId, question: gen.question, key_points: gen.keyPoints })
      .select('id')
      .single(),
  )
  return { acknowledged: false, ackId: ack.id, question: gen.question, reminder: reminder.text }
})
