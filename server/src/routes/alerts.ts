import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { evaluateAlerts } from '../lib/alerting'

const alerts = new Hono<AppEnv>()

const VALID_METRICS = ['error_rate', 'job_dead_letters', 'latency_p95', 'request_volume']

alerts.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT * FROM alert_rules WHERE workspace_id = ? ORDER BY created_at DESC').bind(workspaceId).all()
  return c.json({ rules: results })
})

alerts.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'Field "name" is required.' }, 400)
  if (!VALID_METRICS.includes(body?.metric)) return c.json({ error: `metric must be one of ${VALID_METRICS.join(', ')}` }, 400)
  const threshold = Number(body?.threshold)
  if (!Number.isFinite(threshold)) return c.json({ error: 'threshold must be a number.' }, 400)

  const id = newId('alert')
  await c.env.DB.prepare('INSERT INTO alert_rules (id, workspace_id, name, metric, threshold, window_minutes, webhook_connector_id, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
    .bind(id, workspaceId, name, body.metric, threshold, body?.windowMinutes ?? 60, body?.webhookConnectorId ?? null, nowIso())
    .run()
  return c.json({ id, name }, 201)
})

alerts.post('/evaluate', async (c) => {
  const workspaceId = c.get('workspaceId')
  const result = await evaluateAlerts(c.env, workspaceId)
  return c.json(result)
})

export default alerts
