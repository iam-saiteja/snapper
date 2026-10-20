import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { rows, supabase, type Link } from '../lib/supabase'
import { createReminder } from './Reminders'

const URL_RE = /https?:\/\/\S+/

export default function Links() {
  const [params, setParams] = useSearchParams()
  const shared = params.get('shared') ?? ''
  const [links, setLinks] = useState<Link[]>([])
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [when, setWhen] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => rows<Link>(supabase.from('links').select('*').order('created_at', { ascending: false })).then(setLinks)
  useEffect(() => {
    load().catch((e) => setStatus(e.message))
  }, [])

  // Text shared from Instagram/YouTube usually contains the URL plus a caption.
  useEffect(() => {
    if (!shared) return
    const found = shared.match(URL_RE)?.[0] ?? ''
    setUrl(found)
    setNote(shared.replace(found, '').trim())
    setParams({}, { replace: true })
  }, [shared, setParams])

  async function save() {
    setBusy(true)
    setStatus('Summarising…')
    try {
      const s = await api.summarize(url).catch(() => ({ title: url, summary: '' }))
      const remindAt = when ? new Date(when) : null
      const { data, error } = await supabase
        .from('links')
        .insert({ url, note, summary: s.summary, remind_at: remindAt?.toISOString() ?? null })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      if (remindAt) await createReminder(`Saved link: ${s.title || note || url}`, remindAt, undefined, data.id)
      setUrl('')
      setNote('')
      setWhen('')
      setStatus('Saved.')
      await load()
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleDone(l: Link) {
    await supabase.from('links').update({ done: !l.done }).eq('id', l.id)
    await load()
  }

  async function remove(l: Link) {
    await supabase.from('links').delete().eq('id', l.id)
    await load()
  }

  return (
    <>
      <h1>Saved links & reels</h1>
      <p className="muted">Tip: in Instagram or YouTube tap Share → Snapper.</p>
      <section>
        <input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input placeholder="Why did you save this?" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="muted">Remind me at (optional)</label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <button className="primary" disabled={busy || !URL_RE.test(url)} onClick={save}>Save</button>
      </section>
      {status && <p className="muted">{status}</p>}
      {links.map((l) => (
        <section key={l.id} style={{ opacity: l.done ? 0.5 : 1 }}>
          <a href={l.url} target="_blank" rel="noreferrer">{l.url}</a>
          {l.note && <p>{l.note}</p>}
          {l.summary && <p className="muted">{l.summary}</p>}
          {l.remind_at && <div className="muted">Reminder: {new Date(l.remind_at).toLocaleString()}</div>}
          <button onClick={() => toggleDone(l)}>{l.done ? 'Undo' : 'Done'}</button>
          <button onClick={() => remove(l)}>Delete</button>
        </section>
      ))}
    </>
  )
}
