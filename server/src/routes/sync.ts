import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { nowIso } from '../lib/ids'

// Cross-device sync of user settings via the workspace's kv_settings store.
const sync = new Hono<AppEnv>()

sync.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const row = await c.env.DB.prepare('SELECT value, updated_at FROM kv_settings WHERE workspace_id = ? AND key = ?').bind(workspaceId, 'sync:settings').first<{ value: string; updated_at: string }>()
  return c.json({ settings: row ? JSON.parse(row.value) : null, updatedAt: row?.updated_at ?? null })
})

sync.put('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const settings = body?.settings && typeof body.settings === 'object' ? body.settings : {}
  await c.env.DB.prepare('INSERT INTO kv_settings (workspace_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(workspaceId, 'sync:settings', JSON.stringify(settings), nowIso()).run()
  return c.json({ ok: true, updatedAt: nowIso() })
})

export default sync
