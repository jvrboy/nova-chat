import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { parseJson } from '../lib/db'
import { semanticSearch, upsertEmbedding } from '../lib/embeddings'

const memory = new Hono<AppEnv>()

memory.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const search = c.req.query('q')
  const stmt = search
    ? c.env.DB.prepare('SELECT * FROM memories WHERE workspace_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT 200').bind(workspaceId, `%${search}%`)
    : c.env.DB.prepare('SELECT * FROM memories WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200').bind(workspaceId)
  const { results } = await stmt.all<any>()
  return c.json({ memories: results.map((r) => ({ ...r, tags: parseJson(r.tags, []) })) })
})

// GET /api/memory/search?q=... - real semantic (vector) search, distinct from
// the keyword LIKE search above. Falls back gracefully if no embeddings exist yet.
memory.get('/search', async (c) => {
  const workspaceId = c.get('workspaceId')
  const query = c.req.query('q')
  if (!query) return c.json({ error: 'Query parameter "q" is required.' }, 400)
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 8), 1), 30)
  const matches = await semanticSearch(c.env, c.env.DB, workspaceId, query, limit)
  return c.json({ matches })
})

memory.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) return c.json({ error: 'Field "content" is required.' }, 400)
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : []
  const id = newId('mem')
  await c.env.DB.prepare('INSERT INTO memories (id, workspace_id, content, tags, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, workspaceId, content, JSON.stringify(tags), nowIso())
    .run()
  // Embed for semantic recall (best-effort — a slow/failed embed must never block memory writes).
  upsertEmbedding(c.env, c.env.DB, { workspaceId, ownerType: 'memory', ownerId: id, content }).catch(() => {})
  return c.json({ id, content, tags }, 201)
})

memory.delete('/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const result = await c.env.DB.prepare('DELETE FROM memories WHERE id = ? AND workspace_id = ?').bind(c.req.param('id'), workspaceId).run()
  if (!result.meta.changes) return c.json({ error: 'Memory not found in workspace.' }, 404)
  return c.json({ deleted: true })
})

export default memory
