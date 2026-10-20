import { useEffect, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import type { DeviceState } from '../../shared/schema'
import { api } from '../lib/api'
import { appStatus, formatMinutes, unlockedUntil, type AppStatus } from '../lib/apps'
import { isNative, Snapper, type InstalledApp } from '../lib/native'
import { supabase } from '../lib/supabase'
import { syncBlocker } from '../lib/sync'

const STATUS_LABEL: Record<AppStatus, string> = {
  unlocked: 'Unlocked',
  blocked: 'Blocked',
  penalty: 'Locked (negative points)',
  penaltyIfNegative: 'Locks if points < 0',
  soft: 'Blocked by you',
  untilTasks: 'Blocked until tasks done',
  untilTasksDone: 'Tasks done: allowed today',
  allowed: 'Allowed',
}

// Every installed app, its category, today's screen time and whether Snapper blocks it.
export default function Apps() {
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [usageAccess, setUsageAccess] = useState(true)
  const [categoriesSupported, setCategoriesSupported] = useState(true)
  const [state, setState] = useState<DeviceState | null>(null)
  const [filter, setFilter] = useState('')
  const [category, setCategory] = useState('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = () =>
    Promise.all([Snapper.listApps(), api.state()])
      .then(([r, s]) => {
        setApps(r.apps)
        setUsageAccess(r.usageAccess)
        setCategoriesSupported(r.categoriesSupported)
        setState(s)
      })
      .catch((e) => setError(e.message))

  useEffect(() => {
    load()
    if (!isNative) return
    const sub = CapApp.addListener('resume', load)
    return () => void sub.then((h) => h.remove())
  }, [])

  // Your own blocks take effect immediately. 'soft' can be removed; 'until_tasks' can't (the database refuses).
  async function setBlock(app: InstalledApp, mode: 'soft' | 'until_tasks' | null) {
    setBusy(app.package)
    setError('')
    try {
      if (mode) {
        const { error } = await supabase.from('app_blocks').insert({ package: app.package, name: app.name, mode })
        if (error) throw new Error(error.message)
      } else {
        const { data, error } = await supabase.from('app_blocks').delete().eq('package', app.package).select('id')
        if (error) throw new Error(error.message)
        if (!data?.length) throw new Error(`"Block until tasks" can't be removed. Finish today's tasks to use the app.`)
      }
      setState(await syncBlocker())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  if (!isNative) return <p className="muted">The Apps screen needs the Android app.</p>
  if (!state) return <p className="muted">{error || 'Loading…'}</p>

  const categories = ['all', 'payments', ...[...new Set(apps.map((a) => a.category))].sort()]
  const shown = apps
    .filter((a) => category === 'all' || (category === 'payments' ? a.payment : a.category === category))
    .filter((a) => `${a.name} ${a.package}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => b.usageMs - a.usageMs || a.name.localeCompare(b.name))
  const total = apps.reduce((s, a) => s + a.usageMs, 0)
  const sleepOn = state.sleep.windows.length > 0

  return (
    <>
      <div className="spread">
        <h1>Apps</h1>
        {usageAccess && <span className="big">{formatMinutes(total)}</span>}
      </div>
      {usageAccess ? (
        <p className="muted">Screen time today (since midnight), from the same data Digital Wellbeing uses.</p>
      ) : (
        <section className="spread">
          <div>
            <b>Screen time is off</b>
            <div className="muted">Allow "Usage access" to see per-app time like Digital Wellbeing.</div>
          </div>
          <button className="primary" onClick={() => Snapper.openUsageAccessSettings()}>Turn on</button>
        </section>
      )}

      <section className="muted">
        Blocked categories: <b>{state.blockCategories.join(', ') || 'none'}</b> · locked when points are negative:{' '}
        <b>{[...state.penaltyLockConfigured.apps.map((p) => p.name), ...state.penaltyLockConfigured.categories].join(', ') || 'none'}</b>
        {state.exceptApps.length > 0 && <> · never blocked by category: {state.exceptApps.join(', ')}</>}
        {sleepOn && (
          <>
            <br />
            Sleep: {state.sleep.windows.map((w) => `${w.start}–${w.end}`).join(', ')}, everything except calls, alarms
            {state.sleep.allowWebsites.length > 0 && ` and ${state.sleep.allowWebsites.join(', ')}`}
          </>
        )}
      </section>

      {!categoriesSupported && (
        <p className="error">
          This Android version doesn't report app categories, so only "payments" and the built-in social list work.
          List other apps under "blocked" in the rules.
        </p>
      )}

      <input placeholder="Search apps" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {error && <p className="error">{error}</p>}

      {shown.map((a) => {
        const status = appStatus(a, state)
        return (
          <div key={a.package} className="item">
            <div className="spread">
              <b>{a.name}</b>
              {usageAccess && <span>{formatMinutes(a.usageMs)}</span>}
            </div>
            <div className="spread muted">
              <span>
                {a.category}{a.payment && ' · payments'} · <span style={{ userSelect: 'all' }}>{a.package}</span>
              </span>
              <span
                className={
                  status === 'allowed' || status === 'unlocked' || status === 'untilTasksDone'
                    ? 'ok'
                    : status === 'penaltyIfNegative'
                      ? 'muted'
                      : 'bad'
                }
              >
                {status === 'unlocked'
                  ? `Unlocked until ${new Date(unlockedUntil(a.package, state)).toLocaleTimeString()}`
                  : STATUS_LABEL[status]}
              </span>
            </div>
            <BlockButtons app={a} state={state} busy={busy === a.package} onSet={setBlock} />
          </div>
        )
      })}
    </>
  )
}

function BlockButtons(props: {
  app: InstalledApp
  state: DeviceState
  busy: boolean
  onSet: (app: InstalledApp, mode: 'soft' | 'until_tasks' | null) => void
}) {
  const { app, state, busy, onSet } = props
  const mine = state.appBlocks.find((b) => b.package === app.package)
  if (mine?.mode === 'until_tasks') return null // a commitment: no unblock button
  if (mine?.mode === 'soft') {
    return (
      <div className="row">
        <button disabled={busy} onClick={() => onSet(app, null)}>Unblock</button>
      </div>
    )
  }
  return (
    <div className="row">
      <button disabled={busy} onClick={() => onSet(app, 'soft')}>Block</button>
      <button
        disabled={busy}
        onClick={() => {
          if (confirm(`Block ${app.name} until your tasks are done each day? You won't be able to remove this block.`)) {
            onSet(app, 'until_tasks')
          }
        }}
      >
        Block until tasks
      </button>
    </div>
  )
}
