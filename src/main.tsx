import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { loadConfig } from './lib/config'
import { initSupabase } from './lib/supabase'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

// The Supabase settings come from this deployment's Worker, so they must load before anything uses them.
loadConfig()
  .then((config) => {
    initSupabase(config)
    root.render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>,
    )
  })
  .catch((e: Error) => {
    root.render(
      <main>
        <h1>Snapper can't start</h1>
        <p className="error">{e.message}</p>
        <p className="muted">Check your internet connection and try again. If this keeps happening, the server isn't configured yet.</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>,
    )
  })
