import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ClientConfig } from './config'

// Created once at startup from the deployment's config (see main.tsx). Importers read the live binding.
export let supabase: SupabaseClient

export function initSupabase(config: ClientConfig) {
  supabase = createClient(config.supabaseUrl, config.supabasePublishableKey)
}

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
