import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent, mode: 'in' | 'up') {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg(error.message)
    else if (mode === 'up') setMsg('Account created. If email confirmation is on, confirm it, then sign in.')
  }

  return (
    <main>
      <h1>Snapper</h1>
      <form onSubmit={(e) => submit(e, 'in')}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <button className="primary" disabled={busy}>Sign in</button>
        <button type="button" disabled={busy} onClick={(e) => submit(e, 'up')}>Create account</button>
      </form>
      {msg && <p className="error">{msg}</p>}
    </main>
  )
}
