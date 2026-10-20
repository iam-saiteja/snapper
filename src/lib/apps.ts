import type { DeviceState } from '../../shared/schema'
import type { InstalledApp } from './native'

export type AppStatus = 'unlocked' | 'blocked' | 'penalty' | 'penaltyIfNegative' | 'allowed'

const inCategories = (app: InstalledApp, categories: string[], except: string[]) =>
  !except.includes(app.package) && categories.some((c) => (c === 'payments' ? app.payment : c === app.category))

/** Same decision the native blocker makes (outside sleep hours). */
export function appStatus(app: InstalledApp, s: DeviceState): AppStatus {
  // An active unlock overrides blocking and penalty locks, exactly like the native blocker.
  if (unlockedUntil(app.package, s) > Date.now()) return 'unlocked'
  if (s.penaltyLocked.some((p) => p.package === app.package) || inCategories(app, s.penaltyLockedCategories, s.exceptApps)) {
    return 'penalty'
  }
  if (s.blocked.some((b) => b.package === app.package) || inCategories(app, s.blockCategories, s.exceptApps)) {
    return 'blocked'
  }
  const { apps, categories } = s.penaltyLockConfigured
  if (apps.some((p) => p.package === app.package) || inCategories(app, categories, s.exceptApps)) return 'penaltyIfNegative'
  return 'allowed'
}

/** Apps blocked by category (not listed explicitly), which can be unlocked at the category price. */
export function categoryBlocked(apps: InstalledApp[], s: DeviceState): InstalledApp[] {
  return apps.filter((a) => !s.blocked.some((b) => b.package === a.package) && inCategories(a, s.blockCategories, s.exceptApps))
}

/** Apps locked while points are negative, by category (for the emergency list). */
export function categoryPenalty(apps: InstalledApp[], s: DeviceState): InstalledApp[] {
  return apps.filter((a) => inCategories(a, s.penaltyLockedCategories, s.exceptApps))
}

export const formatMinutes = (ms: number) => {
  const m = Math.round(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

export const unlockedUntil = (pkg: string, s: DeviceState) =>
  s.unlocks.filter((u) => u.package === pkg).reduce((m, u) => Math.max(m, u.endsAt), 0)
