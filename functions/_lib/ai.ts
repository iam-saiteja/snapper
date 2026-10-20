import type { Env } from './core'

type Part = { text: string } | { file_data: { file_uri: string } }

// Free-tier first: Gemini Flash, then Groq if Gemini is rate-limited or fails.
export async function aiJson<T>(
  env: Env,
  system: string,
  input: string | Part[],
  schema: { parse(v: unknown): T },
): Promise<T> {
  const parts: Part[] = typeof input === 'string' ? [{ text: input }] : input
  const errors: string[] = []
  for (const call of [gemini, groq]) {
    try {
      const text = await call(env, system, parts)
      return schema.parse(JSON.parse(stripFences(text)))
    } catch (e) {
      errors.push(`${call.name}: ${(e as Error).message}`)
    }
  }
  throw new Error(`all AI providers failed: ${errors.join(' | ')}`)
}

function stripFences(s: string) {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
}

async function gemini(env: Env, system: string, parts: Part[]): Promise<string> {
  const model = env.GEMINI_MODEL ?? 'gemini-flash-latest'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!text) throw new Error('empty response')
  return text
}

async function groq(env: Env, system: string, parts: Part[]): Promise<string> {
  // Groq can't open URLs/files, so file parts become plain text references.
  const user = parts.map((p) => ('text' in p ? p.text : `URL: ${p.file_data.file_uri}`)).join('\n')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GROQ_API}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\nRespond with JSON only.` },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('empty response')
  return text
}

export async function transcribe(env: Env, audio: Blob, filename: string): Promise<string> {
  const form = new FormData()
  form.append('file', audio, filename)
  form.append('model', 'whisper-large-v3')
  form.append('response_format', 'json')
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GROQ_API}` },
    body: form,
  })
  if (!res.ok) throw new Error(`transcription failed: HTTP ${res.status}`)
  return ((await res.json()) as { text: string }).text.trim()
}
