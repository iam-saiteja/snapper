import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { addDays, todayIST } from '../../shared/schema'
import { rows, supabase, type LedgerRow, type Link, type Reminder, type Task } from '../lib/supabase'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const AGENDA_DAYS = 60

type DayItems = { tasks: Task[]; reminders: Reminder[]; links: Link[]; ledger: LedgerRow[] }
type ByDate = Record<string, DayItems>

const empty = (): DayItems => ({ tasks: [], reminders: [], links: [], ledger: [] })
const istDate = (ts: string) => todayIST(new Date(ts))
const istTime = (ts: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts))

function monthGrid(year: number, month: number): string[] {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday-first
  const start = addDays(first, -offset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

// Timestamps covering whole IST days from `from` to `to` (inclusive).
const istRange = (from: string, to: string) => [`${from}T00:00:00+05:30`, `${addDays(to, 1)}T00:00:00+05:30`]

async function load(from: string, to: string): Promise<ByDate> {
  const [start, end] = istRange(from, to)
  const [tasks, reminders, links, ledger] = await Promise.all([
    rows<Task>(supabase.from('tasks').select('*').gte('task_date', from).lte('task_date', to).order('deadline')),
    rows<Reminder>(supabase.from('reminders').select('*').gte('remind_at', start).lt('remind_at', end).order('remind_at')),
    rows<Link>(supabase.from('links').select('*').gte('remind_at', start).lt('remind_at', end).order('remind_at')),
    rows<LedgerRow>(supabase.from('points_ledger').select('*').gte('created_at', start).lt('created_at', end).order('created_at')),
  ])
  const by: ByDate = {}
  const day = (d: string) => (by[d] ??= empty())
  tasks.forEach((t) => day(t.task_date).tasks.push(t))
  reminders.forEach((r) => day(istDate(r.remind_at)).reminders.push(r))
  links.forEach((l) => day(istDate(l.remind_at!)).links.push(l))
  ledger.forEach((l) => day(istDate(l.created_at)).ledger.push(l))
  return by
}

export default function Calendar() {
  const today = todayIST()
  const [view, setView] = useState<'month' | 'schedule'>('month')
  const [cursor, setCursor] = useState(() => ({ year: +today.slice(0, 4), month: +today.slice(5, 7) - 1 }))
  const [selected, setSelected] = useState(today)
  const [data, setData] = useState<ByDate>({})
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const [from, to] = view === 'month' ? [grid[0], grid[41]] : [today, addDays(today, AGENDA_DAYS - 1)]

  useEffect(() => {
    setError('')
    load(from, to).then(setData).catch((e) => setError(e.message))
  }, [from, to, version])

  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const m = month + delta
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
    })
  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const refresh = () => setVersion((v) => v + 1)

  return (
    <>
      <div className="spread">
        <h1>Calendar</h1>
        <div className="row">
          <button className={view === 'month' ? 'primary' : ''} onClick={() => setView('month')}>Month</button>
          <button className={view === 'schedule' ? 'primary' : ''} onClick={() => setView('schedule')}>Schedule</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {view === 'month' ? (
        <>
          <div className="spread">
            <button onClick={() => shiftMonth(-1)}>‹</button>
            <b>{monthLabel}</b>
            <button onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div className="cal">
            {WEEKDAYS.map((w) => (
              <div key={w} className="cal-head">{w}</div>
            ))}
            {grid.map((d) => (
              <DayCell
                key={d}
                date={d}
                items={data[d]}
                inMonth={+d.slice(5, 7) - 1 === cursor.month}
                isToday={d === today}
                isSelected={d === selected}
                onClick={() => setSelected(d)}
              />
            ))}
          </div>
          <p className="muted">
            <span className="dot done" /> done <span className="dot missed" /> missed <span className="dot pending" /> pending
            <span className="dot rem" /> reminder
          </p>
          <DayDetail date={selected} items={data[selected] ?? empty()} today={today} onChange={refresh} />
        </>
      ) : (
        <Schedule from={today} data={data} today={today} onChange={refresh} />
      )}
    </>
  )
}

function DayCell(props: {
  date: string
  items?: DayItems
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const { date, items, inMonth, isToday, isSelected, onClick } = props
  const cls = ['cal-day', inMonth ? '' : 'out', isToday ? 'today' : '', isSelected ? 'selected' : ''].join(' ')
  return (
    <button className={cls} onClick={onClick}>
      <span>{+date.slice(8)}</span>
      <span className="dots">
        {items?.tasks.slice(0, 4).map((t) => <span key={t.id} className={`dot ${t.status === 'done' ? 'done' : t.status === 'missed' ? 'missed' : 'pending'}`} />)}
        {items && items.reminders.length + items.links.length > 0 && <span className="dot rem" />}
      </span>
    </button>
  )
}

function DayDetail({ date, items, today, onChange }: { date: string; items: DayItems; today: string; onChange: () => void }) {
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const net = items.ledger.reduce((s, l) => s + l.delta, 0)
  const nothing = !items.tasks.length && !items.reminders.length && !items.links.length && !items.ledger.length
  return (
    <section>
      <div className="spread">
        <b>{label}{date === today && ' · today'}</b>
        {items.ledger.length > 0 && <span className={net < 0 ? 'bad' : 'ok'}>{net > 0 ? `+${net}` : net} pts</span>}
      </div>
      {nothing && <p className="muted">Nothing on this day.</p>}
      <TaskList tasks={items.tasks} today={today} onChange={onChange} />
      {items.reminders.map((r) => (
        <div key={r.id} className="item">🔔 {istTime(r.remind_at)} · {r.text} {r.voice_local_path && '🎙'}</div>
      ))}
      {items.links.map((l) => (
        <div key={l.id} className="item">🔗 {istTime(l.remind_at!)} · <a href={l.url} target="_blank" rel="noreferrer">{l.note || l.url}</a></div>
      ))}
      {items.ledger.map((l) => (
        <div key={l.id} className="item spread muted">
          <span>{istTime(l.created_at)} · {l.reason}</span>
          <span className={l.delta < 0 ? 'bad' : 'ok'}>{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
        </div>
      ))}
    </section>
  )
}

function TaskList({ tasks, today, onChange }: { tasks: Task[]; today: string; onChange: () => void }) {
  async function remove(t: Task) {
    if (!confirm(`Remove "${t.title}" on ${t.task_date}?`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', t.id)
    if (error) alert(error.message)
    onChange()
  }
  return (
    <>
      {tasks.map((t) => (
        <div key={t.id} className="item">
          <div className="spread">
            <b>{t.title}</b>
            {t.status === 'pending' && t.task_date === today ? (
              <RouterLink to={`/quiz/${t.id}`}><button className="primary">Take quiz</button></RouterLink>
            ) : t.status === 'pending' && t.task_date > today ? (
              <button onClick={() => remove(t)}>Remove</button>
            ) : (
              <span className={t.status === 'done' ? 'ok' : t.status === 'missed' ? 'bad' : 'muted'}>{t.status}</span>
            )}
          </div>
          <div className="muted">
            {t.topic}
            <br />
            due {t.deadline.slice(0, 5)} · +{t.points} / −{t.penalty} · pass {t.pass_score}/{t.quiz_questions}
            {t.plan && ` · ${t.plan}`}
          </div>
        </div>
      ))}
    </>
  )
}

function Schedule({ from, data, today, onChange }: { from: string; data: ByDate; today: string; onChange: () => void }) {
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(from, i)).filter((d) => {
    const it = data[d]
    return it && (it.tasks.length || it.reminders.length || it.links.length)
  })
  if (!days.length) return <p className="muted">Nothing scheduled in the next {AGENDA_DAYS} days. Import a plan from Admin.</p>
  return (
    <>
      {days.map((d) => (
        <DayDetail key={d} date={d} items={{ ...data[d], ledger: [] }} today={today} onChange={onChange} />
      ))}
    </>
  )
}
