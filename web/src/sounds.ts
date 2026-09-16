// Nova sound engine — plays the converted MP3s served from /sounds/ on the
// Pages project (same origin). All playback respects the user's sound settings
// (enabled, volume, per-event toggles) and is lazy-loaded + cached.

export type SoundName =
  | 'click' | 'tap' | 'send' | 'receive' | 'notification'
  | 'sweep' | 'success' | 'error' | 'pop' | 'whoosh'

const cache = new Map<SoundName, HTMLAudioElement>()
let unlocked = false

function getAudio(name: SoundName): HTMLAudioElement {
  let a = cache.get(name)
  if (!a) {
    a = new Audio(`/sounds/${name}.mp3`)
    a.preload = 'auto'
    cache.set(name, a)
  }
  return a
}

/** Call once on first user interaction so autoplay policies allow playback. */
export function unlockAudio(): void {
  if (unlocked) return
  unlocked = true
  // Preload all sounds silently.
  for (const name of cache.keys()) getAudio(name).load()
}

export type SoundSettings = {
  enabled: boolean
  volume: number // 0..100
  sendSound: boolean
  receiveSound: boolean
}

let settings: SoundSettings = { enabled: false, volume: 50, sendSound: false, receiveSound: true }

export function configureSounds(s: Partial<SoundSettings>): void {
  settings = { ...settings, ...s }
}

export function playSound(name: SoundName, opts?: { force?: boolean; volume?: number }): void {
  const vol = (opts?.volume ?? settings.volume) / 100
  // Event-specific gating
  if (!opts?.force) {
    if (!settings.enabled) return
    if (name === 'send' && !settings.sendSound) return
    if (name === 'receive' && !settings.receiveSound) return
  }
  try {
    const a = getAudio(name).cloneNode() as HTMLAudioElement
    a.volume = Math.max(0, Math.min(1, vol))
    void a.play().catch(() => { /* autoplay blocked until first interaction — fine */ })
  } catch { /* ignore */ }
}

// Convenience wrappers for common app events.
export const sounds = {
  click: () => playSound('click'),
  tap: () => playSound('tap'),
  send: () => playSound('send'),
  receive: () => playSound('receive'),
  notify: () => playSound('notification'),
  success: () => playSound('success'),
  error: () => playSound('error'),
  pop: () => playSound('pop'),
  whoosh: () => playSound('whoosh'),
}
