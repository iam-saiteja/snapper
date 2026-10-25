import { useEffect, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Link } from 'react-router-dom'
import { isNative, Snapper, type NativeStatus } from '../lib/native'
import { supabase } from '../lib/supabase'
import { ensureDeviceRegistered, syncBlocker } from '../lib/sync'

export default function Setup() {
  const [status, setStatus] = useState<NativeStatus | null>(null)
  const [msg, setMsg] = useState('')
  const [version, setVersion] = useState('')

  const refresh = () => Snapper.getStatus().then(setStatus)
  useEffect(() => {
    refresh()
    if (!isNative) return
    CapApp.getInfo().then((i) => setVersion(`${i.version} (${i.build})`))
    const sub = CapApp.addListener('resume', refresh)
    return () => void sub.then((h) => h.remove())
  }, [])

  if (!isNative) return <p className="muted">Setup is only needed in the Android app. This web version is for the admin panel.</p>
  if (!status) return null

  const steps: [string, boolean, () => Promise<void>, string][] = [
    ['Blocker (Accessibility)', status.accessibility, Snapper.openAccessibilitySettings, 'Settings → Accessibility → Snapper → On'],
    ['Uninstall protection (Device admin)', status.deviceAdmin, Snapper.requestDeviceAdmin, 'Makes Snapper hard to remove'],
    ['Notifications', status.notifications, Snapper.requestNotifications, 'Needed for reminders'],
    ['Exact alarms', status.exactAlarms, Snapper.requestExactAlarms, 'Reminders ring on time'],
    ['Usage access (screen time)', status.usageAccess, Snapper.openUsageAccessSettings, 'Per-app screen time, like Digital Wellbeing'],
    ...(status.dnsLock
      ? [['Content filter (Private DNS)', status.dnsSet, Snapper.openPrivateDnsSettings, `Set Private DNS to ${status.dnsHost}`] as [string, boolean, () => Promise<void>, string]]
      : []),
  ]

  return (
    <>
      <h1>Setup</h1>
      <p className="muted">Turn everything on. Once the blocker is on, Snapper hides its own settings pages so it can't be switched off easily.</p>
      {steps.map(([name, on, action, hint]) => (
        <section key={name} className="spread">
          <div>
            <b>{name}</b>
            <div className="muted">{hint}</div>
          </div>
          {on ? <span className="ok">On</span> : <button className="primary" onClick={() => action().then(refresh)}>Turn on</button>}
        </section>
      ))}
      <section className="spread">
        <div>
          <b>Background sync</b>
          <div className="muted">Updates the blocker every 15 min even when Snapper is closed</div>
        </div>
        {status.hasDeviceToken ? (
          <span className="ok">On</span>
        ) : (
          <button className="primary" onClick={() => ensureDeviceRegistered().then(refresh).catch((e) => setMsg(e.message))}>Turn on</button>
        )}
      </section>
      <section>
        <b>What the blocker is enforcing</b>
        <div className="muted">
          {status.blockerSyncedAt
            ? `Last synced ${Math.max(0, Math.round((Date.now() - status.blockerSyncedAt) / 60000))} min ago · points ${status.blockerBalance} · ${status.blockerPenaltyLocked} payment apps locked`
            : 'Never synced: only the built-in defaults (Instagram, YouTube) are blocked.'}
        </div>
      </section>
      <button onClick={() => syncBlocker().then(() => refresh()).then(() => setMsg('Synced.')).catch((e) => setMsg(e.message))}>Sync now</button>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted">
        {version && <>Snapper {version} · </>}
        <Link to="/licenses">Licenses</Link>
      </p>
    </>
  )
}
