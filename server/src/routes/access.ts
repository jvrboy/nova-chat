import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { requireScope } from '../lib/auth'
import { newId, nowIso } from '../lib/ids'
import { appendAudit } from '../lib/db'

export type ToolRisk = 'safe' | 'review' | 'sensitive'

export async function canUseTool(db: D1Database, workspaceId: string, actorId: string, toolId: string, risk: ToolRisk, scopes: string[] = []) {
  if (scopes.includes('workspace:admin')) return true
  const row = await db.prepare(`SELECT r.name, COALESCE(p.effect, '') AS effect FROM role_members m JOIN roles r ON r.id = m.role_id LEFT JOIN role_tool_permissions p ON p.role_id = r.id AND p.tool_id = ? WHERE m.workspace_id = ? AND m.actor_id = ?`).bind(toolId, workspaceId, actorId).first<{ name: string; effect: string }>()
  if (!row) return risk === 'safe' && scopes.includes('workspace:read')
  return row.effect === 'allow' || (row.name === 'member' && risk === 'safe' && !row.effect)
}

const access = new Hono<AppEnv>()
access.get('/roles', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT id, name, description, created_at FROM roles WHERE workspace_id = ? ORDER BY name').bind(workspaceId).all()
  return c.json({ roles: results })
})

access.post('/roles', requireScope('workspace:admin'), async (c) => {
  const workspaceId = c.get('workspaceId'); const actorId = c.get('actorId'); const body = await c.req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim().toLowerCase() : ''
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(name)) return c.json({ error: 'Role name must be 2-32 characters: letters, numbers, _ or -.' }, 400)
  const id = newId('role'); const at = nowIso()
  try { await c.env.DB.prepare('INSERT INTO roles (id, workspace_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, workspaceId, name, typeof body?.description === 'string' ? body.description.trim() : '', at).run() } catch { return c.json({ error: 'Role already exists.' }, 409) }
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'role.created', resource: 'role', resourceId: id })
  return c.json({ id, name }, 201)
})

access.post('/roles/:roleId/members', requireScope('workspace:admin'), async (c) => {
  const workspaceId = c.get('workspaceId'); const actorId = c.get('actorId'); const roleId = c.req.param('roleId'); const body = await c.req.json().catch(() => ({}))
  const memberId = typeof body?.actorId === 'string' ? body.actorId.trim() : ''
  if (!memberId) return c.json({ error: 'actorId is required.' }, 400)
  const role = await c.env.DB.prepare('SELECT id FROM roles WHERE id = ? AND workspace_id = ?').bind(roleId, workspaceId).first()
  if (!role) return c.json({ error: 'Role not found.' }, 404)
  await c.env.DB.prepare('INSERT INTO role_members (workspace_id, actor_id, role_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, actor_id) DO UPDATE SET role_id = excluded.role_id').bind(workspaceId, memberId, roleId, nowIso()).run()
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'role.member_assigned', resource: 'role', resourceId: roleId, metadata: { memberId } })
  return c.json({ assigned: true, actorId: memberId, roleId })
})

access.put('/roles/:roleId/tools/:toolId', requireScope('workspace:admin'), async (c) => {
  const workspaceId = c.get('workspaceId'); const actorId = c.get('actorId'); const roleId = c.req.param('roleId'); const toolId = c.req.param('toolId'); const body = await c.req.json().catch(() => ({}))
  const effect = body?.effect === 'deny' ? 'deny' : body?.effect === 'allow' ? 'allow' : ''
  if (!effect) return c.json({ error: 'effect must be allow or deny.' }, 400)
  const role = await c.env.DB.prepare('SELECT id FROM roles WHERE id = ? AND workspace_id = ?').bind(roleId, workspaceId).first()
  if (!role) return c.json({ error: 'Role not found.' }, 404)
  await c.env.DB.prepare('INSERT INTO role_tool_permissions (role_id, tool_id, effect, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(role_id, tool_id) DO UPDATE SET effect = excluded.effect').bind(roleId, toolId, effect, nowIso()).run()
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'role.tool_permission_changed', resource: 'role', resourceId: roleId, metadata: { toolId, effect } })
  return c.json({ roleId, toolId, effect })
})

access.get('/plugins', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT id, name, description, endpoint, method, parameters, risk, enabled, created_by, created_at, updated_at FROM plugins WHERE workspace_id = ? ORDER BY created_at DESC').bind(workspaceId).all()
  return c.json({ plugins: results })
})

access.post('/plugins', requireScope('workspace:admin'), async (c) => {
  const workspaceId = c.get('workspaceId'); const actorId = c.get('actorId'); const body = await c.req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : ''
  let parsed: URL
  try { parsed = new URL(endpoint) } catch { return c.json({ error: 'endpoint must be a valid HTTPS URL.' }, 400) }
  if (parsed.protocol !== 'https:') return c.json({ error: 'Plugins may only call HTTPS endpoints.' }, 400)
  if (!name || name.length > 80) return c.json({ error: 'name is required and must be at most 80 characters.' }, 400)
  const method = body?.method === 'GET' ? 'GET' : 'POST'; const risk = body?.risk === 'sensitive' ? 'sensitive' : body?.risk === 'safe' ? 'safe' : 'review'; const id = newId('plugin'); const at = nowIso()
  await c.env.DB.prepare('INSERT INTO plugins (id, workspace_id, name, description, endpoint, method, auth_env_key, parameters, risk, enabled, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)').bind(id, workspaceId, name, typeof body?.description === 'string' ? body.description.trim() : '', endpoint, method, typeof body?.authEnvKey === 'string' ? body.authEnvKey.trim() : null, JSON.stringify(body?.parameters && typeof body.parameters === 'object' ? body.parameters : {}), risk, actorId, at, at).run()
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'plugin.created', resource: 'plugin', resourceId: id })
  return c.json({ id, name, endpoint, method, risk, enabled: true }, 201)
})

access.post('/plugins/:id/run', async (c) => {
  const workspaceId = c.get('workspaceId'); const actorId = c.get('actorId'); const id = c.req.param('id'); const body = await c.req.json().catch(() => ({}))
  const plugin = await c.env.DB.prepare('SELECT * FROM plugins WHERE id = ? AND workspace_id = ? AND enabled = 1').bind(id, workspaceId).first<any>()
  if (!plugin) return c.json({ error: 'Plugin not found or disabled.' }, 404)
  const scopes = c.get('apiKeyScopes') ?? []
  if (!(await canUseTool(c.env.DB, workspaceId, actorId, `plugin:${id}`, plugin.risk, scopes))) return c.json({ error: 'Your role is not allowed to use this plugin.' }, 403)
  if (plugin.risk !== 'safe' && body?.confirm !== true) return c.json({ requiresConfirmation: true, message: `Plugin "${plugin.name}" requires confirmation before running.` }, 202)
  const input = body?.input && typeof body.input === 'object' ? body.input : {}
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Nova-Workspace': workspaceId }
  if (plugin.auth_env_key) { const secret = (c.env as unknown as Record<string, string | undefined>)[plugin.auth_env_key]; if (!secret) return c.json({ error: 'Plugin secret is not configured on the backend.' }, 503); headers.Authorization = `Bearer ${secret}` }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(plugin.endpoint, { method: plugin.method, headers, signal: controller.signal, ...(plugin.method === 'GET' ? { } : { body: JSON.stringify(input) }) })
    const text = (await response.text()).slice(0, 50_000)
    await appendAudit(c.env.DB, { workspaceId, actorId, action: 'plugin.run', resource: 'plugin', resourceId: id, risk: plugin.risk === 'sensitive' ? 'high' : plugin.risk === 'review' ? 'medium' : 'low', metadata: { status: response.status } })
    return c.json({ ok: response.ok, status: response.status, contentType: response.headers.get('content-type'), body: text }, response.ok ? 200 : 502)
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Plugin request failed.' }, 502) } finally { clearTimeout(timer) }
})

export default access
