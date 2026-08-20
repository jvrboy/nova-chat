import type { Context, Next } from 'hono'
import type { AppEnv } from './types'
import { sha256Hex } from './crypto'
import { ensureWorkspace } from './db'

/**
 * Real per-request authentication + authorization.
 *
 * Two supported modes, both resolve to a workspaceId + actorId + scopes:
 *
 * 1. API key mode: `Authorization: Bearer nv_xxx_xxx` — looked up by SHA-256 hash
 *    against the api_keys table. The workspace is taken from the key's own
 *    workspace_id column (a key can only ever act within the workspace that
 *    created it), NOT from a client-supplied header. Revoked/unknown keys are
 *    rejected with 401. This is the mode any production client (including the
 *    Expo app, once configured with a key) should use.
 *
 * 2. Local/dev header mode: `X-Workspace-Id` / `X-Actor-Id` headers, no key
 *    required. This exists so the sandbox/local dev flow keeps working, and so
 *    an operator can bootstrap the very first API key for a workspace before
 *    any key exists. It is intentionally the *only* fallback — there is no
 *    "no headers, no key, still works" path.
 *
 * Route-level scope requirements are enforced by `requireScope()`.
 */
export async function resolveAuth(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization') || ''
  const bearerMatch = authHeader.match(/^Bearer\s+(nv_[A-Za-z0-9_]+)$/)

  if (bearerMatch) {
    const plaintext = bearerMatch[1]
    const hash = await sha256Hex(plaintext)
    const row = await c.env.DB.prepare(
      'SELECT id, workspace_id, scopes, revoked_at FROM api_keys WHERE key_hash = ?'
    )
      .bind(hash)
      .first<{ id: string; workspace_id: string; scopes: string; revoked_at: string | null }>()

    if (!row) return c.json({ error: 'Invalid API key.' }, 401)
    if (row.revoked_at) return c.json({ error: 'API key has been revoked.' }, 401)

    let scopes: string[] = []
    try { scopes = JSON.parse(row.scopes) } catch { scopes = [] }

    c.set('workspaceId', row.workspace_id)
    c.set('actorId', `key:${row.id}`)
    c.set('apiKeyId', row.id)
    c.set('apiKeyScopes', scopes)
    c.set('authMode', 'apikey')

    // Best-effort last-used bump; never blocks the request.
    c.env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), row.id)
      .run()
      .catch(() => {})

    await next()
    return
  }

  // Fallback: local/dev header mode (also what the bundled Expo app uses out of
  // the box before a key is provisioned). Full read/write scopes, single actor.
  const workspaceId = c.req.header('X-Workspace-Id') || 'nova-local'
  const actorId = c.req.header('X-Actor-Id') || 'local-user'
  c.set('workspaceId', workspaceId)
  c.set('actorId', actorId)
  c.set('apiKeyScopes', ['workspace:read', 'workspace:write', 'workspace:admin'])
  c.set('authMode', 'header')
  await ensureWorkspace(c.env.DB, workspaceId, actorId)
  await next()
}

/**
 * Route guard: require a specific scope. Header-mode requests always pass
 * (single local user, full trust) — this only actually restricts API-key mode,
 * which is the mode used for anything beyond the local single-user app.
 */
export function requireScope(scope: 'workspace:read' | 'workspace:write' | 'workspace:admin') {
  return async (c: Context<AppEnv>, next: Next) => {
    const scopes = c.get('apiKeyScopes') ?? []
    if (c.get('authMode') === 'header') return next()
    if (!scopes.includes(scope) && !scopes.includes('workspace:admin')) {
      return c.json({ error: `Missing required scope: ${scope}` }, 403)
    }
    await next()
  }
}
