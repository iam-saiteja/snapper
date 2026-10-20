import { useEffect, useState } from 'react'
import { isNative, Snapper } from '../lib/native'
import { rows, supabase, type Reminder } from '../lib/supabase'
import { deleteRecording, startRecording, stopRecording, type Recording } from '../lib/voice'

export async function createReminder(text: string, at: Date, voice?: Recording, id = crypto.randomUUID()) {
  const { error } = await supabase
    .from('reminders')
    .insert({ id, remind_at: at.toISOString(), text, voice_local_path: voice?.path ?? null })
  if (error) throw new Error(error.message)
  // The phone plays your own recording at that time (or speaks the text if there is none).
  await Snapper.scheduleReminder({ id, at: at.getTime(), text, audioPath: voice?.uri })
}

export default function Reminders() {
  const [list, setList] = useState<Reminder[]>([])
  const [text, setText] = useState('')
  const [when, setWhen] = useState('')
  const [voice, setVoice] = useState<Recording | null>(null)
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState('')

  const load = () =>
    rows<Reminder>(
      supabase.from('reminders').select('*').gt('remind_at', new Date().toISOString()).order('remind_at'),
    ).then(setList)
  useEffect(() => {
    load().catch((e) => setStatus(e.message))
  }, [])

  async function toggleRecord() {
    try {
      if (!recording) {
        await startRecording()
        setRecording(true)
      } else {
        setRecording(false)
        setVoice(await stopRecording('reminders', crypto.randomUUID()))
      }
    } catch (e) {
      setRecording(false)
      setStatus((e as Error).message)
    }
  }

  async function save() {
    try {
      const at = new Date(when)
      if (!(at.getTime() > Date.now())) throw new Error('Pick a time in the future')
      await createReminder(text || 'Voice reminder', at, voice ?? undefined)
      setText('')
      setWhen('')
      setVoice(null)
      setStatus('Reminder set.')
      await load()
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  async function remove(r: Reminder) {
    await Snapper.cancelReminder({ id: r.id })
    if (r.voice_local_path) await deleteRecording(r.voice_local_path)
    await supabase.from('reminders').delete().eq('id', r.id)
    await load()
  }

  return (
    <>
      <h1>Reminders</h1>
      <section>
        <input placeholder="What to remind you about" value={text} onChange={(e) => setText(e.target.value)} />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <div className="row">
          {isNative && (
            <button onClick={toggleRecord}>{recording ? '■ Stop' : voice ? '● Re-record voice' : '● Record in my voice'}</button>
          )}
          {voice && <span className="ok">Voice recorded ({Math.round(voice.durationMs / 1000)}s)</span>}
          <button className="primary" disabled={!when || recording} onClick={save}>Set reminder</button>
        </div>
      </section>
      {status && <p className="muted">{status}</p>}
      {list.map((r) => (
        <section key={r.id} className="spread">
          <div>
            <b>{r.text}</b>
            <div className="muted">{new Date(r.remind_at).toLocaleString()} {r.voice_local_path && '· 🎙 your voice'}</div>
          </div>
          <button onClick={() => remove(r)}>Delete</button>
        </section>
      ))}
    </>
  )
}
