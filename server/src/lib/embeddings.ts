import type { Bindings } from './types'
import { newId, nowIso } from './ids'

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5' // 768-dim, fast, good general-purpose embedding on Workers AI

export type EmbeddingMatch = { ownerId: string; ownerType: 'memory' | 'message'; content: string; score: number }

/** Embeds one or more strings via Cloudflare Workers AI. Falls back to a cheap
 * hashing-based pseudo-embedding if the AI binding isn't available (e.g. very
 * old wrangler config) so RAG degrades gracefully instead of crashing. */
export async function embedTexts(env: Bindings, texts: string[]): Promise<number[][]> {
  if (env.AI) {
    const result = await env.AI.run(EMBEDDING_MODEL, { text: texts })
    const data = (result as { data?: number[][] }).data
    if (data && data.length === texts.length) return data
  }
  return texts.map((t) => pseudoEmbed(t))
}

/** Deterministic 64-dim fallback embedding (bag-of-character-ngram hashing).
 * Not as good as a real model, but keeps semantic search *functional* in
 * environments without the AI binding, rather than throwing. */
function pseudoEmbed(text: string, dim = 64): number[] {
  const vector = new Array(dim).fill(0)
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  for (let i = 0; i < normalized.length - 2; i++) {
    const gram = normalized.slice(i, i + 3)
    let hash = 0
    for (let j = 0; j < gram.length; j++) hash = (hash * 31 + gram.charCodeAt(j)) >>> 0
    vector[hash % dim] += 1
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1
  return vector.map((v) => v / norm)
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i] }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/** Uses Supabase (pgvector, via REST) when configured, otherwise the local D1 `embeddings` table. */
function usingSupabase(env: Bindings): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY)
}

export async function upsertEmbedding(
  env: Bindings,
  db: D1Database,
  params: { workspaceId: string; ownerType: 'memory' | 'message'; ownerId: string; content: string }
) {
  const [vector] = await embedTexts(env, [params.content])

  if (usingSupabase(env)) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/nova_embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{
        workspace_id: params.workspaceId,
        owner_type: params.ownerType,
        owner_id: params.ownerId,
        content: params.content,
        embedding: vector,
      }]),
    }).catch(() => {}) // best-effort: never block writes on the vector store
    return
  }

  await db.prepare(
    'INSERT INTO embeddings (id, workspace_id, owner_type, owner_id, content, vector, model, dim, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(newId('emb'), params.workspaceId, params.ownerType, params.ownerId, params.content, JSON.stringify(vector), EMBEDDING_MODEL, vector.length, nowIso())
    .run()
}

/** Semantic search over stored memories/messages for a workspace. Real RAG
 * retrieval used to ground chat/agent replies instead of raw keyword LIKE. */
export async function semanticSearch(
  env: Bindings,
  db: D1Database,
  workspaceId: string,
  query: string,
  limit = 6
): Promise<EmbeddingMatch[]> {
  const [queryVector] = await embedTexts(env, [query])

  if (usingSupabase(env)) {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_nova_embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ query_embedding: queryVector, match_workspace_id: workspaceId, match_count: limit }),
    }).catch(() => null)
    if (response?.ok) {
      const rows = (await response.json()) as Array<{ owner_id: string; owner_type: string; content: string; similarity: number }>
      return rows.map((r) => ({ ownerId: r.owner_id, ownerType: r.owner_type as 'memory' | 'message', content: r.content, score: r.similarity }))
    }
    // Falls through to D1 if the Supabase RPC isn't set up yet.
  }

  const { results } = await db.prepare('SELECT owner_id, owner_type, content, vector FROM embeddings WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 500')
    .bind(workspaceId)
    .all<{ owner_id: string; owner_type: string; content: string; vector: string }>()

  const scored = results.map((row) => {
    let vector: number[] = []
    try { vector = JSON.parse(row.vector) } catch { /* ignore */ }
    return { ownerId: row.owner_id, ownerType: row.owner_type as 'memory' | 'message', content: row.content, score: cosineSimilarity(queryVector, vector) }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
