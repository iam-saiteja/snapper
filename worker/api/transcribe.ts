import { transcribe } from '../lib/ai'
import { handler, HttpError, requireUser } from '../lib/core'

// Audio passes through to Groq Whisper and is never stored server-side.
export const POST = handler(async (ctx) => {
  await requireUser(ctx)
  const form = await ctx.request.formData()
  const file = form.get('file')
  if (!file || typeof file === 'string') throw new HttpError(400, 'missing audio file')
  if (file.size > 25 * 1024 * 1024) throw new HttpError(413, 'audio too large (max 25MB)')
  return { text: await transcribe(ctx.env, file, file.name || 'audio.m4a') }
})
