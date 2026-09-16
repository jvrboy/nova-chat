// Artifact engine — extracts durable artifacts from assistant replies:
// code blocks (```html, ```js, ```py, ...), media URLs (image/audio/MIDI),
// and long-form documents. Persists them in localStorage so they survive
// refreshes, and drives native playback/preview in the Artifacts view.

export type ArtifactType = 'html' | 'code' | 'image' | 'audio' | 'midi' | 'document'

export type Artifact = {
  id: string
  type: ArtifactType
  language?: string
  title: string
  content: string
  previewUrl?: string
  sourceTs: number
  createdAt: number
}

export type SourceMsg = { role: string; content: string; ts: number }

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'flac']
const MIDI_EXT = ['mid', 'midi']

function guessCodeTitle(code: string, lang: string): string {
  const t =
    code.match(/<title>([^<]+)<\/title>/i)?.[1] ??
    code.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] ??
    code.match(/^#\s+(.+)$/m)?.[1]
  return t ? t.trim() : `${lang.toUpperCase()} artifact`
}

function guessDocTitle(text: string): string {
  const h = text.match(/^#+\s+(.+)$/m)?.[1]
  if (h) return h.trim()
  return text.replace(/\s+/g, ' ').slice(0, 48) + '…'
}

export function extractArtifacts(msg: SourceMsg): Artifact[] {
  if (msg.role !== 'assistant' || !msg.content) return []
  const out: Artifact[] = []

  // 1. Fenced code blocks
  const codeRe = /```(\w+)?\s*\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = codeRe.exec(msg.content)) !== null) {
    const lang = (m[1] || 'text').toLowerCase()
    const code = m[2].trim()
    if (code.length < 20) continue
    const type: ArtifactType = lang === 'html' ? 'html' : 'code'
    out.push({
      id: `art-${msg.ts}-c${out.length}`,
      type,
      language: lang,
      title: guessCodeTitle(code, lang),
      content: code,
      sourceTs: msg.ts,
      createdAt: Date.now(),
    })
  }

  // 2. Media URLs (images, audio, MIDI)
  const mediaRe = /(https?:\/\/[^\s)"'<>]+\.(?:png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a|flac|midi?))(?:\?[^\s)"'<>]*)?/gi
  while ((m = mediaRe.exec(msg.content)) !== null) {
    const url = m[1]
    const ext = url.split('.').pop()!.toLowerCase()
    const type: ArtifactType = IMAGE_EXT.includes(ext) ? 'image' : MIDI_EXT.includes(ext) ? 'midi' : 'audio'
    out.push({
      id: `art-${msg.ts}-m${out.length}`,
      type,
      title: url.split('/').pop()!.split('?')[0],
      content: '',
      previewUrl: url,
      sourceTs: msg.ts,
      createdAt: Date.now(),
    })
  }

  // 3. Long-form documents (no code/media found)
  if (out.length === 0 && msg.content.length > 400) {
    out.push({
      id: `art-${msg.ts}-d`,
      type: 'document',
      title: guessDocTitle(msg.content),
      content: msg.content,
      sourceTs: msg.ts,
      createdAt: Date.now(),
    })
  }

  return out
}

// ---- Persistence ----
const KEY = 'nova.artifacts'

export function loadArtifacts(): Artifact[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Artifact[]
  } catch {
    return []
  }
}

export function saveArtifacts(items: Artifact[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-300)))
  } catch { /* storage full — keep in memory */ }
}

export function mergeArtifacts(existing: Artifact[], incoming: Artifact[]): Artifact[] {
  const seen = new Set(existing.map((a) => a.id))
  const fresh = incoming.filter((a) => !seen.has(a.id))
  return fresh.length ? [...existing, ...fresh] : existing
}

// ---- Actions ----
export function downloadArtifact(a: Artifact): void {
  const ext = a.type === 'html' ? 'html' : a.language ?? 'txt'
  const blob = new Blob([a.content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url
  el.download = `${a.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'artifact'}.${ext}`
  el.click()
  URL.revokeObjectURL(url)
}

export function openHtmlInNewTab(a: Artifact): void {
  const blob = new Blob([a.content], { type: 'text/html' })
  window.open(URL.createObjectURL(blob), '_blank', 'noopener')
}

export function artifactIcon(type: ArtifactType): string {
  switch (type) {
    case 'html': return '🧩'
    case 'code': return '𝄜'
    case 'image': return '🖼'
    case 'audio': return '🎧'
    case 'midi': return '🎹'
    case 'document': return '📄'
  }
}
