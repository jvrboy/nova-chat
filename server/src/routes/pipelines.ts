import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { pipelineRegistry, getPipeline, runPipeline } from '../lib/pipelines'
import { newId, nowIso } from '../lib/ids'
import { parseJson } from '../lib/db'

const pipelines = new Hono<AppEnv>()

pipelines.get('/', (c) => {
  return c.json({ pipelines: pipelineRegistry.map((p) => ({ id: p.id, name: p.name, description: p.description, steps: p.steps.map((s) => ({ id: s.id, type: s.type, name: s.name })) })) })
})

pipelines.post('/:id/run', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const pipelineId = c.req.param('id')
  const pipeline = getPipeline(pipelineId)
  if (!pipeline) return c.json({ error: `Unknown pipeline: ${pipelineId}` }, 404)

  const body = await c.req.json().catch(() => ({}))
  const input = (body?.input && typeof body.input === 'object' ? body.input : {}) as Record<string, unknown>

  const runId = newId('run')
  await c.env.DB.prepare('INSERT INTO workflow_runs (id, workflow_id, workspace_id, status, input, started_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(runId, pipelineId, workspaceId, 'running', JSON.stringify(input), nowIso())
    .run()

  const outcome = await runPipeline(c.env, pipeline, input, { workspaceId, actorId, db: c.env.DB })

  const status = outcome.status === 'waiting_approval' ? 'waiting_approval' : outcome.status === 'failed' ? 'failed' : 'completed'
  await c.env.DB.prepare('UPDATE workflow_runs SET status = ?, step_results = ?, completed_at = ? WHERE id = ?')
    .bind(status, JSON.stringify(outcome.results), nowIso(), runId)
    .run()

  if (status === 'waiting_approval') {
    const pendingStep = outcome.results[outcome.results.length - 1]
    const approvalId = newId('approval')
    await c.env.DB.prepare('INSERT INTO approvals (id, workspace_id, workflow_run_id, step_id, risk, summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(approvalId, workspaceId, runId, pendingStep?.stepId ?? null, 'review', `Pipeline "${pipeline.name}" awaiting approval at step "${pendingStep?.name}".`, 'pending', nowIso())
      .run()
    return c.json({ runId, status, approvalId, results: outcome.results }, 202)
  }

  return c.json({ runId, status, results: outcome.results }, status === 'failed' ? 400 : 200)
})

pipelines.get('/runs', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT id, workflow_id, status, started_at, completed_at FROM workflow_runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT 50')
    .bind(workspaceId)
    .all()
  return c.json({ runs: results })
})

pipelines.get('/runs/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const row = await c.env.DB.prepare('SELECT * FROM workflow_runs WHERE id = ? AND workspace_id = ?').bind(c.req.param('id'), workspaceId).first<any>()
  if (!row) return c.json({ error: 'Pipeline run not found in workspace.' }, 404)
  return c.json({ ...row, step_results: parseJson(row.step_results, []), input: parseJson(row.input, {}) })
})

export default pipelines
