import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { parseJson } from '../lib/db'
import { drainJobQueue } from '../lib/jobqueue'

const jobs = new Hono<AppEnv>()

jobs.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const status = c.req.query('status')
  const stmt = status
    ? c.env.DB.prepare('SELECT * FROM jobs WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100').bind(workspaceId, status)
    : c.env.DB.prepare('SELECT * FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').bind(workspaceId)
  const { results } = await stmt.all<any>()
  return c.json({ jobs: results.map((r) => ({ ...r, input: parseJson(r.input, {}), result: r.result ? parseJson(r.result, null) : null })) })
})

jobs.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const toolId = typeof body?.toolId === 'string' ? body.toolId : ''
  if (!toolId) return c.json({ error: 'Field "toolId" is required.' }, 400)
  const id = newId('job')
  const at = nowIso()
  await c.env.DB.prepare('INSERT INTO jobs (id, workspace_id, tool_id, input, status, priority, max_attempts, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, workspaceId, toolId, JSON.stringify(body?.input ?? {}), 'queued', body?.priority ?? 5, body?.maxAttempts ?? 3, at, at, at)
    .run()
  return c.json({ id, toolId, status: 'queued' }, 201)
})

// Manual drain endpoint (the same logic also runs automatically on the Cron Trigger — see src/index.tsx `scheduled()`).
jobs.post('/drain', async (c) => {
  const workspaceId = c.get('workspaceId')
  const result = await drainJobQueue(c.env, workspaceId)
  return c.json(result)
})

export default jobs
