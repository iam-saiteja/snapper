import { useEffect, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { isNative, Snapper, type NativeStatus } from '../lib/native'
import { supabase } from '../lib/supabase'
import { ensureDeviceRegistered, syncBlocker } from '../lib/sync'

export default function Setup() {
  const [status, setStatus] = useState<NativeStatus | null>(null)
  const [msg, setMsg] = useState('')

  const refresh = () => Snapper.getStatus().then(setStatus)
  useEffect(() => {
    refresh()
    if (!isNative) return
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
      <button onClick={() => syncBlocker().then(() => setMsg('Synced.')).catch((e) => setMsg(e.message))}>Sync now</button>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      {msg && <p className="muted">{msg}</p>}
    </>
  )
}
