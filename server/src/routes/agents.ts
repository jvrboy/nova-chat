import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { agentRegistry, runAgent } from '../lib/agents'
import { newId, nowIso } from '../lib/ids'
import { parseJson } from '../lib/db'

const agents = new Hono<AppEnv>()

agents.get('/', (c) => {
  return c.json({ agents: agentRegistry.map((a) => ({ key: a.key, name: a.name, description: a.description, maxSteps: a.maxSteps })) })
})

agents.post('/:key/run', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const agentKey = c.req.param('key')
  const body = await c.req.json().catch(() => ({}))
  const input = typeof body?.input === 'string' ? body.input : ''
  if (!input.trim()) return c.json({ error: 'Field "input" (string) is required.' }, 400)

  const runId = newId('agentrun')
  const startedAt = nowIso()
  await c.env.DB.prepare('INSERT INTO agent_runs (id, workspace_id, agent_key, input, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(runId, workspaceId, agentKey, input, 'running', startedAt)
    .run()

  const result = await runAgent(c.env, agentKey, input, { workspaceId, actorId, db: c.env.DB })

  await c.env.DB.prepare('UPDATE agent_runs SET status = ?, steps = ?, output = ?, error = ?, completed_at = ? WHERE id = ?')
    .bind(result.status, JSON.stringify(result.steps), result.output ?? null, result.error ?? null, nowIso(), runId)
    .run()

  return c.json({ ...result, runId })
})

agents.get('/runs', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT id, agent_key, status, output, error, created_at, completed_at FROM agent_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(workspaceId)
    .all()
  return c.json({ runs: results })
})

agents.get('/runs/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const row = await c.env.DB.prepare('SELECT * FROM agent_runs WHERE id = ? AND workspace_id = ?').bind(c.req.param('id'), workspaceId).first<any>()
  if (!row) return c.json({ error: 'Agent run not found in workspace.' }, 404)
  return c.json({ ...row, steps: parseJson(row.steps, []) })
})

// GET /api/agents/delegations/:runId - see the multi-agent handoff tree for a run
// (which specialist agents a parent run delegated to, and why).
agents.get('/delegations/:runId', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT * FROM agent_delegations WHERE workspace_id = ? AND parent_run_id = ? ORDER BY created_at ASC')
    .bind(workspaceId, c.req.param('runId'))
    .all()
  return c.json({ delegations: results })
})

export default agents
