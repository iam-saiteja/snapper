import { useEffect, useState } from 'react'
import { addDays, DEFAULT_RULES, PlanImport, resolveDayDate, Rules, todayIST } from '../../shared/schema'
import { rows, supabase, type Task } from '../lib/supabase'

const CHUNK = 500

const EXAMPLE = JSON.stringify(
  {
    plan: 'DSA Course',
    start: addDays(todayIST(), 1),
    days: [
      {
        day: 1,
        tasks: [
          { title: 'Two pointers', topic: 'two pointers technique on arrays', deadline: '21:00', quiz: { questions: 5, passScore: 4 }, points: 20, penalty: 15 },
        ],
        reminders: [{ time: '07:30', text: 'Start two pointers' }],
      },
    ],
  },
  null,
  2,
)

// Admin can only add or remove tasks for tomorrow onwards. The database enforces this too (RLS).
export default function Admin() {
  const [json, setJson] = useState('')
  const [status, setStatus] = useState('')
  const [future, setFuture] = useState<Task[]>([])
  const [busy, setBusy] = useState(false)
  // Bumped when an import saves rules, so the rules editor reloads instead of showing stale rules.
  const [rulesVersion, setRulesVersion] = useState(0)
  const tomorrow = addDays(todayIST(), 1)

  const load = () =>
    rows<Task>(supabase.from('tasks').select('*').gte('task_date', tomorrow).order('task_date').order('deadline')).then(setFuture)
  useEffect(() => {
    load().catch((e) => setStatus(e.message))
  }, [])

  async function importPlan() {
    setBusy(true)
    setStatus('')
    try {
      const parsed = PlanImport.safeParse(JSON.parse(json))
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'))
      const plan = parsed.data

      const tasks: object[] = []
      const reminders: object[] = []
      for (const d of plan.days) {
        const date = resolveDayDate(plan, d)
        if (date < tomorrow) throw new Error(`${date}: you can only schedule from tomorrow (${tomorrow}) onwards`)
        for (const t of d.tasks) {
          if (t.quiz.passScore > t.quiz.questions) throw new Error(`${date} "${t.title}": passScore > questions`)
          tasks.push({
            plan: plan.plan, task_date: date, title: t.title, topic: t.topic, deadline: t.deadline,
            quiz_questions: t.quiz.questions, pass_score: t.quiz.passScore, points: t.points, penalty: t.penalty,
          })
        }
        for (const r of d.reminders) reminders.push({ remind_at: `${date}T${r.time}:00+05:30`, text: r.text })
      }

      for (let i = 0; i < tasks.length; i += CHUNK) {
        const { error } = await supabase.from('tasks').insert(tasks.slice(i, i + CHUNK))
        if (error) throw new Error(`tasks ${i}–${i + CHUNK}: ${error.message}`)
        setStatus(`Imported ${Math.min(i + CHUNK, tasks.length)} / ${tasks.length} tasks…`)
      }
      for (let i = 0; i < reminders.length; i += CHUNK) {
        const { error } = await supabase.from('reminders').insert(reminders.slice(i, i + CHUNK))
        if (error) throw new Error(`reminders: ${error.message}`)
      }
      const rulesNote = plan.rules ? ` Rules saved, effective ${await saveRules(plan.rules)}.` : ''
      if (plan.rules) setRulesVersion((v) => v + 1)
      setStatus(`Imported ${tasks.length} tasks and ${reminders.length} reminders.${rulesNote}`)
      setJson('')
      await load()
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(t: Task) {
    const { error } = await supabase.from('tasks').delete().eq('id', t.id)
    setStatus(error ? error.message : `Removed "${t.title}" on ${t.task_date}`)
    await load()
  }

  async function removeDay(date: string) {
    if (!confirm(`Remove all tasks on ${date}?`)) return
    const { error } = await supabase.from('tasks').delete().eq('task_date', date)
    setStatus(error ? error.message : `Removed tasks on ${date}`)
    await load()
  }

  const byDate = Object.entries(
    future.reduce<Record<string, Task[]>>((acc, t) => ((acc[t.task_date] ??= []).push(t), acc), {}),
  )

  return (
    <>
      <h1>Admin</h1>
      <p className="muted">You can add or remove tasks from tomorrow ({tomorrow}) onwards. Today and the past are locked.</p>

      <h2>Import plan (JSON)</h2>
      <p className="muted">Schedule, reminders and (optionally) "rules" in one file. Every option is in docs/configuration.md in the GitHub repo.</p>
      <input
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) setJson(await f.text())
        }}
      />
      <textarea className="code" value={json} onChange={(e) => setJson(e.target.value)} placeholder={EXAMPLE} />
      <div className="row">
        <button className="primary" disabled={busy || !json.trim()} onClick={importPlan}>Import</button>
        <button onClick={() => setJson(EXAMPLE)}>Insert example</button>
      </div>
      {status && <p className="error">{status}</p>}

      <h2>Upcoming tasks ({future.length})</h2>
      {byDate.map(([date, ts]) => (
        <section key={date}>
          <div className="spread">
            <b>{date}</b>
            <button onClick={() => removeDay(date)}>Remove day</button>
          </div>
          {ts.map((t) => (
            <div key={t.id} className="spread">
              <span>{t.deadline.slice(0, 5)} · {t.title} <span className="muted">({t.topic})</span></span>
              <button onClick={() => remove(t)}>✕</button>
            </div>
          ))}
        </section>
      ))}

      <RulesEditor key={rulesVersion} />
    </>
  )
}

// Rules are insert-only and take effect tomorrow, so you can't loosen them in a weak moment today.
// The very first rules apply today. Returns the effective date.
async function saveRules(rules: Rules): Promise<string> {
  const { count } = await supabase.from('rules').select('id', { count: 'exact', head: true })
  const effective = count ? addDays(todayIST(), 1) : todayIST()
  const { error } = await supabase.from('rules').insert({ effective_date: effective, rules })
  if (error) throw new Error(error.message)
  return effective
}

function RulesEditor() {
  const [current, setCurrent] = useState<{ effective_date: string; rules: unknown } | null>(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase
      .from('rules')
      .select('effective_date, rules')
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setCurrent(data)
        setText(JSON.stringify(data?.rules ?? DEFAULT_RULES, null, 2))
      })
  }, [])

  async function save() {
    try {
      const parsed = Rules.safeParse(JSON.parse(text))
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'))
      const effective = await saveRules(parsed.data)
      setCurrent({ effective_date: effective, rules: parsed.data })
      setStatus(`Saved. Takes effect ${effective}.`)
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  return (
    <>
      <h2>Blocking rules</h2>
      <p className="muted">
        {current ? `Latest rules effective ${current.effective_date}. Changes apply from tomorrow.` : 'No rules saved yet: defaults are in use. Saving now applies today.'}
      </p>
      <textarea className="code" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="primary" onClick={save}>Save rules</button>
      {status && <p className="error">{status}</p>}
    </>
  )
}
