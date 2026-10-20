import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)

export type Task = {
  id: string
  plan: string
  task_date: string
  title: string
  topic: string
  deadline: string
  quiz_questions: number
  pass_score: number
  points: number
  penalty: number
  status: 'pending' | 'done' | 'missed'
}

export type Note = { id: string; local_path: string; transcript: string; duration_ms: number; created_at: string }
export type Link = { id: string; url: string; note: string; summary: string; remind_at: string | null; done: boolean; created_at: string }
export type Reminder = { id: string; remind_at: string; text: string; voice_local_path: string | null }
export type LedgerRow = { id: number; delta: number; reason: string; created_at: string }

export async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}
