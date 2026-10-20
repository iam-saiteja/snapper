import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { isNative } from '../lib/native'
import { rows, supabase, type Note } from '../lib/supabase'
import { base64ToBlob, deleteRecording, playableSrc, startRecording, stopRecording } from '../lib/voice'

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')

  const load = () => rows<Note>(supabase.from('notes').select('*').order('created_at', { ascending: false })).then(setNotes)
  useEffect(() => {
    load().catch((e) => setStatus(e.message))
  }, [])

  async function toggle() {
    try {
      if (!recording) {
        await startRecording()
        setRecording(true)
        setStatus('Recording…')
        return
      }
      setRecording(false)
      const id = crypto.randomUUID()
      const rec = await stopRecording('notes', id)
      setStatus('Transcribing…')
      // Audio stays on the phone; only the transcript is saved to the database.
      const transcript = await api
        .transcribe(base64ToBlob(rec.base64, rec.mimeType), rec.path.split('/').pop()!)
        .then((r) => r.text)
        .catch(() => '')
      const { error } = await supabase
        .from('notes')
        .insert({ id, local_path: rec.path, transcript, duration_ms: rec.durationMs })
      if (error) throw new Error(error.message)
      setStatus(transcript ? '' : 'Saved (transcription failed, audio kept).')
      await load()
    } catch (e) {
      setRecording(false)
      setStatus((e as Error).message)
    }
  }

  async function remove(n: Note) {
    if (!confirm('Delete this note and its recording?')) return
    await deleteRecording(n.local_path)
    await supabase.from('notes').delete().eq('id', n.id)
    await load()
  }

  const shown = notes.filter((n) => n.transcript.toLowerCase().includes(query.toLowerCase()))
  return (
    <>
      <h1>Voice notes</h1>
      {isNative ? (
        <button className="primary" onClick={toggle}>{recording ? '■ Stop & save' : '● Record'}</button>
      ) : (
        <p className="muted">Recording works in the Android app (recordings are stored on the phone only).</p>
      )}
      {status && <p className="muted">{status}</p>}
      <input placeholder="Search transcripts" value={query} onChange={(e) => setQuery(e.target.value)} />
      {shown.map((n) => (
        <NoteCard key={n.id} note={n} onDelete={() => remove(n)} />
      ))}
    </>
  )
}

function NoteCard({ note, onDelete }: { note: Note; onDelete: () => void }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (isNative) playableSrc(note.local_path).then(setSrc).catch(() => setSrc(''))
  }, [note.local_path])
  return (
    <section>
      <div className="muted">{new Date(note.created_at).toLocaleString()} · {Math.round(note.duration_ms / 1000)}s</div>
      <p>{note.transcript || <i className="muted">No transcript</i>}</p>
      {src ? <audio controls src={src} style={{ width: '100%' }} /> : <p className="muted">Audio is on your phone.</p>}
      <button onClick={onDelete}>Delete</button>
    </section>
  )
}
