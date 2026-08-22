import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { randomToken, sha256Hex } from '../lib/crypto'
import { appendAudit } from '../lib/db'
import { requireScope } from '../lib/auth'

const apikeys = new Hono<AppEnv>()

apikeys.get('/', requireScope('workspace:admin'), async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT id, name, prefix, scopes, created_at, revoked_at FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC')
    .bind(workspaceId)
    .all()
  return c.json({ apiKeys: results })
})

// Returns the plaintext key exactly once — only the SHA-256 hash is ever stored.
// Admin-gated: without this, a read-only key could mint itself a workspace:admin
// key (privilege escalation).
const KNOWN_SCOPES = new Set(['workspace:read', 'workspace:write', 'workspace:admin'])
apikeys.post('/', requireScope('workspace:admin'), async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const body = await c.req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'Unnamed key'
  let scopes = Array.isArray(body?.scopes) ? body.scopes.filter((s: unknown) => typeof s === 'string') : ['workspace:read', 'workspace:write']
  scopes = scopes.filter((s: string) => KNOWN_SCOPES.has(s))
  if (!scopes.length) scopes = ['workspace:read']

  const secret = randomToken(24)
  const prefix = `nv_${secret.slice(0, 8)}`
  const plaintext = `${prefix}_${secret}`
  const hash = await sha256Hex(plaintext)

  const id = newId('key')
  await c.env.DB.prepare('INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, workspaceId, name, prefix, hash, JSON.stringify(scopes), nowIso())
    .run()
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'apikey.created', resource: 'api_key', resourceId: id })

  return c.json({ id, name, prefix, scopes, plaintextKey: plaintext }, 201)
})

apikeys.post('/:id/revoke', requireScope('workspace:admin'), async (c) => {
  const workspaceId = c.get('workspaceId')
  const id = c.req.param('id')
  const result = await c.env.DB.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL')
    .bind(nowIso(), id, workspaceId)
    .run()
  if (!result.meta.changes) return c.json({ error: 'API key not found or already revoked.' }, 404)
  await appendAudit(c.env.DB, { workspaceId, actorId: c.get('actorId'), action: 'apikey.revoked', resource: 'api_key', resourceId: id })
  return c.json({ revoked: true })
})

export default apikeys
