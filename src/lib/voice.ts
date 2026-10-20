import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { VoiceRecorder } from 'capacitor-voice-recorder'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

const LANG = 'en-IN'

export async function speak(text: string) {
  try {
    await TextToSpeech.speak({ text, lang: LANG, rate: 1.0 })
  } catch {
    // Web fallback (admin panel in a browser).
    if ('speechSynthesis' in window) speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { lang: LANG }))
  }
}

export const stopSpeaking = () => TextToSpeech.stop().catch(() => speechSynthesis?.cancel())

/** On-device speech to text. Returns the best match, or '' if nothing was heard. */
export async function listen(): Promise<string> {
  const perm = await SpeechRecognition.requestPermissions()
  if (perm.speechRecognition !== 'granted') throw new Error('microphone permission denied')
  const res = await SpeechRecognition.start({ language: LANG, maxResults: 1, partialResults: false, popup: true })
  return res.matches?.[0] ?? ''
}

export async function startRecording() {
  const perm = await VoiceRecorder.requestAudioRecordingPermission()
  if (!perm.value) throw new Error('microphone permission denied')
  await VoiceRecorder.startRecording()
}

export type Recording = { path: string; uri: string; base64: string; mimeType: string; durationMs: number }

/** Stops recording and saves the audio in app-private storage. Audio never leaves the phone except for transcription. */
export async function stopRecording(folder: 'notes' | 'reminders', id: string): Promise<Recording> {
  const { value } = await VoiceRecorder.stopRecording()
  const ext = value.mimeType.includes('webm') ? 'webm' : value.mimeType.includes('ogg') ? 'ogg' : 'm4a'
  const path = `${folder}/${id}.${ext}`
  const base64 = value.recordDataBase64 ?? ''
  await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true })
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data })
  return { path, uri, base64, mimeType: value.mimeType, durationMs: value.msDuration }
}

export async function playableSrc(path: string): Promise<string> {
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data })
  return Capacitor.convertFileSrc(uri)
}

export async function deleteRecording(path: string) {
  await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {})
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}
