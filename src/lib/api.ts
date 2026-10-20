import { Capacitor } from '@capacitor/core'
import type { DeviceState } from '../../shared/schema'
import { supabase } from './supabase'

// On the web (Cloudflare Pages) the API is same-origin; inside the Android app it must be absolute.
export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? (Capacitor.isNativePlatform() ? 'https://snapper.pages.dev' : '')

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
  emergency: (pkg: string, explanation: string, name?: string) =>
    post<{ approved: boolean; minutes: number; reason: string; state: DeviceState }>('/api/emergency', {
      package: pkg,
      explanation,
      name,
    }),
  summarize: (url: string) => post<{ title: string; summary: string }>('/api/link/summarize', { url }),
  registerDevice: () => post<{ token: string }>('/api/device/register', {}),
  transcribe: (audio: Blob, filename: string) => {
    const form = new FormData()
    form.append('file', audio, filename)
    return request<{ text: string }>('/api/transcribe', { method: 'POST', body: form })
  },
}
