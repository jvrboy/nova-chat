// Second wave of backend tools: data generation, color, scheduling, MIDI.
import type { ToolDefinition } from './tools'
import { generateMidi, midiToBase64 } from './midi'

function need(input: Record<string, unknown>, key: string): string {
  const v = input[key]
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing required string field "${key}".`)
  return v
}

export const extraTools2: ToolDefinition[] = [
  {
    id: 'midi-generate', name: 'MIDI Composer', category: 'Content', risk: 'safe',
    description: 'Generate a professional song-structure MIDI file (humanized timing, voice leading, tension-release sections).',
    parameters: { type: 'object', properties: { key: { type: 'string' }, tempo: { type: 'number' }, bars: { type: 'number' }, style: { type: 'string' }, seed: { type: 'number' } } },
    run: async (input) => {
      const { bytes, meta } = generateMidi({ key: input.key as string, tempo: input.tempo as number, bars: input.bars as number, style: input.style as never, seed: input.seed as number })
      return { filename: `nova-${meta.style}-${meta.key}.mid`, base64: midiToBase64(bytes), meta }
    },
  },
  {
    id: 'color-palette', name: 'Color Palette Generator', category: 'Content', risk: 'safe',
    description: 'Generate a harmonious color palette (complementary, analogous, triadic) from a base hex color.',
    parameters: { type: 'object', properties: { base: { type: 'string' }, scheme: { type: 'string' } }, required: ['base'] },
    run: async (input) => {
      const base = need(input, 'base').replace('#', '')
      const scheme = String(input.scheme ?? 'analogous')
      const h = parseInt(base.slice(0, 2), 16) / 255, s = parseInt(base.slice(2, 4), 16) / 255, v = parseInt(base.slice(4, 6), 16) / 255
      const mx = Math.max(h, s, v), mn = Math.min(h, s, v), d = mx - mn
      let hue = 0; if (d) { if (mx === h) hue = ((s - v) / d) % 6; else if (mx === s) hue = (v - h) / d + 2; else hue = (h - s) / d + 4; hue *= 60; if (hue < 0) hue += 360 }
      const toHex = (hh: number) => { const c = v * (0.4 + 0.6 * (1 - Math.abs(((hh / 60) % 2) - 1))); const x = c * (1 - Math.abs(((hh / 60) % 2) - 1)); const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x]; return '#' + [r, g, b].map((n) => Math.round(n * 255).toString(16).padStart(2, '0')).join('') }
      const offsets: Record<string, number[]> = { complementary: [0, 180], analogous: [-30, 0, 30], triadic: [0, 120, 240], split: [0, 150, 210] }
      return { base: '#' + base, scheme, palette: (offsets[scheme] ?? offsets.analogous).map((o) => toHex((hue + o + 360) % 360)) }
    },
  },
  {
    id: 'cron-builder', name: 'Cron Expression Builder', category: 'Ops', risk: 'safe',
    description: 'Build a cron expression from plain-English frequency (hourly, daily, weekdays, weekly, monthly).',
    parameters: { type: 'object', properties: { frequency: { type: 'string' }, hour: { type: 'number' }, minute: { type: 'number' } }, required: ['frequency'] },
    run: async (input) => {
      const f = need(input, 'frequency').toLowerCase(); const h = Math.min(Math.max(Number(input.hour ?? 9), 0), 23); const m = Math.min(Math.max(Number(input.minute ?? 0), 0), 59)
      const map: Record<string, string> = { minutely: '* * * * *', hourly: `${m} * * * *`, daily: `${m} ${h} * * *`, weekdays: `${m} ${h} * * 1-5`, weekly: `${m} ${h} * * 1`, monthly: `${m} ${h} 1 * *`, 'every-5-minutes': '*/5 * * * *' }
      const cron = map[f] ?? map[f.replace(/\s+/g, '-')]
      if (!cron) throw new Error(`Unknown frequency "${f}". Try: minutely, hourly, daily, weekdays, weekly, monthly, every-5-minutes.`)
      return { frequency: f, cron, description: `Runs ${f} at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
    },
  },
  {
    id: 'data-generator', name: 'Mock Data Generator', category: 'Data', risk: 'safe',
    description: 'Generate realistic mock data rows (names, emails, numbers, dates, UUIDs) for testing.',
    parameters: { type: 'object', properties: { rows: { type: 'number' }, fields: { type: 'array' } } },
    run: async (input) => {
      const rows = Math.min(Math.max(Number(input.rows ?? 10), 1), 200)
      const fields = Array.isArray(input.fields) ? (input.fields as string[]) : ['id', 'name', 'email', 'age', 'created']
      const first = ['Ava', 'Liam', 'Maya', 'Noah', 'Zara', 'Kai', 'Ivy', 'Leo', 'Nina', 'Ezra'], last = ['Cole', 'Reyes', 'Kim', 'Patel', 'Novak', 'Silva', 'Chen', 'Brooks']
      const out = Array.from({ length: rows }, (_, i) => Object.fromEntries(fields.map((f) => {
        const fn = String(f).toLowerCase()
        const val = fn === 'id' ? i + 1 : fn === 'name' ? `${first[i % 10]} ${last[i % 8]}` : fn === 'email' ? `${first[i % 10].toLowerCase()}${i}@example.com` : fn === 'age' ? 18 + ((i * 7) % 50) : fn === 'created' ? new Date(Date.now() - i * 86400000).toISOString().slice(0, 10) : fn.includes('uuid') ? crypto.randomUUID() : `value-${i}`
        return [f, val]
      })))
      return { rows: out.length, fields, data: out }
    },
  },
]
