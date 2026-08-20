import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { createWebhookSignature } from '../lib/webhook'

const connectors = new Hono<AppEnv>()

connectors.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT id, workspace_id, provider, name, status, endpoint, last_checked_at, created_at FROM connectors WHERE workspace_id = ? ORDER BY created_at DESC')
    .bind(workspaceId)
    .all()
  return c.json({ connectors: results })
})

connectors.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const provider = body?.provider
  const validProviders = ['webhook', 'calendar', 'storage', 'llm', 'analytics', 'email']
  if (!validProviders.includes(provider)) return c.json({ error: `provider must be one of ${validProviders.join(', ')}` }, 400)
  const name = typeof body?.name === 'string' ? body.name.trim() : provider
  const id = newId('conn')
  const at = nowIso()
  await c.env.DB.prepare('INSERT INTO connectors (id, workspace_id, provider, name, status, endpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, workspaceId, provider, name, body?.endpoint ? 'connected' : 'not_configured', body?.endpoint ?? null, at, at)
    .run()
  return c.json({ id, provider, name }, 201)
})

// Sends a real HTTPS POST to a configured webhook connector's endpoint — used by alerting.ts
// and available directly for manual test-fires.
connectors.post('/:id/test-fire', async (c) => {
  const workspaceId = c.get('workspaceId')
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT * FROM connectors WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first<any>()
  if (!row) return c.json({ error: 'Connector not found in workspace.' }, 404)
  if (row.provider !== 'webhook' || !row.endpoint) return c.json({ error: 'Connector is not a configured webhook.' }, 400)

  const payload = JSON.stringify({ event: 'test.fired', workspaceId, at: nowIso() })
  const signature = await createWebhookSignature(payload, id)
  try {
    const response = await fetch(row.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nova-Signature': signature },
      body: payload,
    })
    await c.env.DB.prepare('UPDATE connectors SET status = ?, last_checked_at = ? WHERE id = ?')
      .bind(response.ok ? 'connected' : 'error', nowIso(), id)
      .run()
    return c.json({ delivered: response.ok, status: response.status })
  } catch (error) {
    await c.env.DB.prepare('UPDATE connectors SET status = ?, last_checked_at = ? WHERE id = ?').bind('error', nowIso(), id).run()
    return c.json({ delivered: false, error: error instanceof Error ? error.message : 'Webhook delivery failed.' }, 502)
  }
})

export default connectors
