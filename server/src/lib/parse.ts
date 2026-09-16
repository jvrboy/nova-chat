// Output parsing layer + middleware. Cleans and formats model/tool output:
// strips unwanted characters (zero-width, control chars, smart-quote noise
// artefacts), and normalizes line breaks & spacing for consistent rendering.

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function cleanOutput(input: string): string {
  let s = String(input ?? '')
  s = s.replace(ZERO_WIDTH, '')
  s = s.replace(CONTROL, '')
  s = s.replace(/\r\n?/g, '\n') // consistent line breaks
  s = s.replace(/[ \t]+\n/g, '\n') // no trailing spaces before newline
  s = s.replace(/\n{3,}/g, '\n\n') // collapse 3+ newlines
  s = s.replace(/[ \t]{2,}/g, ' ') // collapse runs of spaces/tabs
  // Normalize exotic unicode punctuation to plain ASCII where safe
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  s = s.replace(/\u2026/g, '...').replace(/[\u2013\u2014]/g, ' — ')
  return s.trim()
}

/** Hono-style middleware helper: clean a text field on the way out. */
export function parseMiddleware<T extends { text?: string; content?: string }>(obj: T): T {
  if (typeof obj.text === 'string') obj.text = cleanOutput(obj.text)
  if (typeof obj.content === 'string') obj.content = cleanOutput(obj.content)
  return obj
}

export function wordCount(text: string): number {
  return cleanOutput(text).split(/\s+/).filter(Boolean).length
}

export function stripHtml(text: string): string {
  return cleanOutput(String(text).replace(/<[^>]+>/g, ' '))
}

export function detectAnomalies(series: number[]): { index: number; value: number; z: number }[] {
  if (series.length < 4) return []
  const mean = series.reduce((a, b) => a + b, 0) / series.length
  const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length) || 1
  return series
    .map((v, i) => ({ index: i, value: v, z: (v - mean) / sd }))
    .filter((p) => Math.abs(p.z) >= 2.5)
}
