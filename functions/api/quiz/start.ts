import { z } from 'zod'
import { todayIST } from '../../../shared/schema'
import { aiJson } from '../../_lib/ai'
import { body, db, getRules, handler, HttpError, maybe, must, requireUser } from '../../_lib/core'

const Generated = z.object({ questions: z.array(z.object({ q: z.string(), answer: z.string() })).min(1) })

export const onRequestPost = handler(async (ctx) => {
  const userId = await requireUser(ctx)
  const { taskId } = await body(ctx, z.object({ taskId: z.uuid() }))
  const sb = db(ctx.env)

  const task = maybe(await sb.from('tasks').select('*').eq('id', taskId).eq('user_id', userId).maybeSingle())
  if (!task) throw new HttpError(404, 'task not found')
  if (task.task_date !== todayIST()) throw new HttpError(400, 'you can only take quizzes for today\'s tasks')
  if (task.status !== 'pending') throw new HttpError(400, `task is already ${task.status}`)

  const quizzes = must(await sb.from('quizzes').select('id, questions, answers, status').eq('task_id', taskId))
  const open = quizzes.find((q) => q.status === 'open')
  if (open) return publicQuiz(open)

  const rules = await getRules(sb, userId)
  if (quizzes.length >= rules.maxQuizAttemptsPerTask) {
    throw new HttpError(403, `no quiz attempts left for this task (max ${rules.maxQuizAttemptsPerTask})`)
  }

  const previous = quizzes.flatMap((q) => (q.questions as { q: string }[]).map((x) => x.q))
  const gen = await aiJson(
    ctx.env,
    `You are a strict examiner checking whether a student really studied today. Write exactly ${task.quiz_questions} ` +
      'short-answer questions that can be read aloud and answered by voice in one or two sentences. ' +
      'Test understanding (why/how/when, small worked examples), not trivia. Mix easy and hard. ' +
      'Return JSON: {"questions":[{"q":"question","answer":"the key points a correct answer must contain"}]}',
    `Task: ${task.title}\nTopic: ${task.topic}\n` +
      (previous.length ? `Do NOT repeat these earlier questions:\n- ${previous.join('\n- ')}` : ''),
    Generated,
  )

  const quiz = must(
    await sb
      .from('quizzes')
      .insert({ user_id: userId, task_id: taskId, questions: gen.questions.slice(0, task.quiz_questions) })
      .select('id, questions, answers, status')
      .single(),
  )
  return publicQuiz(quiz)
})

// Never send answer keys to the phone.
function publicQuiz(q: { id: string; questions: unknown; answers: unknown; status: string }) {
  const answered = new Set((q.answers as { index: number }[]).map((a) => a.index))
  return {
    quizId: q.id,
    questions: (q.questions as { q: string }[]).map((x, i) => ({ index: i, q: x.q, answered: answered.has(i) })),
  }
}
