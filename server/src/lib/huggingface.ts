// Hugging Face Inference Providers client: text generation (chat completion,
// routed through HF's unified router to whichever backend serves the model
// fastest/cheapest) and feature-extraction embeddings, via plain HTTPS (no
// SDK dependency).
//
// Auth: `Authorization: Bearer hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (a
// fine-grained token with "Make calls to Inference Providers" permission,
// created at https://huggingface.co/settings/tokens). Verified empirically
// against the live router (chat + feature-extraction both 200).
//
// Two HTTP surfaces:
//   1. https://router.huggingface.co/v1/chat/completions — OpenAI-compatible
//      chat completions, server picks the fastest provider automatically
//      (or force one with a ":provider" suffix on the model id).
//   2. https://router.huggingface.co/hf-inference/models/{model}/pipeline/{task}
//      — legacy-style pipeline tasks (feature-extraction for embeddings).
//
// Supports pooling across multiple HF accounts (see credentialPool.ts).
import type { Bindings } from './types'
import { parsePool, pickPoolEntry, poolSummary } from './credentialPool'

const HF_ROUTER = 'https://router.huggingface.co'
const DEFAULT_CHAT_MODEL = 'openai/gpt-oss-120b:fastest'
const DEFAULT_EMBED_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'

export type HuggingFaceAccount = { token: string; label?: string }

function poolFromEnv(env: Bindings): HuggingFaceAccount[] {
  const pooled = parsePool(env.HUGGINGFACE_ACCOUNTS_JSON).filter((e) => e.token) as unknown as HuggingFaceAccount[]
  if (pooled.length) return pooled
  if (env.HUGGINGFACE_API_KEY) return [{ token: env.HUGGINGFACE_API_KEY }]
  return []
}

export function huggingfaceStatus(env: Bindings) {
  return poolSummary(poolFromEnv(env) as unknown as Record<string, string>[], 'label')
}

async function pickAccount(env: Bindings, db?: D1Database): Promise<HuggingFaceAccount> {
  const accounts = poolFromEnv(env)
  if (!accounts.length) {
    throw new Error(
      'Hugging Face is not configured. Set HUGGINGFACE_API_KEY (single account) or HUGGINGFACE_ACCOUNTS_JSON ' +
        '(multi-account pool) as Worker secrets. Get a fine-grained token (with "Make calls to Inference Providers" ' +
        'permission) at https://huggingface.co/settings/tokens.'
    )
  }
  const picked = await pickPoolEntry(db, 'huggingface', accounts as unknown as Record<string, string>[])
  return (picked?.entry ?? accounts[0]) as unknown as HuggingFaceAccount
}

/** Returns true if at least one Hugging Face account is configured — used by
 * embeddings.ts to decide whether HF is a viable embedding backend. */
export function usingHuggingFaceForEmbeddings(env: Bindings): boolean {
  return poolFromEnv(env).length > 0
}

/** Runs a chat completion against HF's OpenAI-compatible router. Useful as a
 * secondary/fallback LLM backend, or for agents that specifically want an
 * open-weights model (e.g. for cost or license reasons) instead of the
 * primary OPENAI_API_KEY-backed model. */
export async function huggingfaceChat(
  env: Bindings,
  db: D1Database | undefined,
  messages: Array<{ role: string; content: string }>,
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<{ content: string; model: string }> {
  const account = await pickAccount(env, db)
  const response = await fetch(`${HF_ROUTER}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1024,
      stream: false,
    }),
  })
  if (!response.ok) throw new Error(`Hugging Face chat completion failed: ${response.status} ${await response.text().catch(() => '')}`)
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string }
  return { content: json.choices?.[0]?.message?.content ?? '', model: json.model ?? (opts.model ?? DEFAULT_CHAT_MODEL) }
}

/** Computes a dense embedding vector for a piece of text via HF's
 * feature-extraction pipeline. Used as a higher-quality alternative to the
 * local pseudo-embedding fallback in embeddings.ts when Workers AI isn't
 * bound and no Supabase-side embedding function is configured. */
export async function huggingfaceEmbed(
  env: Bindings,
  db: D1Database | undefined,
  text: string,
  opts: { model?: string } = {}
): Promise<number[]> {
  const account = await pickAccount(env, db)
  const model = opts.model ?? DEFAULT_EMBED_MODEL
  const response = await fetch(`${HF_ROUTER}/hf-inference/models/${model}/pipeline/feature-extraction`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: text }),
  })
  if (!response.ok) throw new Error(`Hugging Face embedding failed: ${response.status} ${await response.text().catch(() => '')}`)
  const json = (await response.json()) as unknown
  // feature-extraction can return a flat vector [n] or a token-wise matrix
  // [tokens][n]; mean-pool the token axis down to a single sentence vector
  // when the model returns per-token embeddings.
  if (Array.isArray(json) && typeof json[0] === 'number') return json as number[]
  if (Array.isArray(json) && Array.isArray(json[0])) {
    const matrix = json as number[][]
    const dim = matrix[0].length
    const pooled = new Array(dim).fill(0)
    for (const row of matrix) for (let i = 0; i < dim; i++) pooled[i] += row[i] / matrix.length
    return pooled
  }
  throw new Error('Hugging Face embedding returned an unexpected shape.')
}
