import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { isNative, Snapper } from '../lib/native'
import { listen, speak } from '../lib/voice'

type Question = { ackId: string; question: string; reminder: string }

// Opened by "Answer the question" on a ringing reminder. Opening it stops the ringing; a genuine answer to the
// AI's question acknowledges the reminder. Without one, it rings again in 5 minutes.
export default function Ack() {
  const { id = '' } = useParams()
  const [q, setQ] = useState<Question | null>(null)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function finish() {
    await Snapper.acknowledgeReminder({ id })
    setDone(true)
  }

  async function ask() {
    setBusy(true)
    setError('')
    setFeedback('')
    setAnswer('')
    try {
      const r = await api.reminderQuestion(id)
      if (r.acknowledged) return finish()
      setQ({ ackId: r.ackId!, question: r.question!, reminder: r.reminder ?? '' })
      speak(r.question!)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    Snapper.stopReminderRinging({ id })
    ask()
  }, [id])

  async function submit() {
    if (!q) return
    setBusy(true)
    setError('')
    try {
      const g = await api.reminderAnswer(q.ackId, answer)
      if (g.accepted) {
        await finish()
      } else {
        setFeedback(g.feedback)
        setQ(null)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section>
        <h1>Reminder acknowledged</h1>
        <p className="ok">It won't ring again.</p>
        <Link to="/"><button className="primary">Done</button></Link>
      </section>
    )
  }

  return (
    <>
      <h1>Answer to stop the reminder</h1>
      <p className="muted">The ringing has stopped. Answer this question within 5 minutes, or it rings again.</p>
      {error && (
        <section>
          <p className="error">{error}</p>
          <button disabled={busy} onClick={ask}>Try again</button>
        </section>
      )}
      {feedback && <p className="bad">{feedback}</p>}
      {!q && !error && (busy ? <p className="muted">Getting your question…</p> : <button className="primary" onClick={ask}>New question</button>)}
      {q && (
        <section>
          <div className="muted">Reminder: {q.reminder}</div>
          <p><b>{q.question}</b></p>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" />
          <div className="row">
            {isNative && <button disabled={busy} onClick={async () => setAnswer(await listen())}>🎤 Answer by voice</button>}
            <button onClick={() => speak(q.question)}>🔊 Repeat</button>
            <button className="primary" disabled={busy || !answer.trim()} onClick={submit}>{busy ? 'Checking…' : 'Submit'}</button>
          </div>
        </section>
      )}
    </>
  )
}
