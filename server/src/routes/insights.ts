import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'

// ---------------------------------------------------------------------------
// /api/insights — new advanced backend capabilities, added on top of the ported
// market engine. Everything here is pure TypeScript + Web Crypto, so it runs
// entirely inside the Cloudflare Worker with zero native deps.
// ---------------------------------------------------------------------------

const insights = new Hono<AppEnv>()

const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function b64encode(str: string): string {
  return btoa(String.fromCharCode(...enc.encode(str)))
}
function b64decode(b64: string): string {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// --- Crypto / hashing toolkit ---------------------------------------------
// POST /api/insights/crypto { op, ... }
insights.post('/crypto', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const op = String(b.op ?? '')

  switch (op) {
    case 'hash': {
      const algo = String(b.algorithm ?? 'SHA-256').toUpperCase()
      const text = String(b.text ?? '')
      const allowed = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']
      if (!allowed.includes(algo)) return c.json({ error: `Unsupported algorithm: ${algo}. Use ${allowed.join(', ')}.` }, 400)
      const digest = await crypto.subtle.digest(algo as 'SHA-256', enc.encode(text))
      return c.json({ op, algorithm: algo, input: text, hex: toHex(digest) })
    }
    case 'hmac': {
      const algo = String(b.algorithm ?? 'SHA-256').toUpperCase()
      const key = String(b.key ?? '')
      const text = String(b.text ?? '')
      if (!key) return c.json({ error: 'hmac requires a "key"' }, 400)
      const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: algo }, false, ['sign'])
      const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(text))
      return c.json({ op, algorithm: `HMAC-${algo}`, hex: toHex(sig) })
    }
    case 'uuid': {
      const count = Math.min(Math.max(Number(b.count ?? 1) || 1, 1), 100)
      return c.json({ op, uuids: Array.from({ length: count }, () => crypto.randomUUID()) })
    }
    case 'random': {
      const bytes = Math.min(Math.max(Number(b.bytes ?? 16) || 16, 1), 256)
      const buf = new Uint8Array(bytes)
      crypto.getRandomValues(buf)
      return c.json({ op, bytes, hex: toHex(buf.buffer), base64: btoa(String.fromCharCode(...buf)) })
    }
    case 'password': {
      const length = Math.min(Math.max(Number(b.length ?? 20) || 20, 8), 128)
      const sets: Record<string, string> = {
        lower: 'abcdefghijklmnopqrstuvwxyz',
        upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        digits: '0123456789',
        symbols: '!@#$%^&*()-_=+[]{};:,.<>?/',
      }
      let pool = ''
      if (b.lower !== false) pool += sets.lower
      if (b.upper !== false) pool += sets.upper
      if (b.digits !== false) pool += sets.digits
      if (b.symbols !== false) pool += sets.symbols
      if (!pool) return c.json({ error: 'At least one character class must be enabled.' }, 400)
      const rnd = new Uint32Array(length)
      crypto.getRandomValues(rnd)
      const password = Array.from(rnd, (n) => pool[n % pool.length]).join('')
      return c.json({ op, length, password })
    }
    case 'b64e':
      return c.json({ op, output: b64encode(String(b.text ?? '')) })
    case 'b64d': {
      try {
        return c.json({ op, output: b64decode(String(b.text ?? '')) })
      } catch {
        return c.json({ error: 'Invalid Base64 input.' }, 400)
      }
    }
    default:
      return c.json({ error: `Unknown op: ${op}. Valid ops: hash, hmac, uuid, random, password, b64e, b64d.` }, 400)
  }
})

// --- Data transformer ------------------------------------------------------
// POST /api/insights/transform { from, to, data }
insights.post('/transform', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const from = String(b.from ?? 'json').toLowerCase()
  const to = String(b.to ?? 'json').toLowerCase()
  const data = b.data

  // Parse the input into a JS value first.
  let value: unknown
  try {
    if (from === 'json') value = typeof data === 'string' ? JSON.parse(data) : data
    else if (from === 'base64') value = b64decode(String(data ?? ''))
    else if (from === 'csv') value = csvToRows(String(data ?? ''))
    else if (from === 'text') value = String(data ?? '')
    else return c.json({ error: `Unsupported source format: ${from}. Use json, csv, base64, text.` }, 400)
  } catch (e) {
    return c.json({ error: `Failed to parse ${from}: ${e instanceof Error ? e.message : 'parse error'}` }, 400)
  }

  // Serialise to the target format.
  try {
    if (to === 'json') return c.json({ from, to, output: JSON.stringify(value, null, 2) })
    if (to === 'base64') return c.json({ from, to, output: b64encode(typeof value === 'string' ? value : JSON.stringify(value)) })
    if (to === 'csv') return c.json({ from, to, output: rowsToCsv(value) })
    if (to === 'yaml') return c.json({ from, to, output: toYaml(value) })
    if (to === 'text') return c.json({ from, to, output: typeof value === 'string' ? value : JSON.stringify(value) })
    return c.json({ error: `Unsupported target format: ${to}. Use json, csv, yaml, base64, text.` }, 400)
  } catch (e) {
    return c.json({ error: `Failed to serialise ${to}: ${e instanceof Error ? e.message : 'serialise error'}` }, 400)
  }
})

function csvToRows(csv: string): string[][] {
  return csv
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const out: string[] = []
      let cur = ''
      let inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') inQ = false
          else cur += ch
        } else if (ch === '"') inQ = true
        else if (ch === ',') { out.push(cur); cur = '' }
        else cur += ch
      }
      out.push(cur)
      return out
    })
}

function rowsToCsv(value: unknown): string {
  let rows: unknown[][]
  if (Array.isArray(value) && value.every((r) => Array.isArray(r))) rows = value as unknown[][]
  else if (Array.isArray(value) && value.every((r) => r && typeof r === 'object')) {
    const objs = value as Record<string, unknown>[]
    const keys = Array.from(new Set(objs.flatMap((o) => Object.keys(o))))
    rows = [keys, ...objs.map((o) => keys.map((k) => o[k]))]
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    rows = Object.entries(value as Record<string, unknown>)
  } else {
    rows = [[value]]
  }
  return rows
    .map((r) => r.map((cell) => {
      const s = cell == null ? '' : String(cell)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
}

function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return /[:#\n"']/.test(value) ? JSON.stringify(value) : value
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return value.map((v) => `${pad}- ${typeof v === 'object' && v !== null ? '\n' + toYaml(v, indent + 1) : toYaml(v, 0)}`).join('\n')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length) return '{}'
  return entries.map(([k, v]) => `${pad}${k}: ${typeof v === 'object' && v !== null ? '\n' + toYaml(v, indent + 1) : toYaml(v, 0)}`).join('\n')
}

// --- Text intelligence ------------------------------------------------------
// POST /api/insights/text { text, ops?: [...] }
insights.post('/text', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const text = String(b.text ?? '')
  if (!text) return c.json({ error: 'Provide "text".' }, 400)

  const words = text.trim().split(/\s+/).filter(Boolean)
  const sentences = text.split(/[.!?]+\s*/).filter((s) => s.trim().length > 0)
  const freq = new Map<string, number>()
  for (const w of words) {
    const key = w.toLowerCase().replace(/[^a-z0-9'-]/g, '')
    if (key) freq.set(key, (freq.get(key) ?? 0) + 1)
  }
  const topWords = Array.from(freq.entries()).sort((a, z) => z[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }))
  const chars = text.length
  const readTimeMin = words.length / 200
  const avgWordLen = words.length ? words.reduce((s, w) => s + w.length, 0) / words.length : 0
  const avgSentenceLen = sentences.length ? words.length / sentences.length : 0

  return c.json({
    characters: chars,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    words: words.length,
    uniqueWords: freq.size,
    sentences: sentences.length,
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length,
    averageWordLength: Number(avgWordLen.toFixed(2)),
    averageSentenceLength: Number(avgSentenceLen.toFixed(2)),
    readingTimeMinutes: Number(readTimeMin.toFixed(2)),
    topWords,
  })
})

export default insights
