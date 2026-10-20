import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Grade, type QuizQuestion } from '../lib/api'
import { isNative } from '../lib/native'
import { syncBlocker } from '../lib/sync'
import { listen, speak, stopSpeaking } from '../lib/voice'

export default function Quiz() {
  const { taskId } = useParams()
  const [quizId, setQuizId] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [current, setCurrent] = useState(0)
  const [answer, setAnswer] = useState('')
  const [grade, setGrade] = useState<Grade | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceMode, setVoiceMode] = useState(isNative)

  useEffect(() => {
    if (!taskId) return
    api
      .startQuiz(taskId)
      .then((q) => {
        setQuizId(q.quizId)
        setQuestions(q.questions)
        setCurrent(q.questions.findIndex((x) => !x.answered))
      })
      .catch((e) => setError(e.message))
    return () => void stopSpeaking()
  }, [taskId])

  const question = questions[current]

  // Voice mode: read the question aloud, then listen for the answer straight away.
  useEffect(() => {
    if (!question || !voiceMode || grade) return
    let cancelled = false
    ;(async () => {
      await speak(question.q)
      if (cancelled) return
      try {
        const heard = await listen()
        if (!cancelled && heard) setAnswer(heard)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [question, voiceMode, grade])

  async function submit() {
    if (!question) return
    setBusy(true)
    setError('')
    try {
      const g = await api.answer(quizId, question.index, answer)
      setGrade(g)
      if (voiceMode) speak(`${g.correct ? 'Correct.' : 'Not quite.'} ${g.feedback}`)
      if (g.status === 'passed') await syncBlocker()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function next() {
    setQuestions((qs) => qs.map((q, i) => (i === current ? { ...q, answered: true } : q)))
    setCurrent((c) => questions.findIndex((q, i) => i > c && !q.answered))
    setAnswer('')
    setGrade(null)
  }

  if (error && !questions.length) return <p className="error">{error} <Link to="/">Back</Link></p>
  if (!questions.length) return <p className="muted">Preparing your quiz…</p>

  const finished = grade && grade.status !== 'open'
  return (
    <>
      <div className="spread">
        <h1>Quiz</h1>
        <label className="muted">
          <input type="checkbox" style={{ width: 'auto' }} checked={voiceMode} onChange={(e) => setVoiceMode(e.target.checked)} /> Voice
        </label>
      </div>

      {question && (
        <section>
          <div className="muted">Question {current + 1} of {questions.length}</div>
          <p><b>{question.q}</b></p>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" disabled={!!grade} />
          {!grade && (
            <div className="row">
              {isNative && <button disabled={busy} onClick={async () => setAnswer(await listen())}>🎤 Answer by voice</button>}
              {voiceMode && <button disabled={busy} onClick={() => speak(question.q)}>🔊 Repeat</button>}
              <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Grading…' : 'Submit'}</button>
            </div>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {grade && (
        <section>
          <p className={grade.correct ? 'ok' : 'bad'}><b>{grade.correct ? 'Correct' : 'Incorrect'}</b> · {grade.feedback}</p>
          {!grade.correct && <p className="muted">Expected: {grade.expected}</p>}
          <p className="muted">Score {grade.score} / need {grade.passScore}</p>
          {grade.status === 'passed' && <p className="ok big">Passed! Balance: {grade.balance} pts</p>}
          {grade.status === 'failed' && <p className="bad">Failed. You can retry with new questions (limited attempts).</p>}
          {finished ? <Link to="/"><button className="primary">Done</button></Link> : <button className="primary" onClick={next}>Next question</button>}
        </section>
      )}
    </>
  )
}
