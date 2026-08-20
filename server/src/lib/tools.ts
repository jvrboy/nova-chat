import type { Bindings } from './types'
import { evaluateExpression } from './calc'
import { chatComplete, generateText } from './llm'
import { newId, nowIso } from './ids'
import { sha256Hex } from './crypto'
import { semanticSearch } from './embeddings'
import { kaggleSearchDatasets, kaggleGetDatasetInfo, kaggleDownloadDataset, kaggleSearchKernels, kaggleStatus } from './kaggle'
import { e2bRunCode, e2bStatus } from './e2b'
import { supabaseSelect, supabaseUpsert, supabaseDelete, supabaseStatus } from './supabase'
import { extractFirstMatchingFile } from './zip'

export type ToolRisk = 'safe' | 'review' | 'sensitive'
export type ToolContext = { env: Bindings; workspaceId: string; actorId: string; db?: D1Database }
export type ToolDefinition = {
  id: string
  name: string
  description: string
  category: 'Utilities' | 'Cognition' | 'Productivity' | 'Data' | 'Ops' | 'Content'
  risk: ToolRisk
  parameters: Record<string, unknown>
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing required string field "${key}".`)
  return value
}

// ---- Tool implementations -------------------------------------------------

const calculatorTool: ToolDefinition = {
  id: 'calculator',
  name: 'Calculator',
  description: 'Evaluate a numeric arithmetic expression safely (+ - * / % ^ and parentheses). No code execution.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { expression: { type: 'string', description: 'e.g. "(3 + 4) * 2 / 7"' } }, required: ['expression'] },
  run: async (input) => {
    const expression = requireString(input, 'expression')
    const result = evaluateExpression(expression)
    return { expression, result }
  },
}

const wordCountTool: ToolDefinition = {
  id: 'word-count',
  name: 'Word Counter',
  description: 'Count words, characters, and sentences in a piece of text.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    const words = text.trim().split(/\s+/).filter(Boolean)
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
    return { words: words.length, characters: text.length, sentences: sentences.length }
  },
}

const redactTool: ToolDefinition = {
  id: 'redact',
  name: 'PII Redactor',
  description: 'Detect and redact emails, phone numbers, and API-key-like tokens from text.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    const patterns: Array<[RegExp, string]> = [
      [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]'],
      [/\b\+?\d[\d\s().-]{7,}\d\b/g, '[REDACTED_PHONE]'],
      [/\b(sk|pk|ghp|github_pat|xox[baprs])[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_TOKEN]'],
      [/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]'],
    ]
    let redacted = text
    let hits = 0
    for (const [pattern, replacement] of patterns) {
      redacted = redacted.replace(pattern, () => { hits += 1; return replacement })
    }
    return { redacted, matches: hits }
  },
}

const jsonFormatTool: ToolDefinition = {
  id: 'json-format',
  name: 'JSON Formatter',
  description: 'Validate and pretty-print a JSON string, or minify it.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { json: { type: 'string' }, mode: { type: 'string', enum: ['pretty', 'minify'] } }, required: ['json'] },
  run: async (input) => {
    const raw = requireString(input, 'json')
    const mode = (input.mode as string) === 'minify' ? 'minify' : 'pretty'
    const parsed = JSON.parse(raw)
    return { formatted: mode === 'pretty' ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed) }
  },
}

const hashTool: ToolDefinition = {
  id: 'hash',
  name: 'Hash Generator',
  description: 'Generate a SHA-256 hash of a text input (useful for fingerprinting content or checking integrity).',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    return { sha256: await sha256Hex(text) }
  },
}

const summarizeTool: ToolDefinition = {
  id: 'summarize',
  name: 'Summarizer',
  description: 'Use the language model to compress a long piece of text into a short brief.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, style: { type: 'string', enum: ['brief', 'bullets', 'executive'] } }, required: ['text'] },
  run: async (input, ctx) => {
    const text = requireString(input, 'text')
    const style = (input.style as string) || 'brief'
    const instructions: Record<string, string> = {
      brief: 'Summarize the text in 2-3 concise sentences.',
      bullets: 'Summarize the text as 3-6 short bullet points, one idea per line.',
      executive: 'Write a short executive summary (audience: a busy decision maker) with a clear recommendation.',
    }
    const summary = await generateText(ctx.env, `You are a precise summarization tool. ${instructions[style] ?? instructions.brief}`, text)
    return { summary, style }
  },
}

const translateTool: ToolDefinition = {
  id: 'translate',
  name: 'Translator',
  description: 'Translate text into a target language using the language model.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, targetLanguage: { type: 'string' } }, required: ['text', 'targetLanguage'] },
  run: async (input, ctx) => {
    const text = requireString(input, 'text')
    const targetLanguage = requireString(input, 'targetLanguage')
    const translated = await generateText(ctx.env, `Translate the user's text into ${targetLanguage}. Return only the translation, no notes.`, text)
    return { translated, targetLanguage }
  },
}

const sentimentTool: ToolDefinition = {
  id: 'sentiment',
  name: 'Sentiment Analyzer',
  description: 'Classify the sentiment of a piece of text as positive, neutral, or negative with a short rationale.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: async (input, ctx) => {
    const text = requireString(input, 'text')
    const raw = await generateText(
      ctx.env,
      'Classify sentiment. Respond ONLY as compact JSON: {"label":"positive|neutral|negative","confidence":0-1,"rationale":"..."}',
      text
    )
    try {
      return JSON.parse(raw.trim().replace(/^```json\s*|```$/g, ''))
    } catch {
      return { label: 'unknown', confidence: 0, rationale: raw }
    }
  },
}

const codeExplainTool: ToolDefinition = {
  id: 'code-explain',
  name: 'Code Explainer',
  description: 'Explain what a snippet of code does in plain language. Does not execute the code.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string' } }, required: ['code'] },
  run: async (input, ctx) => {
    const code = requireString(input, 'code')
    const language = (input.language as string) || 'unknown'
    const explanation = await generateText(
      ctx.env,
      `You are a senior engineer. Explain what this ${language} code does, step by step, in plain language. Do not execute it.`,
      code
    )
    return { explanation, language }
  },
}

const webFetchTool: ToolDefinition = {
  id: 'web-fetch',
  name: 'Web Page Fetcher',
  description: 'Fetch a public web page over HTTPS and return its readable text content (first ~4000 characters).',
  category: 'Data',
  risk: 'review',
  parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  run: async (input) => {
    const url = requireString(input, 'url')
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('Invalid URL.') }
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS URLs are allowed.')
    const response = await fetch(parsed.toString(), { headers: { Accept: 'text/html,text/plain' } })
    if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    const raw = await response.text()
    const text = contentType.includes('html')
      ? raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : raw
    return { url: parsed.toString(), status: response.status, contentType, excerpt: text.slice(0, 4000) }
  },
}

const dateMathTool: ToolDefinition = {
  id: 'date-math',
  name: 'Date Calculator',
  description: 'Add or subtract days/hours from a date, or compute the difference between two ISO dates.',
  category: 'Utilities',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['add', 'diff'] },
      date: { type: 'string', description: 'ISO date string' },
      days: { type: 'number' },
      hours: { type: 'number' },
      otherDate: { type: 'string', description: 'ISO date string, required for diff mode' },
    },
    required: ['mode', 'date'],
  },
  run: async (input) => {
    const mode = requireString(input, 'mode')
    const date = new Date(requireString(input, 'date'))
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date.')
    if (mode === 'add') {
      const days = Number(input.days ?? 0)
      const hours = Number(input.hours ?? 0)
      const result = new Date(date.getTime() + days * 86_400_000 + hours * 3_600_000)
      return { result: result.toISOString() }
    }
    if (mode === 'diff') {
      const other = new Date(requireString(input, 'otherDate'))
      if (Number.isNaN(other.getTime())) throw new Error('Invalid otherDate.')
      const diffMs = Math.abs(other.getTime() - date.getTime())
      return { diffMs, diffHours: diffMs / 3_600_000, diffDays: diffMs / 86_400_000 }
    }
    throw new Error('mode must be "add" or "diff".')
  },
}

const uuidTool: ToolDefinition = {
  id: 'uuid-generate',
  name: 'UUID Generator',
  description: 'Generate one or more random UUIDs (v4).',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { count: { type: 'number' } } },
  run: async (input) => {
    const count = Math.min(Math.max(Number(input.count ?? 1), 1), 50)
    return { uuids: Array.from({ length: count }, () => crypto.randomUUID()) }
  },
}

const riskScoreTool: ToolDefinition = {
  id: 'risk-score',
  name: 'Content Risk Scorer',
  description: 'Score a piece of text or a planned action from 0-100 for operational risk, using heuristics (destructive verbs, external network calls, credentials).',
  category: 'Ops',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text').toLowerCase()
    let score = 0
    const flags: string[] = []
    const checks: Array<[RegExp, number, string]> = [
      [/\b(delete|drop|truncate|wipe|rm -rf|shutdown)\b/, 35, 'destructive-verb'],
      [/\b(curl|fetch|http:|https:|webhook)\b/, 15, 'network-call'],
      [/\b(password|secret|api[_ -]?key|token|credential)\b/, 25, 'credential-mention'],
      [/\b(production|prod\b)/, 15, 'production-scope'],
      [/\ball\b.*\b(users|records|data)\b/, 10, 'broad-scope'],
    ]
    for (const [pattern, weight, flag] of checks) {
      if (pattern.test(text)) { score += weight; flags.push(flag) }
    }
    score = Math.min(score, 100)
    const level = score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low'
    return { score, level, flags }
  },
}

const chunkTextTool: ToolDefinition = {
  id: 'chunk-text',
  name: 'Text Chunker',
  description: 'Split a long text into chunks of roughly N characters, breaking on sentence boundaries where possible (useful for indexing or feeding to an LLM in pieces).',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, chunkSize: { type: 'number' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    const chunkSize = Math.min(Math.max(Number(input.chunkSize ?? 800), 100), 4000)
    const sentences = text.split(/(?<=[.!?])\s+/)
    const chunks: string[] = []
    let current = ''
    for (const sentence of sentences) {
      if ((current + ' ' + sentence).length > chunkSize && current) {
        chunks.push(current.trim())
        current = sentence
      } else {
        current = current ? `${current} ${sentence}` : sentence
      }
    }
    if (current.trim()) chunks.push(current.trim())
    return { chunks, count: chunks.length }
  },
}

const qrPayloadTool: ToolDefinition = {
  id: 'qr-payload',
  name: 'QR Payload Builder',
  description: 'Build a properly formatted payload string for common QR code use cases (URL, WiFi, vCard, plain text) — does not render an image.',
  category: 'Utilities',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['url', 'wifi', 'text'] },
      url: { type: 'string' },
      ssid: { type: 'string' },
      password: { type: 'string' },
      security: { type: 'string', enum: ['WPA', 'WEP', 'nopass'] },
      text: { type: 'string' },
    },
    required: ['kind'],
  },
  run: async (input) => {
    const kind = requireString(input, 'kind')
    if (kind === 'url') return { payload: requireString(input, 'url') }
    if (kind === 'wifi') {
      const ssid = requireString(input, 'ssid')
      const security = (input.security as string) || 'WPA'
      const password = (input.password as string) || ''
      return { payload: `WIFI:T:${security};S:${ssid};P:${password};;` }
    }
    if (kind === 'text') return { payload: requireString(input, 'text') }
    throw new Error('Unsupported kind.')
  },
}

const pdfExtractTool: ToolDefinition = {
  id: 'pdf-extract',
  name: 'PDF Text Extractor',
  description: 'Extract plain text from a PDF file already uploaded via /api/files (pass its fileId). Useful before summarizing or chunking a document.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] },
  run: async (input, ctx) => {
    const fileId = requireString(input, 'fileId')
    if (!ctx.db) throw new Error('Database not available in this context.')
    const file = await ctx.db.prepare('SELECT r2_key, name, mime_type FROM files WHERE id = ? AND workspace_id = ?').bind(fileId, ctx.workspaceId).first<{ r2_key: string; name: string; mime_type: string }>()
    if (!file) throw new Error('File not found.')
    if (!ctx.env.BUCKET) throw new Error('File storage (R2) is not configured.')
    const object = await ctx.env.BUCKET.get(file.r2_key)
    if (!object) throw new Error('File content missing from storage.')
    const { extractText } = await import('unpdf')
    const buffer = await object.arrayBuffer()
    const { text, totalPages } = await extractText(new Uint8Array(buffer), { mergePages: true })
    return { fileName: file.name, pages: totalPages, text: (text as string).slice(0, 20000) }
  },
}

const ocrImageTool: ToolDefinition = {
  id: 'ocr-image',
  name: 'Image OCR / Describer',
  description: 'Read text out of an image (screenshot, photo of a document, whiteboard, receipt) using the vision-capable LLM, and/or describe the image contents.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { imageUrl: { type: 'string', description: 'Publicly reachable image URL' }, mode: { type: 'string', enum: ['transcribe', 'describe'] } }, required: ['imageUrl'] },
  run: async (input, ctx) => {
    const imageUrl = requireString(input, 'imageUrl')
    const mode = (input.mode as string) === 'describe' ? 'describe' : 'transcribe'
    const instruction = mode === 'transcribe'
      ? 'Transcribe all visible text in this image exactly, preserving line breaks. If there is no text, say "No text found."'
      : 'Describe what is shown in this image in 2-4 sentences.'
    const completion = await chatComplete(ctx.env, {
      messages: [
        { role: 'system', content: 'You are a precise OCR and image description tool.' },
        { role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image_url', image_url: { url: imageUrl } }] as any },
      ],
      temperature: 0.1,
    })
    return { mode, result: completion.message.content ?? '' }
  },
}

const semanticRecallTool: ToolDefinition = {
  id: 'semantic-recall',
  name: 'Semantic Memory Recall',
  description: 'Search stored memories and past messages by meaning (not just keyword) to find the most relevant context for a query. This is real vector/RAG retrieval.',
  category: 'Cognition',
  risk: 'safe',
  parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
  run: async (input, ctx) => {
    const query = requireString(input, 'query')
    const limit = Math.min(Math.max(Number(input.limit ?? 5), 1), 20)
    if (!ctx.db) throw new Error('Database not available in this context.')
    const matches = await semanticSearch(ctx.env, ctx.db, ctx.workspaceId, query, limit)
    return { matches }
  },
}

const entityExtractTool: ToolDefinition = {
  id: 'entity-extract',
  name: 'Entity Extractor',
  description: 'Extract structured entities (people, organizations, dates, locations, monetary amounts) from free text as JSON, using the language model.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: async (input, ctx) => {
    const text = requireString(input, 'text')
    const raw = await generateText(
      ctx.env,
      'Extract named entities from the text. Respond ONLY as compact JSON: {"people":[],"organizations":[],"dates":[],"locations":[],"amounts":[]}',
      text
    )
    try { return JSON.parse(raw.trim().replace(/^```json\s*|```$/g, '')) } catch { return { people: [], organizations: [], dates: [], locations: [], amounts: [], raw } }
  },
}

const classifyTool: ToolDefinition = {
  id: 'classify',
  name: 'Text Classifier',
  description: 'Classify a piece of text into one of a provided set of labels, with a confidence score.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } }, required: ['text', 'labels'] },
  run: async (input, ctx) => {
    const text = requireString(input, 'text')
    const labels = Array.isArray(input.labels) ? (input.labels as string[]) : []
    if (!labels.length) throw new Error('Provide at least one label.')
    const raw = await generateText(
      ctx.env,
      `Classify the text into exactly one of these labels: ${labels.join(', ')}. Respond ONLY as compact JSON: {"label":"...","confidence":0-1}`,
      text
    )
    try { return JSON.parse(raw.trim().replace(/^```json\s*|```$/g, '')) } catch { return { label: labels[0], confidence: 0, raw } }
  },
}

const diffTextTool: ToolDefinition = {
  id: 'diff-text',
  name: 'Text Diff',
  description: 'Compute a line-level diff between two pieces of text (added/removed/unchanged lines).',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { before: { type: 'string' }, after: { type: 'string' } }, required: ['before', 'after'] },
  run: async (input) => {
    const before = requireString(input, 'before').split('\n')
    const after = requireString(input, 'after').split('\n')
    // Simple LCS-based line diff — sufficient for note/document comparisons.
    const m = before.length, n = after.length
    const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    const ops: Array<{ type: 'unchanged' | 'added' | 'removed'; line: string }> = []
    let i = 0, j = 0
    while (i < m && j < n) {
      if (before[i] === after[j]) { ops.push({ type: 'unchanged', line: before[i] }); i++; j++ }
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ type: 'removed', line: before[i] }); i++ }
      else { ops.push({ type: 'added', line: after[j] }); j++ }
    }
    while (i < m) { ops.push({ type: 'removed', line: before[i] }); i++ }
    while (j < n) { ops.push({ type: 'added', line: after[j] }); j++ }
    return { ops, added: ops.filter((o) => o.type === 'added').length, removed: ops.filter((o) => o.type === 'removed').length }
  },
}

const regexExtractTool: ToolDefinition = {
  id: 'regex-extract',
  name: 'Regex Extractor',
  description: 'Extract all matches of a regular expression from text. Useful for pulling structured tokens (IDs, codes, tags) out of unstructured input.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, pattern: { type: 'string' }, flags: { type: 'string' } }, required: ['text', 'pattern'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    const pattern = requireString(input, 'pattern')
    const flags = (typeof input.flags === 'string' ? input.flags : 'g').includes('g') ? (input.flags as string) : `${input.flags ?? ''}g`
    let regex: RegExp
    try { regex = new RegExp(pattern, flags) } catch { throw new Error('Invalid regular expression.') }
    const matches = [...text.matchAll(regex)].map((m) => m[0])
    return { matches, count: matches.length }
  },
}

const unitConvertTool: ToolDefinition = {
  id: 'unit-convert',
  name: 'Unit Converter',
  description: 'Convert a numeric value between common units of length, weight, temperature, or data size.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { value: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['value', 'from', 'to'] },
  run: async (input) => {
    const value = Number(input.value)
    const from = requireString(input, 'from').toLowerCase()
    const to = requireString(input, 'to').toLowerCase()
    const tables: Record<string, Record<string, number>> = {
      length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
      weight: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.45359237, oz: 0.028349523125, t: 1000 },
      data: { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 },
    }
    if (from === 'c' || from === 'f' || from === 'k' || to === 'c' || to === 'f' || to === 'k') {
      const toCelsius: Record<string, (v: number) => number> = { c: (v) => v, f: (v) => (v - 32) * (5 / 9), k: (v) => v - 273.15 }
      const fromCelsius: Record<string, (v: number) => number> = { c: (v) => v, f: (v) => v * (9 / 5) + 32, k: (v) => v + 273.15 }
      if (!toCelsius[from] || !fromCelsius[to]) throw new Error('Unsupported temperature unit.')
      return { result: fromCelsius[to](toCelsius[from](value)), from, to }
    }
    for (const table of Object.values(tables)) {
      if (table[from] !== undefined && table[to] !== undefined) {
        return { result: (value * table[from]) / table[to], from, to }
      }
    }
    throw new Error(`Unsupported or mismatched units: "${from}" -> "${to}".`)
  },
}

const csvToJsonTool: ToolDefinition = {
  id: 'csv-to-json',
  name: 'CSV to JSON',
  description: 'Parse a CSV string (with a header row) into an array of JSON objects.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { csv: { type: 'string' } }, required: ['csv'] },
  run: async (input) => {
    const csv = requireString(input, 'csv')
    const lines = csv.trim().split(/\r?\n/).filter(Boolean)
    if (!lines.length) return { rows: [] }
    const parseLine = (line: string) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map((line) => {
      const cells = parseLine(line)
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = cells[idx] ?? '' })
      return row
    })
    return { rows, count: rows.length }
  },
}

const scheduleParseTool: ToolDefinition = {
  id: 'schedule-parse',
  name: 'Natural Language Scheduler',
  description: 'Parse a natural-language time expression (e.g. "tomorrow at 3pm", "in 2 hours", "next monday") relative to now into an ISO timestamp, using the language model.',
  category: 'Productivity',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, nowIso: { type: 'string' } }, required: ['text'] },
  run: async (input, ctx) => {
    const text = requireString(input, 'text')
    const referenceNow = (input.nowIso as string) || new Date().toISOString()
    const raw = await generateText(
      ctx.env,
      `The current time is ${referenceNow} (ISO 8601, UTC). Parse the user's natural-language time expression into a single ISO 8601 UTC timestamp. Respond ONLY as compact JSON: {"iso":"...","interpretation":"short explanation"}`,
      text
    )
    try { return JSON.parse(raw.trim().replace(/^```json\s*|```$/g, '')) } catch { return { iso: null, interpretation: raw } }
  },
}

const codeGenerateTool: ToolDefinition = {
  id: 'code-generate',
  name: 'Code Generator',
  description: 'Generate a small code snippet for a described task, in a specified language. Returns code only — never executes it.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { description: { type: 'string' }, language: { type: 'string' } }, required: ['description', 'language'] },
  run: async (input, ctx) => {
    const description = requireString(input, 'description')
    const language = requireString(input, 'language')
    const code = await generateText(
      ctx.env,
      `You are a senior ${language} engineer. Write a small, correct, idiomatic ${language} snippet for the requested task. Respond with ONLY the code in a single fenced code block, no prose.`,
      description
    )
    return { code: code.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim(), language }
  },
}

const webSearchSummaryTool: ToolDefinition = {
  id: 'web-search-summary',
  name: 'Multi-Page Web Summary',
  description: 'Fetches multiple public HTTPS pages and produces one combined summary across them (useful for quick multi-source research).',
  category: 'Data',
  risk: 'review',
  parameters: { type: 'object', properties: { urls: { type: 'array', items: { type: 'string' } }, focus: { type: 'string' } }, required: ['urls'] },
  run: async (input, ctx) => {
    const urls = Array.isArray(input.urls) ? (input.urls as string[]).slice(0, 5) : []
    if (!urls.length) throw new Error('Provide at least one URL.')
    const excerpts: string[] = []
    for (const url of urls) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:') continue
        const response = await fetch(parsed.toString(), { headers: { Accept: 'text/html,text/plain' } })
        if (!response.ok) continue
        const raw = await response.text()
        const text = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        excerpts.push(`SOURCE: ${url}\n${text.slice(0, 3000)}`)
      } catch { /* skip unreachable URLs */ }
    }
    if (!excerpts.length) throw new Error('None of the provided URLs could be fetched.')
    const focus = (input.focus as string) || 'the key facts'
    const summary = await generateText(
      ctx.env,
      `Summarize ${focus} across the following sources. Cite which source each claim came from.`,
      excerpts.join('\n\n---\n\n')
    )
    return { summary, sourcesUsed: excerpts.length }
  },
}

// ---- Kaggle tools (real-world dataset access) -----------------------------

const kaggleSearchTool: ToolDefinition = {
  id: 'kaggle-dataset-search',
  name: 'Kaggle Dataset Search',
  description: 'Search Kaggle for public datasets by keyword. Returns titles, owners, sizes, and popularity so the analyst agent can choose a real dataset to work with.',
  category: 'Data',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      sortBy: { type: 'string', enum: ['hottest', 'votes', 'updated', 'active'] },
      maxResults: { type: 'number' },
    },
    required: ['query'],
  },
  run: async (input, ctx) => {
    const query = requireString(input, 'query')
    const datasets = await kaggleSearchDatasets(ctx.env, ctx.db, query, {
      sortBy: (input.sortBy as string) || 'hottest',
      maxResults: Number(input.maxResults ?? 10),
    })
    return { query, count: datasets.length, datasets }
  },
}

const kaggleInfoTool: ToolDefinition = {
  id: 'kaggle-dataset-info',
  name: 'Kaggle Dataset Info',
  description: 'Get full metadata (description, license, size, last updated) for a specific Kaggle dataset given its "owner/dataset" reference (e.g. from kaggle-dataset-search results).',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { ref: { type: 'string', description: 'e.g. "heptapod/titanic"' } }, required: ['ref'] },
  run: async (input, ctx) => {
    const ref = requireString(input, 'ref')
    const [ownerSlug, datasetSlug] = ref.split('/')
    if (!ownerSlug || !datasetSlug) throw new Error('ref must be in "owner/dataset" form.')
    return await kaggleGetDatasetInfo(ctx.env, ctx.db, ownerSlug, datasetSlug)
  },
}

const kaggleDownloadTool: ToolDefinition = {
  id: 'kaggle-dataset-download',
  name: 'Kaggle Dataset Download',
  description: 'Download a Kaggle dataset (given its "owner/dataset" ref), extract the first CSV/JSON file inside it, and return that file as text (truncated to ~50k chars). Also caches the raw zip in R2 (if bound) for reuse. Follow up with csv-to-json or entity-extract to work with the data.',
  category: 'Data',
  risk: 'review',
  parameters: { type: 'object', properties: { ref: { type: 'string' }, datasetVersionNumber: { type: 'number' } }, required: ['ref'] },
  run: async (input, ctx) => {
    const ref = requireString(input, 'ref')
    const [ownerSlug, datasetSlug] = ref.split('/')
    if (!ownerSlug || !datasetSlug) throw new Error('ref must be in "owner/dataset" form.')
    const { bytes, sizeBytes } = await kaggleDownloadDataset(ctx.env, ctx.db, ownerSlug, datasetSlug, {
      datasetVersionNumber: input.datasetVersionNumber ? Number(input.datasetVersionNumber) : undefined,
    })

    if (ctx.env.BUCKET && ctx.db) {
      const r2Key = `kaggle-cache/${ctx.workspaceId}/${ownerSlug}__${datasetSlug}.zip`
      await ctx.env.BUCKET.put(r2Key, bytes).catch(() => {})
      await ctx.db.prepare(
        'INSERT INTO kaggle_dataset_cache (id, workspace_id, owner_slug, dataset_slug, r2_key, size_bytes, downloaded_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, owner_slug, dataset_slug) DO UPDATE SET r2_key = excluded.r2_key, size_bytes = excluded.size_bytes, downloaded_at = excluded.downloaded_at'
      ).bind(newId('kgl'), ctx.workspaceId, ownerSlug, datasetSlug, r2Key, sizeBytes, nowIso()).run().catch(() => {})
    }

    const extracted = await extractFirstMatchingFile(bytes, ['.csv', '.json', '.txt', '.tsv']).catch(() => undefined)
    return {
      ref,
      sizeBytes,
      cachedInR2: Boolean(ctx.env.BUCKET),
      extractedFile: extracted ? { name: extracted.name, text: extracted.text.slice(0, 50_000), truncated: extracted.text.length > 50_000 } : null,
    }
  },
}

const kaggleKernelSearchTool: ToolDefinition = {
  id: 'kaggle-kernel-search',
  name: 'Kaggle Notebook (Kernel) Search',
  description: 'Search Kaggle for public notebooks (kernels) related to a topic or dataset — useful for finding reference analysis approaches.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: ['query'] },
  run: async (input, ctx) => {
    const query = requireString(input, 'query')
    const kernels = await kaggleSearchKernels(ctx.env, ctx.db, query, { maxResults: Number(input.maxResults ?? 10) })
    return { query, count: kernels.length, kernels }
  },
}

// ---- E2B tool (real code execution) ---------------------------------------

const codeExecuteTool: ToolDefinition = {
  id: 'code-execute',
  name: 'Code Executor (E2B Sandbox)',
  description: 'Actually RUNS a code snippet inside an isolated, ephemeral E2B cloud sandbox and returns real stdout/stderr/results/errors. Unlike code-generate (which only writes code) or code-explain (which only reasons about it), this executes it for real. Use for data analysis, calculations, or verifying generated code actually works. Supports python, javascript, typescript, r, and bash.',
  category: 'Ops',
  risk: 'sensitive',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      language: { type: 'string', enum: ['python', 'javascript', 'typescript', 'r', 'bash'] },
    },
    required: ['code'],
  },
  run: async (input, ctx) => {
    const code = requireString(input, 'code')
    const language = (input.language as string) || 'python'
    const startedAt = Date.now()
    let outcome: Awaited<ReturnType<typeof e2bRunCode>> | undefined
    let ok = true
    try {
      outcome = await e2bRunCode(ctx.env, ctx.db, code, { language: language as any })
      ok = !outcome.error
    } catch (error) {
      ok = false
      throw error
    } finally {
      if (ctx.db) {
        await ctx.db.prepare(
          'INSERT INTO code_executions (id, workspace_id, actor_id, language, code_hash, ok, stdout_chars, stderr_chars, error_name, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          newId('exec'), ctx.workspaceId, ctx.actorId, language, await sha256Hex(code), ok ? 1 : 0,
          outcome?.stdout.length ?? 0, outcome?.stderr.length ?? 0, outcome?.error?.name ?? null,
          Date.now() - startedAt, nowIso()
        ).run().catch(() => {})
      }
    }
    return outcome
  },
}

// ---- Supabase generic data tools -------------------------------------------

const supabaseQueryTool: ToolDefinition = {
  id: 'supabase-query',
  name: 'Supabase Table Query',
  description: 'Read rows from a table in the user\'s own Supabase project via PostgREST (e.g. a custom app table). Filters use PostgREST syntax, e.g. {"status":"eq.active"}.',
  category: 'Data',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      filters: { type: 'object' },
      select: { type: 'string' },
      limit: { type: 'number' },
      order: { type: 'string' },
    },
    required: ['table'],
  },
  run: async (input, ctx) => {
    const table = requireString(input, 'table')
    const filters = (input.filters && typeof input.filters === 'object' ? input.filters : {}) as Record<string, string>
    const rows = await supabaseSelect(ctx.env, ctx.db, table, {
      filters,
      select: input.select as string | undefined,
      limit: input.limit ? Number(input.limit) : undefined,
      order: input.order as string | undefined,
      sticky: ctx.workspaceId,
    })
    return { table, count: rows.length, rows }
  },
}

const supabaseWriteTool: ToolDefinition = {
  id: 'supabase-write',
  name: 'Supabase Table Write',
  description: 'Insert or upsert rows into a table in the user\'s own Supabase project via PostgREST. Sensitive: requires confirmation before running.',
  category: 'Data',
  risk: 'sensitive',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      rows: { type: 'array', items: { type: 'object' } },
      onConflict: { type: 'string', description: 'Column name to upsert on, e.g. "id"' },
    },
    required: ['table', 'rows'],
  },
  run: async (input, ctx) => {
    const table = requireString(input, 'table')
    const rows = Array.isArray(input.rows) ? (input.rows as Record<string, unknown>[]) : []
    if (!rows.length) throw new Error('Provide at least one row.')
    const written = await supabaseUpsert(ctx.env, ctx.db, table, rows, { onConflict: input.onConflict as string | undefined, sticky: ctx.workspaceId })
    return { table, written: written.length, rows: written }
  },
}

const supabaseDeleteTool: ToolDefinition = {
  id: 'supabase-delete',
  name: 'Supabase Table Delete',
  description: 'Delete rows from a table in the user\'s own Supabase project via PostgREST, scoped by required filters (never allows an unfiltered delete). Sensitive: requires confirmation before running.',
  category: 'Data',
  risk: 'sensitive',
  parameters: { type: 'object', properties: { table: { type: 'string' }, filters: { type: 'object' } }, required: ['table', 'filters'] },
  run: async (input, ctx) => {
    const table = requireString(input, 'table')
    const filters = (input.filters && typeof input.filters === 'object' ? input.filters : {}) as Record<string, string>
    await supabaseDelete(ctx.env, ctx.db, table, filters, { sticky: ctx.workspaceId })
    return { table, deleted: true, filters }
  },
}

// ---- Provider/ops introspection ---------------------------------------

const providerStatusTool: ToolDefinition = {
  id: 'provider-status',
  name: 'Third-Party Provider Status',
  description: 'Reports which external providers (Supabase, Kaggle, E2B) are configured and how many pooled accounts each has, without ever exposing key material. Useful for diagnosing "why did tool X fail" before assuming it is a bug.',
  category: 'Ops',
  risk: 'safe',
  parameters: { type: 'object', properties: {} },
  run: async (_input, ctx) => {
    return {
      supabase: supabaseStatus(ctx.env),
      kaggle: kaggleStatus(ctx.env),
      e2b: e2bStatus(ctx.env),
    }
  },
}

// ---- Registry ---------------------------------------------------------

export const toolRegistry: ToolDefinition[] = [
  calculatorTool,
  wordCountTool,
  redactTool,
  jsonFormatTool,
  hashTool,
  summarizeTool,
  translateTool,
  sentimentTool,
  codeExplainTool,
  webFetchTool,
  dateMathTool,
  uuidTool,
  riskScoreTool,
  chunkTextTool,
  qrPayloadTool,
  pdfExtractTool,
  ocrImageTool,
  semanticRecallTool,
  entityExtractTool,
  classifyTool,
  diffTextTool,
  regexExtractTool,
  unitConvertTool,
  csvToJsonTool,
  scheduleParseTool,
  codeGenerateTool,
  webSearchSummaryTool,
  kaggleSearchTool,
  kaggleInfoTool,
  kaggleDownloadTool,
  kaggleKernelSearchTool,
  codeExecuteTool,
  supabaseQueryTool,
  supabaseWriteTool,
  supabaseDeleteTool,
  providerStatusTool,
]

export function getTool(id: string): ToolDefinition | undefined {
  return toolRegistry.find((t) => t.id === id)
}

export function toolAsLlmSpec(tool: ToolDefinition) {
  return {
    type: 'function' as const,
    function: {
      name: tool.id,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}

export async function runTool(id: string, input: Record<string, unknown>, ctx: ToolContext) {
  const tool = getTool(id)
  if (!tool) throw new Error(`Unknown tool: ${id}`)
  const startedAt = Date.now()
  try {
    const result = await tool.run(input, ctx)
    return { ok: true as const, result, tool: tool.id, durationMs: Date.now() - startedAt, runId: newId('toolrun'), at: nowIso() }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Tool execution failed.', tool: tool.id, durationMs: Date.now() - startedAt, runId: newId('toolrun'), at: nowIso() }
  }
}
