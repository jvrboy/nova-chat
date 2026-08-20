import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { appendAudit, parseJson } from '../lib/db'
import { executeWorkflow, WorkflowStep } from '../lib/workflowEngine'

const workflows = new Hono<AppEnv>()

workflows.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT * FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC').bind(workspaceId).all<any>()
  return c.json({ workflows: results.map((r) => ({ ...r, steps: parseJson(r.steps, []), enabled: Boolean(r.enabled) })) })
})

workflows.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const body = await c.req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'Field "name" is required.' }, 400)
  const steps: WorkflowStep[] = Array.isArray(body?.steps) ? body.steps : []

  const id = newId('wf')
  const at = nowIso()
  await c.env.DB.prepare('INSERT INTO workflows (id, workspace_id, name, description, trigger, steps, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .bind(id, workspaceId, name, body?.description ?? '', body?.trigger ?? 'manual', JSON.stringify(steps), at, at)
    .run()
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'workflow.created', resource: 'workflow', resourceId: id })
  return c.json({ id, name, steps }, 201)
})

// PATCH /api/workflows/:id/schedule - set/clear a recurring interval (in minutes)
// at which the Cron Trigger will auto-run this workflow. Pass { minutes: 0 } to disable.
workflows.patch('/:id/schedule', async (c) => {
  const workspaceId = c.get('workspaceId')
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const minutes = Number(body?.minutes ?? 0)
  const row = await c.env.DB.prepare('SELECT id FROM workflows WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first()
  if (!row) return c.json({ error: 'Workflow not found in workspace.' }, 404)

  if (!minutes || minutes <= 0) {
    await c.env.DB.prepare('UPDATE workflows SET schedule_minutes = NULL, next_run_at = NULL, updated_at = ? WHERE id = ?').bind(nowIso(), id).run()
    return c.json({ id, scheduled: false })
  }
  const nextRunAt = new Date(Date.now() + minutes * 60_000).toISOString()
  await c.env.DB.prepare('UPDATE workflows SET schedule_minutes = ?, next_run_at = ?, updated_at = ? WHERE id = ?').bind(minutes, nextRunAt, nowIso(), id).run()
  return c.json({ id, scheduled: true, minutes, nextRunAt })
})

workflows.patch('/:id/toggle', async (c) => {
  const workspaceId = c.get('workspaceId')
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT enabled FROM workflows WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first<{ enabled: number }>()
  if (!row) return c.json({ error: 'Workflow not found in workspace.' }, 404)
  const next = row.enabled ? 0 : 1
  await c.env.DB.prepare('UPDATE workflows SET enabled = ?, updated_at = ? WHERE id = ?').bind(next, nowIso(), id).run()
  return c.json({ id, enabled: Boolean(next) })
})

// Executes a *user-defined* workflow (distinct from the built-in pipelines in /api/pipelines).
workflows.post('/:id/run', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT * FROM workflows WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first<any>()
  if (!row) return c.json({ error: 'Workflow not found in workspace.' }, 404)
  if (!row.enabled) return c.json({ error: 'Workflow is disabled.' }, 409)

  const outcome = await executeWorkflow(c.env, c.env.DB, row, actorId)
  const status = outcome.status === 'failed' ? 400 : outcome.status === 'waiting_approval' ? 202 : 200
  return c.json(outcome, status)
})

export default workflows
