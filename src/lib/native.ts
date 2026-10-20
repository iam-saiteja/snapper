import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { DeviceState } from '../../shared/schema'

export type NativeStatus = {
  accessibility: boolean
  deviceAdmin: boolean
  exactAlarms: boolean
  notifications: boolean
  hasDeviceToken: boolean
}

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
  addListener(event: 'shared', cb: (e: { text: string }) => void): Promise<PluginListenerHandle>
}

export const isNative = Capacitor.isNativePlatform()

const WebStub: SnapperPlugin = {
  getStatus: async () => ({ accessibility: false, deviceAdmin: false, exactAlarms: false, notifications: false, hasDeviceToken: false }),
  openAccessibilitySettings: async () => {},
  requestDeviceAdmin: async () => {},
  requestExactAlarms: async () => {},
  requestNotifications: async () => {},
  setDeviceToken: async () => {},
  setState: async () => {},
  scheduleReminder: async () => {},
  cancelReminder: async () => {},
  consumeSharedText: async () => ({ text: null }),
  addListener: async () => ({ remove: async () => {} }),
}

export const Snapper = isNative ? registerPlugin<SnapperPlugin>('Snapper') : WebStub
