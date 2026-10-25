import type { DeviceState } from '../../shared/schema'
import { API_BASE } from './config'
import { supabase } from './supabase'

export { API_BASE }

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(await authHeader()), ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...init.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export type QuizQuestion = { index: number; q: string; answered: boolean }
export type Grade = {
  correct: boolean
  feedback: string
  expected: string
  score: number
  passScore: number
  status: 'open' | 'passed' | 'failed'
  balance: number
}

export const api = {
  state: () => request<DeviceState>('/api/state'),
  startQuiz: (taskId: string) => post<{ quizId: string; questions: QuizQuestion[] }>('/api/quiz/start', { taskId }),
  answer: (quizId: string, index: number, answer: string) => post<Grade>('/api/quiz/answer', { quizId, index, answer }),
  unlock: (pkg: string, minutes: number, name?: string) =>
    post<DeviceState>('/api/unlock', { package: pkg, minutes, name }),
  unlockChat: (pkg: string, message: string, chatId?: string, name?: string) =>
    post<{ chatId: string; reply: string; status: 'open' | 'approved' | 'denied'; minutes: number; state: DeviceState }>(
      '/api/unlock-chat',
      { package: pkg, message, chatId, name },
    ),
  reminderQuestion: (reminderId: string) =>
    post<{ acknowledged: boolean; ackId?: string; question?: string; reminder?: string }>('/api/reminder/question', {
      reminderId,
    }),
  reminderAnswer: (ackId: string, answer: string) =>
    post<{ accepted: boolean; feedback: string }>('/api/reminder/answer', { ackId, answer }),
  summarize: (url: string) => post<{ title: string; summary: string }>('/api/link/summarize', { url }),
  registerDevice: () => post<{ token: string }>('/api/device/register', {}),
  transcribe: (audio: Blob, filename: string) => {
    const form = new FormData()
    form.append('file', audio, filename)
    return request<{ text: string }>('/api/transcribe', { method: 'POST', body: form })
  },
}
