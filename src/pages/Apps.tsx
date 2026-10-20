import { useEffect, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import type { DeviceState } from '../../shared/schema'
import { api } from '../lib/api'
import { appStatus, formatMinutes, type AppStatus } from '../lib/apps'
import { isNative, Snapper, type InstalledApp } from '../lib/native'

const STATUS_LABEL: Record<AppStatus, string> = {
  blocked: 'Blocked',
  penalty: 'Locked (negative points)',
  penaltyIfNegative: 'Locks if points < 0',
  allowed: 'Allowed',
}

// Every installed app, its category, today's screen time and whether Snapper blocks it.
export default function Apps() {
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [usageAccess, setUsageAccess] = useState(true)
  const [state, setState] = useState<DeviceState | null>(null)
  const [filter, setFilter] = useState('')
  const [category, setCategory] = useState('all')
  const [error, setError] = useState('')

  const load = () =>
    Promise.all([Snapper.listApps(), api.state()])
      .then(([r, s]) => {
        setApps(r.apps)
        setUsageAccess(r.usageAccess)
        setState(s)
      })
      .catch((e) => setError(e.message))

  useEffect(() => {
    load()
    if (!isNative) return
    const sub = CapApp.addListener('resume', load)
    return () => void sub.then((h) => h.remove())
  }, [])

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
              <span className={status === 'allowed' ? '' : status === 'penaltyIfNegative' ? 'muted' : 'bad'}>{STATUS_LABEL[status]}</span>
            </div>
          </div>
        )
      })}
    </>
  )
}
