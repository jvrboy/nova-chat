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
import { firecrawlScrape, firecrawlSearch, firecrawlMap, firecrawlStatus } from './firecrawl'
import { huggingfaceChat, huggingfaceEmbed, huggingfaceStatus } from './huggingface'

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

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fd/i,
]

/**
 * Validates a URL for outbound fetching: HTTPS only, and never a private /
 * loopback / link-local / cloud-metadata host (SSRF protection).
 */
export function assertPublicHttpsUrl(rawUrl: string): URL {
  let parsed: URL
  try { parsed = new URL(rawUrl) } catch { throw new Error('Invalid URL.') }
  if (parsed.protocol !== 'https:') throw new Error('Only HTTPS URLs are allowed.')
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error('Requests to private, loopback, or metadata addresses are blocked.')
  }
  return parsed
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
    const parsed = assertPublicHttpsUrl(url)
    const response = await fetch(parsed.toString(), { headers: { Accept: 'text/html,text/plain' }, signal: AbortSignal.timeout(15_000) })
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
    // WiFi QR payloads escape these reserved characters per the WIFI: schema.
    const escapeWifi = (value: string) => value.replace(/([\\;,:"])/g, '\\$1')
    if (kind === 'url') return { payload: requireString(input, 'url') }
    if (kind === 'wifi') {
      const ssid = requireString(input, 'ssid')
      const security = (input.security as string) || 'WPA'
      const password = (input.password as string) || ''
      return { payload: `WIFI:T:${security};S:${escapeWifi(ssid)};P:${escapeWifi(password)};;` }
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
    const rawFlags = typeof input.flags === 'string' ? input.flags : 'g'
    const flags = rawFlags.includes('g') ? rawFlags : `${rawFlags}g`
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
    const temperatureUnits = new Set(['c', 'f', 'k', 'celsius', 'fahrenheit', 'kelvin'])
    if (temperatureUnits.has(from) && temperatureUnits.has(to)) {
      const normalize: Record<string, (v: number) => number> = { c: (v) => v, celsius: (v) => v, f: (v) => (v - 32) * (5 / 9), fahrenheit: (v) => (v - 32) * (5 / 9), k: (v) => v - 273.15, kelvin: (v) => v - 273.15 }
      const denormalize: Record<string, (v: number) => number> = { c: (v) => v, celsius: (v) => v, f: (v) => v * (9 / 5) + 32, fahrenheit: (v) => v * (9 / 5) + 32, k: (v) => v + 273.15, kelvin: (v) => v + 273.15 }
      return { result: denormalize[to](normalize[from](value)), from, to }
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
    if (!csv.trim()) return { rows: [] }
    // RFC-4180-aware parser: handles quoted cells containing commas, escaped
    // double quotes (""), and newlines.
    const parseCsv = (text: string): string[][] => {
      const rows: string[][] = []
      let row: string[] = []
      let cell = ''
      let inQuotes = false
      for (let i = 0; i < text.length; i++) {
        const char = text[i]
        if (inQuotes) {
          if (char === '"') {
            if (text[i + 1] === '"') { cell += '"'; i++ }
            else inQuotes = false
          } else cell += char
        } else if (char === '"') inQuotes = true
        else if (char === ',') { row.push(cell.trim()); cell = '' }
        else if (char === '\n' || char === '\r') {
          if (char === '\r' && text[i + 1] === '\n') i++
          row.push(cell.trim()); cell = ''
          if (row.some((c) => c !== '')) rows.push(row)
          row = []
        } else cell += char
      }
      row.push(cell.trim())
      if (row.some((c) => c !== '')) rows.push(row)
      return rows
    }
    const table = parseCsv(csv)
    if (!table.length) return { rows: [] }
    const headers = table[0]
    const rows = table.slice(1).map((cells) => {
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
        const parsed = assertPublicHttpsUrl(url)
        const response = await fetch(parsed.toString(), { headers: { Accept: 'text/html,text/plain' }, signal: AbortSignal.timeout(15_000) })
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

// ---- Firecrawl tools (real web scraping/search/mapping) --------------------

const webScrapeTool: ToolDefinition = {
  id: 'web-scrape',
  name: 'Web Page Scrape (Firecrawl)',
  description: 'Fetches a single URL and returns clean, readable markdown of its real rendered content (handles JS-rendered pages and anti-bot-protected sites far better than a raw web-fetch). Use this instead of web-fetch when you need the actual article/page content, not just raw HTML.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { url: { type: 'string' }, onlyMainContent: { type: 'boolean' } }, required: ['url'] },
  run: async (input, ctx) => {
    const url = requireString(input, 'url')
    return await firecrawlScrape(ctx.env, ctx.db, url, { onlyMainContent: input.onlyMainContent !== false })
  },
}

const webSearchProTool: ToolDefinition = {
  id: 'web-search-pro',
  name: 'Web Search (Firecrawl, full content)',
  description: 'Full-text web search that can optionally return full scraped markdown content per result (not just a snippet), unlike web-search-summary. Use scrapeContent:true when you need the actual page text to reason over, not just titles/links.',
  category: 'Data',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' }, limit: { type: 'number' }, scrapeContent: { type: 'boolean' } },
    required: ['query'],
  },
  run: async (input, ctx) => {
    const query = requireString(input, 'query')
    const hits = await firecrawlSearch(ctx.env, ctx.db, query, {
      limit: Number(input.limit ?? 5),
      scrapeContent: Boolean(input.scrapeContent),
    })
    return { query, count: hits.length, results: hits }
  },
}

const webSiteMapTool: ToolDefinition = {
  id: 'web-site-map',
  name: 'Website URL Map (Firecrawl)',
  description: 'Discovers a site\'s full URL tree quickly (link discovery only, no content fetch) — use this first to decide which specific pages of a large site are worth scraping individually with web-scrape.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { url: { type: 'string' }, search: { type: 'string' }, limit: { type: 'number' } }, required: ['url'] },
  run: async (input, ctx) => {
    const url = requireString(input, 'url')
    const result = await firecrawlMap(ctx.env, ctx.db, url, { search: input.search as string | undefined, limit: Number(input.limit ?? 100) })
    return { url, count: result.urls.length, urls: result.urls }
  },
}

// ---- Hugging Face tools (open-model text generation + embeddings) --------

const hfGenerateTextTool: ToolDefinition = {
  id: 'hf-generate-text',
  name: 'Open-Model Text Generation (Hugging Face)',
  description: 'Generates text using an open-weights model via Hugging Face Inference Providers, routed to whichever backend serves it fastest. Use as an alternative/fallback LLM to the primary chat model, e.g. for cost, license, or model-diversity reasons — pass a specific model id to pick a particular open model.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: { prompt: { type: 'string' }, model: { type: 'string' }, temperature: { type: 'number' }, maxTokens: { type: 'number' } },
    required: ['prompt'],
  },
  run: async (input, ctx) => {
    const prompt = requireString(input, 'prompt')
    const result = await huggingfaceChat(ctx.env, ctx.db, [{ role: 'user', content: prompt }], {
      model: input.model as string | undefined,
      temperature: input.temperature ? Number(input.temperature) : undefined,
      maxTokens: input.maxTokens ? Number(input.maxTokens) : undefined,
    })
    return result
  },
}

const hfEmbedTextTool: ToolDefinition = {
  id: 'hf-embed-text',
  name: 'Text Embedding (Hugging Face)',
  description: 'Computes a dense embedding vector for a piece of text via Hugging Face feature-extraction, as a higher-quality alternative to the local pseudo-embedding fallback used when Workers AI is unavailable. Mainly used internally by embeddings.ts, exposed here for direct inspection/testing.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, model: { type: 'string' } }, required: ['text'] },
  run: async (input, ctx) => {
    const text = requireString(input, 'text')
    const vector = await huggingfaceEmbed(ctx.env, ctx.db, text, { model: input.model as string | undefined })
    return { dimensions: vector.length, vector: vector.slice(0, 16), truncatedPreview: vector.length > 16 }
  },
}

// ---- Provider/ops introspection ---------------------------------------

const providerStatusTool: ToolDefinition = {
  id: 'provider-status',
  name: 'Third-Party Provider Status',
  description: 'Reports which external providers (Supabase, Kaggle, E2B, Firecrawl, Hugging Face) are configured and how many pooled accounts each has, without ever exposing key material. Useful for diagnosing "why did tool X fail" before assuming it is a bug.',
  category: 'Ops',
  risk: 'safe',
  parameters: { type: 'object', properties: {} },
  run: async (_input, ctx) => {
    return {
      supabase: supabaseStatus(ctx.env),
      kaggle: kaggleStatus(ctx.env),
      e2b: e2bStatus(ctx.env),
      firecrawl: firecrawlStatus(ctx.env),
      huggingface: huggingfaceStatus(ctx.env),
    }
  },
}

// ---- New utility/cognition tools (pure JS, no external calls) -------------

const base64CodecTool: ToolDefinition = {
  id: 'base64-codec',
  name: 'Base64 Codec',
  description: 'Encode text to Base64 or decode Base64 back to text.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['encode', 'decode'] }, text: { type: 'string' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    if ((input.mode as string) === 'decode') {
      try {
        const binary = atob(text.replace(/\s+/g, ''))
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
        return { decoded: new TextDecoder().decode(bytes) }
      } catch { throw new Error('Input is not valid Base64.') }
    }
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
    return { encoded: btoa(binary) }
  },
}

const urlCodecTool: ToolDefinition = {
  id: 'url-codec',
  name: 'URL Codec & Parser',
  description: 'Percent-encode/decode a string, or parse a URL into protocol, host, path, query params, and hash.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['encode', 'decode', 'parse'] }, value: { type: 'string' } }, required: ['value'] },
  run: async (input) => {
    const value = requireString(input, 'value')
    const mode = (input.mode as string) ?? 'parse'
    if (mode === 'encode') return { encoded: encodeURIComponent(value) }
    if (mode === 'decode') return { decoded: decodeURIComponent(value.replace(/\+/g, ' ')) }
    const parsed = assertPublicHttpsUrl(value)
    return { href: parsed.href, origin: parsed.origin, protocol: parsed.protocol, host: parsed.host, pathname: parsed.pathname, params: Object.fromEntries(parsed.searchParams.entries()), hash: parsed.hash }
  },
}

const jwtDecodeTool: ToolDefinition = {
  id: 'jwt-decode',
  name: 'JWT Decoder',
  description: 'Decode a JSON Web Token header and payload WITHOUT verifying the signature. Never use this to trust a token — inspection only.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] },
  run: async (input) => {
    const token = requireString(input, 'token').replace(/^Bearer\s+/i, '').trim()
    const parts = token.split('.')
    if (parts.length < 2) throw new Error('Not a JWT (expected three dot-separated segments).')
    const decodeSegment = (segment: string) => {
      const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
      return JSON.parse(atob(padded))
    }
    const payload = decodeSegment(parts[1]) as Record<string, unknown>
    const expiry = typeof payload.exp === 'number' ? new Date(payload.exp * 1000).toISOString() : undefined
    return { header: decodeSegment(parts[0]), payload, expiresAt: expiry, expired: typeof payload.exp === 'number' ? payload.exp * 1000 < Date.now() : undefined, signaturePresent: Boolean(parts[2]), note: 'Signature was NOT verified.' }
  },
}

const timestampConvertTool: ToolDefinition = {
  id: 'timestamp-convert',
  name: 'Timestamp Converter',
  description: 'Convert between Unix timestamps (seconds or milliseconds) and ISO dates, including relative offset from now.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { value: { type: 'string', description: 'Unix seconds/millis digits or any parsable date string' } }, required: ['value'] },
  run: async (input) => {
    const value = requireString(input, 'value').trim()
    if (/^\d{10}$/.test(value) || /^\d{13}$/.test(value)) {
      const ms = value.length === 10 ? Number(value) * 1000 : Number(value)
      return { iso: new Date(ms).toISOString(), unixSeconds: Math.floor(ms / 1000), unixMillis: ms, utc: new Date(ms).toUTCString() }
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error('Provide a unix timestamp (10 or 13 digits) or a parsable date string.')
    return { iso: date.toISOString(), unixSeconds: Math.floor(date.getTime() / 1000), unixMillis: date.getTime(), relativeMs: date.getTime() - Date.now() }
  },
}

const numberBaseConvertTool: ToolDefinition = {
  id: 'number-base-convert',
  name: 'Number Base Converter',
  description: 'Convert an integer between bases 2-36 (binary, octal, decimal, hex, etc.).',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { fromBase: { type: 'number', description: '2-36' }, value: { type: 'string' } }, required: ['fromBase', 'value'] },
  run: async (input) => {
    const fromBase = Math.floor(Number(input.fromBase))
    if (!Number.isFinite(fromBase) || fromBase < 2 || fromBase > 36) throw new Error('fromBase must be between 2 and 36.')
    const value = requireString(input, 'value').trim()
    const parsed = parseInt(value.replace(/^0[box]/i, ''), fromBase)
    if (Number.isNaN(parsed)) throw new Error(`"${value}" is not a valid base-${fromBase} number.`)
    return { decimal: parsed, binary: parsed.toString(2), octal: parsed.toString(8), hex: parsed.toString(16), base36: parsed.toString(36) }
  },
}

const caseConvertTool: ToolDefinition = {
  id: 'case-convert',
  name: 'Case Converter',
  description: 'Convert text between UPPER, lower, Title, camelCase, PascalCase, snake_case, and kebab-case.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { style: { type: 'string', enum: ['upper', 'lower', 'title', 'camel', 'pascal', 'snake', 'kebab'] }, text: { type: 'string' } }, required: ['style', 'text'] },
  run: async (input) => {
    const style = requireString(input, 'style').toLowerCase().replace('-', '')
    const text = requireString(input, 'text')
    const parts = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase())
    const map: Record<string, () => string> = {
      upper: () => text.toUpperCase(),
      lowercase: () => text.toLowerCase(),
      title: () => parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
      camel: () => parts.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join(''),
      pascal: () => parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(''),
      snake: () => parts.join('_'),
      kebab: () => parts.join('-'),
    }
    const convert = map[style]
    if (!convert) throw new Error(`Unknown style "${style}".`)
    return convert()
  },
}

const colorConvertTool: ToolDefinition = {
  id: 'color-convert',
  name: 'Color Converter',
  description: 'Convert a color between HEX and RGB/HSL and compute its relative luminance.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { color: { type: 'string', description: '#rrggbb or rgb(r,g,b)' } }, required: ['color'] },
  run: async (input) => {
    const value = requireString(input, 'color').trim()
    let r: number; let g: number; let b: number
    const hexMatch = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value)
    const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value)
    if (hexMatch) {
      let hex = hexMatch[1]
      if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('')
      const int = parseInt(hex, 16); r = (int >> 16) & 255; g = (int >> 8) & 255; b = int & 255
    } else if (rgbMatch) {
      r = Number(rgbMatch[1]); g = Number(rgbMatch[2]); b = Number(rgbMatch[3])
    } else throw new Error('Provide a #rrggbb or rgb(r,g,b) color.')
    if ([r, g, b].some((v) => v > 255)) throw new Error('RGB channels must be 0-255.')
    const rf = r / 255; const gf = g / 255; const bf = b / 255
    const maxC = Math.max(rf, gf, bf); const minC = Math.min(rf, gf, bf)
    const l = (maxC + minC) / 2; const d = maxC - minC
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    let h = 0
    if (d !== 0) {
      if (maxC === rf) h = (((gf - bf) / d) + 6) % 6
      else if (maxC === gf) h = (bf - rf) / d + 2
      else h = (rf - gf) / d + 4
      h *= 60
    }
    return { hex: `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`, rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`, luminance: Number((0.2126 * rf + 0.7152 * gf + 0.0722 * bf).toFixed(4)) }
  },
}

const slugifyTool: ToolDefinition = {
  id: 'slugify',
  name: 'Slugify',
  description: 'Turn any title into a clean URL-safe slug with a configurable separator.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, separator: { type: 'string' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    const separator = typeof input.separator === 'string' && input.separator ? input.separator.slice(0, 3) : '-'
    const slug = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, separator).replace(new RegExp(`^\\${separator}+|\\${separator}+$`, 'g'), '')
    return { slug: slug || 'empty-slug' }
  },
}

const passwordGenerateTool: ToolDefinition = {
  id: 'password-generate',
  name: 'Password Generator',
  description: 'Generate cryptographically random strong passwords using the Workers CSPRNG. Generated on demand, never stored.',
  category: 'Utilities',
  risk: 'safe',
  parameters: { type: 'object', properties: { length: { type: 'number' }, includeSymbols: { type: 'boolean' }, count: { type: 'number' } } },
  run: async (input) => {
    const length = Math.min(Math.max(Number(input.length ?? 20), 8), 128)
    const count = Math.min(Math.max(Number(input.count ?? 1), 1), 20)
    const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' + (input.includeSymbols === false ? '' : '!@#$%^&*-_=+?')
    const generate = () => {
      const randoms = new Uint32Array(length)
      crypto.getRandomValues(randoms)
      return Array.from(randoms, (value) => alphabet[value % alphabet.length]).join('')
    }
    return { passwords: Array.from({ length: count }, generate), length, note: 'Generated locally with crypto.getRandomValues; never logged or stored.' }
  },
}

const loremIpsumTool: ToolDefinition = {
  id: 'lorem-ipsum',
  name: 'Lorem Ipsum Generator',
  description: 'Generate placeholder paragraphs for mockups and copy tests.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { paragraphs: { type: 'number' }, wordsPerParagraph: { type: 'number' } } },
  run: async (input) => {
    const paragraphCount = Math.min(Math.max(Number(input.paragraphs ?? 3), 1), 10)
    const wordsPerParagraph = Math.min(Math.max(Number(input.wordsPerParagraph ?? 45), 10), 120)
    const corpus = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur'.split(' ')
    const sentence = () => {
      const length = 8 + Math.floor(Math.random() * 12)
      const parts = Array.from({ length }, () => corpus[Math.floor(Math.random() * corpus.length)])
      return parts.join(' ').replace(/^./, (ch) => ch.toUpperCase()) + '.'
    }
    const paragraphs = Array.from({ length: paragraphCount }, () => {
      const out: string[] = []
      let count = 0
      while (count < wordsPerParagraph) { const s = sentence(); count += s.split(/\s+/).length; out.push(s) }
      return out.join(' ')
    })
    return { text: paragraphs.join('\n\n') }
  },
}

const cronDescribeTool: ToolDefinition = {
  id: 'cron-describe',
  name: 'Cron Descriptor',
  description: 'Parse a standard 5-field cron expression into a human-readable schedule and compute its next upcoming UTC run times.',
  category: 'Productivity',
  risk: 'safe',
  parameters: { type: 'object', properties: { expression: { type: 'string', description: 'e.g. "*/15 9-17 * * 1-5"' }, nextCount: { type: 'number' } }, required: ['expression'] },
  run: async (input) => {
    const expression = requireString(input, 'expression').trim()
    const fields = expression.split(/\s+/)
    if (fields.length !== 5) throw new Error('Provide exactly five cron fields: minute hour day-of-month month day-of-week.')
    const names = ['minute', 'hour', 'day of month', 'month', 'day of week']
    // Per-field [min, max] bounds: minute, hour, day-of-month, month, day-of-week.
    const fieldBounds: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
    const describeField = (field: string, index: number) => {
      if (field === '*') return `every ${names[index]}`
      if (field.startsWith('*/')) return `every ${field.slice(2)} ${names[index]}s`
      return `${names[index]} ${field.split(',').join(' or ').replace('-', ' through ')}`
    }
    const matchesField = (field: string, value: number, index: number) => {
      const [min, max] = fieldBounds[index]
      return field.split(',').some((part) => {
        const [range, step] = part.split('/')
        const stepNum = Math.max(1, Number(step ?? 1))
        let start: number
        let end: number
        if (range === '*') { start = min; end = max }
        else if (range.includes('-')) { const pair = range.split('-').map(Number); start = pair[0]; end = pair[1] }
        else { start = Number(range); end = step ? max : start }
        return value >= start && value <= end && (value - start) % stepNum === 0
      })
    }
    const [minuteF, hourF, domF, monthF, dowF] = fields
    const domRestricted = domF !== '*'
    const dowRestricted = dowF !== '*'
    const nextRuns: string[] = []
    const cursor = new Date()
    cursor.setUTCSeconds(0, 0)
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
    for (let i = 0; i < 366 * 24 * 60 && nextRuns.length < Math.min(Math.max(Number(input.nextCount ?? 3), 1), 10); i++) {
      // Standard Vixie-cron semantics: if both day-of-month and day-of-week
      // are restricted, a match on EITHER one schedules the run. Cron treats
      // dow 7 as Sunday, same as 0.
      const dow = cursor.getUTCDay()
      const domMatches = !domRestricted || matchesField(domF, cursor.getUTCDate(), 2)
      const dowMatches = !dowRestricted || matchesField(dowF, dow, 4) || (dow === 0 && matchesField(dowF, 7, 4))
      const dayMatches = domRestricted && dowRestricted ? domMatches || dowMatches : domMatches && dowMatches
      if (
        matchesField(minuteF, cursor.getUTCMinutes(), 0) &&
        matchesField(hourF, cursor.getUTCHours(), 1) &&
        dayMatches &&
        matchesField(monthF, cursor.getUTCMonth() + 1, 3)
      ) nextRuns.push(cursor.toISOString())
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
    }
    return { expression, humanReadable: fields.map(describeField).join('; '), nextUtcRuns: nextRuns }
  },
}

const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'did', 'that', 'this', 'with', 'have', 'from', 'they', 'will', 'would', 'there', 'their', 'what', 'about', 'which', 'when', 'your', 'said', 'each', 'she', 'them', 'then', 'than', 'were', 'been', 'more', 'some', 'into', 'also', 'just', 'only', 'over', 'such', 'most', 'very'])

const keywordExtractTool: ToolDefinition = {
  id: 'keyword-extract',
  name: 'Keyword Extractor',
  description: 'Extract the most frequent meaningful terms (stopwords removed) from text as ranked keywords with counts — a fast, deterministic alternative to LLM extraction.',
  category: 'Cognition',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, limit: { type: 'number' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    const limit = Math.min(Math.max(Number(input.limit ?? 10), 1), 50)
    const counts = new Map<string, number>()
    for (const word of text.toLowerCase().split(/[^a-z0-9'-]+/)) {
      if (word.length < 3 || STOPWORDS.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
    const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term, count]) => ({ term, count }))
    return { keywords, distinctTerms: counts.size }
  },
}

const readabilityScoreTool: ToolDefinition = {
  id: 'readability-score',
  name: 'Readability Score',
  description: 'Compute Flesch Reading Ease and grade-level estimates for a piece of writing so you can tune it for your audience.',
  category: 'Cognition',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: async (input) => {
    const text = requireString(input, 'text')
    const sentences = text.split(/[.!?]+\s|[.!?]+$/).map((s) => s.trim()).filter(Boolean)
    const words = text.split(/\s+/).filter(Boolean)
    if (!sentences.length || !words.length) throw new Error('Provide text with at least one word and one sentence.')
    const syllableCount = (word: string) => {
      const clean = word.toLowerCase().replace(/[^a-z]/g, '')
      if (!clean) return 0
      const groups = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g)
      return Math.max(1, groups?.length ?? 1)
    }
    const syllables = words.reduce((sum, word) => sum + syllableCount(word), 0)
    const wordsPerSentence = words.length / sentences.length
    const syllablesPerWord = syllables / words.length
    const fleschEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord
    const fleschGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59
    const audience = fleschEase >= 70 ? 'easy (roughly middle school)' : fleschEase >= 50 ? 'moderate (high school)' : fleschEase >= 30 ? 'difficult (college)' : 'very difficult (graduate)'
    return { fleschEase: Number(fleschEase.toFixed(1)), fleschGradeLevel: Number(fleschGrade.toFixed(1)), audience, words: words.length, sentences: sentences.length, syllables }
  },
}

const htmlStripTool: ToolDefinition = {
  id: 'html-strip',
  name: 'HTML Stripper',
  description: 'Convert raw HTML into readable plain text by removing scripts, styles, tags, entities, and collapsing whitespace.',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { html: { type: 'string' } }, required: ['html'] },
  run: async (input) => {
    const html = requireString(input, 'html')
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { text, characters: text.length }
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
  webScrapeTool,
  webSearchProTool,
  webSiteMapTool,
  hfGenerateTextTool,
  hfEmbedTextTool,
  providerStatusTool,
  base64CodecTool,
  urlCodecTool,
  jwtDecodeTool,
  timestampConvertTool,
  numberBaseConvertTool,
  caseConvertTool,
  colorConvertTool,
  slugifyTool,
  passwordGenerateTool,
  loremIpsumTool,
  cronDescribeTool,
  keywordExtractTool,
  readabilityScoreTool,
  htmlStripTool,
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
  const runId = newId('toolrun')
  const at = nowIso()
  const inputChars = JSON.stringify(input).length
  const record = async (status: 'success' | 'error', durationMs: number, output: unknown, errorMessage?: string) => {
    if (!ctx.db) return
    await ctx.db.prepare('INSERT INTO tool_execution_history (id, workspace_id, actor_id, tool_id, status, risk, duration_ms, input_chars, output_chars, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(runId, ctx.workspaceId, ctx.actorId, tool.id, status, tool.risk, durationMs, inputChars, output == null ? 0 : JSON.stringify(output).length, errorMessage ?? null, at).run().catch(() => {})
  }
  try {
    const result = await tool.run(input, ctx)
    const durationMs = Date.now() - startedAt
    await record('success', durationMs, result)
    return { ok: true as const, result, tool: tool.id, durationMs, runId, at }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed.'
    const durationMs = Date.now() - startedAt
    await record('error', durationMs, null, message)
    return { ok: false as const, error: message, tool: tool.id, durationMs, runId, at }
  }
}
