import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { isNative, Snapper } from './lib/native'
import { ensureDeviceRegistered, syncBlocker } from './lib/sync'
import Login from './pages/Login'
import Today from './pages/Today'
import Calendar from './pages/Calendar'
import Quiz from './pages/Quiz'
import Notes from './pages/Notes'
import Reminders from './pages/Reminders'
import Links from './pages/Links'
import Admin from './pages/Admin'
import Setup from './pages/Setup'
import Apps from './pages/Apps'
import Licenses from './pages/Licenses'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Keep the native blocker in sync whenever the app is opened or resumed.
  useEffect(() => {
    if (!session) return
    const sync = () => ensureDeviceRegistered().then(syncBlocker).catch((e) => console.warn('sync failed', e))
    sync()
    if (!isNative) return
    const resume = CapApp.addListener('resume', sync)
    return () => void resume.then((h) => h.remove())
  }, [session])

  // Links/reels shared to Snapper from Instagram, YouTube, etc.
  useEffect(() => {
    if (!session || !isNative) return
    const open = (text: string) => navigate(`/links?shared=${encodeURIComponent(text)}`)
    Snapper.consumeSharedText().then(({ text }) => text && open(text))
    const sub = Snapper.addListener('shared', (e) => open(e.text))
    return () => void sub.then((h) => h.remove())
  }, [session, navigate])

  if (session === undefined) return <main className="muted">Loading…</main>
  if (!session) return <Login />

  return (
    <>
      <main>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/quiz/:taskId" element={<Quiz />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/links" element={<Links />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/apps" element={<Apps />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/licenses" element={<Licenses />} />
        </Routes>
      </main>
      <nav>
        <NavLink to="/" end>Today</NavLink>
        <NavLink to="/calendar">Calendar</NavLink>
        <NavLink to="/notes">Notes</NavLink>
        <NavLink to="/reminders">Remind</NavLink>
        <NavLink to="/links">Links</NavLink>
        <NavLink to="/apps">Apps</NavLink>
        <NavLink to="/admin">Admin</NavLink>
        <NavLink to="/setup">Setup</NavLink>
      </nav>
    </>
  )
}
