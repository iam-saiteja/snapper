import { Capacitor } from '@capacitor/core'

// The web app is served by the Worker, so its API is same-origin. The Android app is built with
// VITE_API_BASE (a GitHub repository variable in CI, or .env.development.local for local dev).
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''

export type ClientConfig = { supabaseUrl: string; supabasePublishableKey: string }

const CACHE_KEY = 'snapper.config'

function cached(): ClientConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as ClientConfig) : null
  } catch {
    return null
  }
}

async function fetchConfig(): Promise<ClientConfig> {
  const res = await fetch(`${API_BASE}/api/config`, { signal: AbortSignal.timeout(10_000) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `config request failed (HTTP ${res.status})`)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // Private mode / storage disabled: fine, we'll fetch again next start.
  }
  return data as ClientConfig
}

/**
 * Public settings (Supabase URL + publishable key) come from this deployment's Worker, so no one's values
 * live in the code. A cached copy lets the app start offline; it's refreshed in the background.
 */
export async function loadConfig(): Promise<ClientConfig> {
  if (Capacitor.isNativePlatform() && !API_BASE) {
    throw new Error('This build has no API address. Set the SNAPPER_API_BASE repository variable and rebuild the APK.')
  }
  const saved = cached()
  if (saved) {
    fetchConfig().catch(() => {})
    return saved
  }
  return fetchConfig()
}
