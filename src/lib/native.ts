import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { DeviceState } from '../../shared/schema'

export type NativeStatus = {
  accessibility: boolean
  deviceAdmin: boolean
  exactAlarms: boolean
  notifications: boolean
  hasDeviceToken: boolean
  usageAccess: boolean
  dnsLock: boolean
  dnsSet: boolean
  dnsHost: string
  dnsSupported: boolean
  blockerSyncedAt: number
  blockerBalance: number
  blockerPenaltyLocked: number
}

export type InstalledApp = { package: string; name: string; category: string; payment: boolean; usageMs: number }

// Implemented in android/app/src/main/java/com/saiteja/snapper/SnapperPlugin.kt
interface SnapperPlugin {
  getStatus(): Promise<NativeStatus>
  openAccessibilitySettings(): Promise<void>
  requestDeviceAdmin(): Promise<void>
  requestExactAlarms(): Promise<void>
  requestNotifications(): Promise<void>
  setDeviceToken(o: { token: string; apiBase: string }): Promise<void>
  setState(o: { state: DeviceState }): Promise<void>
  scheduleReminder(o: { id: string; at: number; text: string; audioPath?: string }): Promise<void>
  cancelReminder(o: { id: string }): Promise<void>
  consumeSharedText(): Promise<{ text: string | null }>
  listApps(): Promise<{ apps: InstalledApp[]; usageAccess: boolean; categoriesSupported: boolean }>
  openUsageAccessSettings(): Promise<void>
  openPrivateDnsSettings(): Promise<void>
  addListener(event: 'shared', cb: (e: { text: string }) => void): Promise<PluginListenerHandle>
}

export const isNative = Capacitor.isNativePlatform()

const WebStub: SnapperPlugin = {
  getStatus: async () => ({
    accessibility: false,
    deviceAdmin: false,
    exactAlarms: false,
    notifications: false,
    hasDeviceToken: false,
    usageAccess: false,
    dnsLock: false,
    dnsSet: false,
    dnsHost: 'family.adguard-dns.com',
    dnsSupported: true,
    blockerSyncedAt: 0,
    blockerBalance: 0,
    blockerPenaltyLocked: 0,
  }),
  openAccessibilitySettings: async () => {},
  requestDeviceAdmin: async () => {},
  requestExactAlarms: async () => {},
  requestNotifications: async () => {},
  setDeviceToken: async () => {},
  setState: async () => {},
  scheduleReminder: async () => {},
  cancelReminder: async () => {},
  consumeSharedText: async () => ({ text: null }),
  listApps: async () => ({ apps: [], usageAccess: false, categoriesSupported: true }),
  openUsageAccessSettings: async () => {},
  openPrivateDnsSettings: async () => {},
  addListener: async () => ({ remove: async () => {} }),
}

export const Snapper = isNative ? registerPlugin<SnapperPlugin>('Snapper') : WebStub
