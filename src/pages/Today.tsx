import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SLEEP_UNLOCK, todayIST, type DeviceState } from '../../shared/schema'
import { api } from '../lib/api'
import { rows, supabase, type LedgerRow, type Task } from '../lib/supabase'
import { pushState } from '../lib/sync'
import { listen } from '../lib/voice'
import { isNative, Snapper, type InstalledApp } from '../lib/native'
import { categoryBlocked, categoryPenalty } from '../lib/apps'

export default function Today() {
  const [state, setState] = useState<DeviceState | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [installed, setInstalled] = useState<InstalledApp[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, t, l] = await Promise.all([
        api.state(),
        rows<Task>(supabase.from('tasks').select('*').eq('task_date', todayIST()).order('deadline')),
        rows<LedgerRow>(supabase.from('points_ledger').select('*').order('created_at', { ascending: false }).limit(15)),
      ])
      setState(s)
      setTasks(t)
      setLedger(l)
      await pushState(s)
      if (isNative) setInstalled((await Snapper.listApps()).apps)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const unlock = (pkg: string, minutes: number, name: string) =>
    run(async () => {
      const s = await api.unlock(pkg, minutes, name)
      setState(s)
      await pushState(s)
      await load()
    })

  if (!state) return <p className="muted">{error || 'Loading…'}</p>
  const unlockedUntil = (pkg: string) => state.unlocks.filter((u) => u.package === pkg).reduce((m, u) => Math.max(m, u.endsAt), 0)

  return (
    <>
      <div className="spread">
        <h1>Today</h1>
        <div className={`big ${state.balance < 0 ? 'bad' : ''}`}>{state.balance} pts</div>
      </div>
      {error && <p className="error">{error}</p>}

      <SleepBanner state={state} />

      {state.penaltyLocked.length + state.penaltyLockedCategories.length > 0 && (
        <section className="bad">
          Negative points. Locked: {[...state.penaltyLocked.map((a) => a.name), ...state.penaltyLockedCategories].join(', ')}.
          Finish tasks to get back to 0.
        </section>
      )}

      <h2>Tasks</h2>
      {tasks.length === 0 && <p className="muted">No tasks today. Add future tasks from Admin.</p>}
      {tasks.map((t) => (
        <section key={t.id}>
          <div className="spread">
            <div>
              <b>{t.title}</b>
              <div className="muted">
                {t.topic} · due {t.deadline.slice(0, 5)} · +{t.points} / −{t.penalty} · pass {t.pass_score}/{t.quiz_questions}
              </div>
            </div>
            {t.status === 'pending' ? (
              <Link to={`/quiz/${t.id}`}>
                <button className="primary">Take quiz</button>
              </Link>
            ) : (
              <span className={t.status === 'done' ? 'ok' : 'bad'}>{t.status}</span>
            )}
          </div>
        </section>
      ))}

      <h2>Unlock with points</h2>
      {[
        ...state.blocked,
        ...categoryBlocked(installed, state).map((a) => ({
          package: a.package,
          name: a.name,
          costPer15Min: state.categoryCostPer15Min,
          allowShortsWhenUnlocked: false,
        })),
      ].map((b) => {
        const until = unlockedUntil(b.package)
        return (
          <section key={b.package}>
            <div className="spread">
              <b>{b.name}</b>
              {until > Date.now() && <span className="ok">open until {new Date(until).toLocaleTimeString()}</span>}
            </div>
            <div className="row">
              {[15, 30, 60].map((m) => (
                <button key={m} disabled={busy} onClick={() => unlock(b.package, m, b.name)}>
                  {m} min · {b.costPer15Min * (m / 15)} pts
                </button>
              ))}
            </div>
            {['com.instagram.android', 'com.google.android.youtube'].includes(b.package) && (
              <div className="muted">
                {b.allowShortsWhenUnlocked ? 'Shorts/Reels allowed while unlocked.' : 'Shorts/Reels stay blocked even while unlocked.'}
              </div>
            )}
          </section>
        )
      })}

      <Emergency state={state} installed={installed} onDone={load} />

      <h2>Points history</h2>
      {ledger.map((l) => (
        <div key={l.id} className="spread muted">
          <span>{l.reason}</span>
          <span className={l.delta < 0 ? 'bad' : 'ok'}>{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
        </div>
      ))}
    </>
  )
}

function Emergency({ state, installed, onDone }: { state: DeviceState; installed: InstalledApp[]; onDone: () => void }) {
  const seen = new Set<string>()
  const apps = [
    ...(state.sleep.windows.length ? [{ package: SLEEP_UNLOCK, name: 'Sleep mode (whole phone)' }] : []),
    ...state.penaltyLocked,
    ...categoryPenalty(installed, state).map((a) => ({ package: a.package, name: a.name })),
    ...state.blocked.map((b) => ({ package: b.package, name: b.name })),
    ...categoryBlocked(installed, state).map((a) => ({ package: a.package, name: a.name })),
    { package: 'com.android.settings', name: 'Settings' },
  ].filter((a) => !seen.has(a.package) && seen.add(a.package))
  const [open, setOpen] = useState(false)
  const [pkg, setPkg] = useState(apps[0]?.package ?? '')
  const [text, setText] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setResult('')
    try {
      const r = await api.emergency(pkg, text, apps.find((a) => a.package === pkg)?.name)
      await pushState(r.state)
      setResult(r.approved ? `Approved for ${r.minutes} min. ${r.reason}` : `Rejected. ${r.reason}`)
      onDone()
    } catch (e) {
      setResult((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return <button onClick={() => setOpen(true)}>Emergency unlock…</button>
  return (
    <section>
      <h2>Emergency</h2>
      <p className="muted">Explain the problem. The AI decides if it is a real emergency. Every request is logged.</p>
      <select value={pkg} onChange={(e) => setPkg(e.target.value)}>
        {apps.map((a) => (
          <option key={a.package} value={a.package}>{a.name}</option>
        ))}
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What is the emergency?" />
      <div className="row">
        {isNative && (
          <button disabled={busy} onClick={async () => setText(`${text} ${await listen()}`.trim())}>🎤 Speak</button>
        )}
        <button className="primary" disabled={busy || text.trim().length < 10} onClick={submit}>Ask</button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {result && <p>{result}</p>}
    </section>
  )
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** Same rule as the native blocker: a window belongs to the day it starts on (India time). */
function activeSleepWindow(state: DeviceState) {
  const ist = new Date(Date.now() + 5.5 * 3600_000)
  const hhmm = ist.toISOString().slice(11, 16)
  const today = DAYS[ist.getUTCDay()]
  const yesterday = DAYS[(ist.getUTCDay() + 6) % 7]
  return state.sleep.windows.find((w) => {
    const on = (d: string) => !w.days.length || w.days.includes(d as never)
    if (w.start < w.end) return hhmm >= w.start && hhmm < w.end && on(today)
    return (hhmm >= w.start && on(today)) || (hhmm < w.end && on(yesterday))
  })
}

function SleepBanner({ state }: { state: DeviceState }) {
  if (!state.sleep.windows.length) return null
  const active = activeSleepWindow(state)
  const windows = state.sleep.windows.map((w) => `${w.start}–${w.end}`).join(', ')
  return (
    <section className={active ? 'bad' : 'muted'}>
      {active ? `Sleep mode is on until ${active.end}.` : `Sleep mode: ${windows}.`} Only calls, alarms
      {state.sleep.allowWebsites.length > 0 && ` and ${state.sleep.allowWebsites.join(', ')}`} work during sleep.
    </section>
  )
}
