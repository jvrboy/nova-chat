import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { toolRegistry, runTool } from '../lib/tools'
import { newId, nowIso } from '../lib/ids'
import { appendAudit } from '../lib/db'

const tools = new Hono<AppEnv>()

tools.get('/', (c) => {
  return c.json({
    tools: toolRegistry.map((t) => ({ id: t.id, name: t.name, description: t.description, category: t.category, risk: t.risk, parameters: t.parameters })),
  })
})

tools.post('/:id/run', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const toolId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const input = (body?.input && typeof body.input === 'object' ? body.input : {}) as Record<string, unknown>

  const tool = toolRegistry.find((t) => t.id === toolId)
  if (!tool) return c.json({ error: `Unknown tool: ${toolId}` }, 404)

  if (tool.risk === 'sensitive' && body?.confirm !== true) {
    const approvalId = newId('approval')
    await c.env.DB.prepare(
      'INSERT INTO approvals (id, workspace_id, step_id, risk, summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(approvalId, workspaceId, toolId, 'sensitive', `Run tool "${tool.name}" with provided input.`, 'pending', nowIso()).run()
    return c.json({ requiresConfirmation: true, approvalId, message: `Tool "${tool.id}" is sensitive; pass { "confirm": true } to run it, or approve via /api/approvals/${approvalId}.` }, 202)
  }

  const outcome = await runTool(toolId, input, { env: c.env, workspaceId, actorId, db: c.env.DB })
  await appendAudit(c.env.DB, {
    workspaceId,
    actorId,
    action: 'tool.run',
    resource: 'tool',
    resourceId: toolId,
    risk: tool.risk === 'sensitive' ? 'high' : tool.risk === 'review' ? 'medium' : 'low',
    metadata: { ok: outcome.ok, durationMs: outcome.durationMs },
  })
  return c.json(outcome, outcome.ok ? 200 : 400)
})

export default tools
