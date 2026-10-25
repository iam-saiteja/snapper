import { json, type Env, type Route } from './lib/core'
import * as config from './api/config'
import * as deviceRegister from './api/device/register'
import * as deviceState from './api/device/state'
import * as linkSummarize from './api/link/summarize'
import * as quizAnswer from './api/quiz/answer'
import * as quizStart from './api/quiz/start'
import * as reminderAnswer from './api/reminder/answer'
import * as reminderQuestion from './api/reminder/question'
import * as state from './api/state'
import * as transcribe from './api/transcribe'
import * as unlock from './api/unlock'
import * as unlockChat from './api/unlock-chat'

const routes: Record<string, { GET?: Route; POST?: Route }> = {
  '/api/config': config,
  '/api/state': state,
  '/api/quiz/start': quizStart,
  '/api/quiz/answer': quizAnswer,
  '/api/reminder/question': reminderQuestion,
  '/api/reminder/answer': reminderAnswer,
  '/api/unlock': unlock,
  '/api/unlock-chat': unlockChat,
  '/api/transcribe': transcribe,
  '/api/link/summarize': linkSummarize,
  '/api/device/register': deviceRegister,
  '/api/device/state': deviceState,
}

// Auth is bearer-token only (no cookies), so a wildcard origin is safe and lets the
// Capacitor app (https://localhost) call the API.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-device-token',
}

// Only /api/* reaches this Worker (see run_worker_first in wrangler.jsonc); everything else is static assets.
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const route = routes[new URL(request.url).pathname]?.[request.method as 'GET' | 'POST']
    const res = route ? await route({ request, env }) : json({ error: 'not found' }, 404)
    const out = new Response(res.body, res)
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
    return out
  },
} satisfies ExportedHandler<Env>
