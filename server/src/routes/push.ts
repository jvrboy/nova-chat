import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { sendPushNotification } from '../lib/push'

const push = new Hono<AppEnv>()

// POST /api/push/register - the Expo app calls this with its Expo push token
// (from expo-notifications) right after requesting notification permission.
push.post('/register', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) return c.json({ error: 'Field "token" is required.' }, 400)
  const platform = typeof body?.platform === 'string' ? body.platform : 'unknown'

  await c.env.DB.prepare('INSERT INTO push_tokens (id, workspace_id, token, platform, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(workspace_id, token) DO NOTHING')
    .bind(newId('push'), workspaceId, token, platform, nowIso())
    .run()
  return c.json({ registered: true })
})

push.delete('/register', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) return c.json({ error: 'Field "token" is required.' }, 400)
  await c.env.DB.prepare('DELETE FROM push_tokens WHERE workspace_id = ? AND token = ?').bind(workspaceId, token).run()
  return c.json({ unregistered: true })
})

// POST /api/push/test - send a one-off test notification to all tokens in the workspace.
push.post('/test', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT token FROM push_tokens WHERE workspace_id = ?').bind(workspaceId).all<{ token: string }>()
  const tokens = results.map((r) => r.token)
  const result = await sendPushNotification(c.env, tokens, { title: 'Nova test notification', body: 'Push delivery is working.' })
  return c.json({ tokensNotified: tokens.length, ...result })
})

export default push
