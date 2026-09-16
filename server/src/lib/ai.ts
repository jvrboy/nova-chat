// Multi-provider AI router with automatic free-tier key rotation.
// Providers are tried in order (Groq → Gemini → Ollama Cloud); within each
// provider, keys round-robin (via credentialPool) and rotate to the next key
// automatically on 401/403/429 (invalid/quota-exceeded) so a single exhausted
// free key never breaks the app. Only free models are used.
import type { D1Database } from '@cloudflare/workers-types'
import type { Bindings } from './types'
import { parsePool, pickPoolEntry, poolSummary } from './credentialPool'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type Provider = 'groq' | 'gemini' | 'ollama'

// Correct current free-tier models (verified against each provider's live /models list).
const FREE_MODELS: Record<Provider, string[]> = {
  groq: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'groq/compound-mini', 'groq/compound', 'allam-2-7b', 'openai/gpt-oss-20b'],
  gemini: ['gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'],
  ollama: ['gpt-oss:120b-cloud', 'gpt-oss:20b-cloud', 'qwen3-coder:480b-cloud', 'deepseek-v3.1:671b-cloud', 'llama3.1:8b', 'qwen2.5:7b'],
}

const TIMEOUT_MS = 45_000

function nowIso() {
  return new Date().toISOString()
}

/** Record that a specific key failed (quota/invalid) so rotation can skip it. */
async function markKeyDead(db: D1Database | undefined, pool: string, keyFingerprint: string) {
  if (!db) return
  try {
    await db
      .prepare('INSERT OR REPLACE INTO kv_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .bind(`deadkey:${pool}:${keyFingerprint}`, nowIso(), nowIso())
      .run()
  } catch { /* best-effort */ }
}

async function isKeyDead(db: D1Database | undefined, pool: string, keyFingerprint: string): Promise<boolean> {
  if (!db) return false
  try {
    const row = await db.prepare('SELECT value FROM kv_settings WHERE key = ?').bind(`deadkey:${pool}:${keyFingerprint}`).first<{ value: string }>()
    if (!row) return false
    // Dead keys recover after 1 hour (free-tier quotas reset).
    const ageMs = Date.now() - Date.parse(row.value)
    return ageMs < 3_600_000
  } catch {
    return false
  }
}

function fp(key: string): string {
  return key.slice(0, 6) + key.slice(-4)
}

// ---------- Provider call implementations (OpenAI-compatible or native) ----------

async function callGroq(key: string, model: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 1024 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw Object.assign(new Error(`Groq ${res.status}`), { status: res.status })
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

async function callGemini(key: string, model: string, messages: ChatMessage[]): Promise<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
  const body: Record<string, unknown> = { contents: turns }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}`), { status: res.status })
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
}

async function callOllama(key: string, model: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch('https://ollama.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw Object.assign(new Error(`Ollama ${res.status}`), { status: res.status })
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

const CALLERS: Record<Provider, (key: string, model: string, messages: ChatMessage[]) => Promise<string>> = {
  groq: callGroq,
  gemini: callGemini,
  ollama: callOllama,
}

function poolKeys(env: Bindings, provider: Provider): string[] {
  const raw =
    provider === 'groq' ? env.GROQ_KEYS_JSON : provider === 'gemini' ? env.GEMINI_KEYS_JSON : env.OLLAMA_KEYS_JSON
  return parsePool(raw).map((e) => e.key).filter((k): k is string => typeof k === 'string' && k.length > 8)
}

export function aiConfigured(env: Bindings): boolean {
  return (['groq', 'gemini', 'ollama'] as Provider[]).some((p) => poolKeys(env, p).length > 0)
}

export function aiStatus(env: Bindings) {
  return {
    groq: poolSummary(poolKeys(env, 'groq').map((k) => ({ key: k })), 'key'),
    gemini: poolSummary(poolKeys(env, 'gemini').map((k) => ({ key: k })), 'key'),
    ollama: poolSummary(poolKeys(env, 'ollama').map((k) => ({ key: k })), 'key'),
    freeModels: FREE_MODELS,
  }
}

/**
 * Generate a chat reply using the multi-provider free-tier pool with automatic
 * rotation. Tries each provider in order; within a provider rotates keys and
 * retries with the next key on quota/invalid errors, and falls back across
 * models. Throws only if every configured provider/key/model fails.
 */
export async function aiChat(
  env: Bindings,
  messages: ChatMessage[],
  opts: { db?: D1Database; preferredModel?: string } = {}
): Promise<{ text: string; provider: Provider; model: string }> {
  const providers: Provider[] = ['groq', 'gemini', 'ollama']
  const errors: string[] = []

  for (const provider of providers) {
    const keys = poolKeys(env, provider)
    if (!keys.length) continue
    const pool = parsePool(provider === 'groq' ? env.GROQ_KEYS_JSON : provider === 'gemini' ? env.GEMINI_KEYS_JSON : env.OLLAMA_KEYS_JSON)
    const startPick = await pickPoolEntry(opts.db, `ai-${provider}`, pool)
    const startIdx = startPick?.index ?? 0

    const models = opts.preferredModel && FREE_MODELS[provider].includes(opts.preferredModel)
      ? [opts.preferredModel, ...FREE_MODELS[provider].filter((m) => m !== opts.preferredModel)]
      : FREE_MODELS[provider]

    // Try up to `keys.length` distinct keys for this provider.
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[(startIdx + attempt) % keys.length]
      const fingerprint = fp(key)
      if (await isKeyDead(opts.db, provider, fingerprint)) continue

      for (const model of models) {
        try {
          const text = await CALLERS[provider](key, model, messages)
          if (text) return { text, provider, model }
        } catch (e) {
          const status = (e as { status?: number }).status
          const msg = e instanceof Error ? e.message : String(e)
          const modelGone = status === 404 || status === 400 || /not.found|does not exist|decommissioned|no longer/i.test(msg)
          errors.push(`${provider}/${model}: ${msg}`)
          // Rotate to next key on auth/quota failures.
          if (status === 401 || status === 403 || status === 429) {
            await markKeyDead(opts.db, provider, fingerprint)
            break // move to next key
          }
          if (modelGone) continue // next model (don't burn another key on a bad model name)
          // Network/timeout/other: try next key
          break
        }
      }
    }
  }
  throw new Error(`All AI providers exhausted. ${errors.slice(0, 4).join(' | ')}`)
}
