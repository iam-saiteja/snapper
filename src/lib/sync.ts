import type { DeviceState } from '../../shared/schema'
import { api, API_BASE } from './api'
import { isNative, Snapper } from './native'

/** Pull the server-computed blocker state and hand it to the native blocker. */
export async function syncBlocker(): Promise<DeviceState> {
  const state = await api.state()
  await pushState(state)
  return state
}

export async function pushState(state: DeviceState) {
  if (!isNative) return
  await Snapper.setState({ state })
}

/** One-time: give the background worker its own token so blocking keeps updating when the app is closed. */
export async function ensureDeviceRegistered() {
  if (!isNative) return
  const status = await Snapper.getStatus()
  if (status.hasDeviceToken) return
  const { token } = await api.registerDevice()
  await Snapper.setDeviceToken({ token, apiBase: API_BASE })
}
