import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { nowIso } from '../lib/ids'
import { appendAudit } from '../lib/db'
import { notifyWorkspace } from '../lib/push'

const approvals = new Hono<AppEnv>()

approvals.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const status = c.req.query('status')
  const query = status
    ? 'SELECT * FROM approvals WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100'
    : 'SELECT * FROM approvals WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100'
  const stmt = status ? c.env.DB.prepare(query).bind(workspaceId, status) : c.env.DB.prepare(query).bind(workspaceId)
  const { results } = await stmt.all()
  return c.json({ approvals: results })
})

approvals.post('/:id/decision', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const approved = body?.approved === true

  const row = await c.env.DB.prepare('SELECT * FROM approvals WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first<any>()
  if (!row) return c.json({ error: 'Approval not found in workspace.' }, 404)
  if (row.status !== 'pending') return c.json({ error: `Approval already ${row.status}.` }, 409)

  const status = approved ? 'approved' : 'rejected'
  await c.env.DB.prepare('UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?').bind(status, nowIso(), id).run()
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'approval.decided', resource: 'approval', resourceId: id, risk: 'medium', metadata: { approved } })

  // Real push notification (not simulated) so the mobile app can surface
  // approval outcomes even when the user isn't actively looking at the screen.
  notifyWorkspace(c.env, c.env.DB, workspaceId, {
    title: approved ? 'Approval granted' : 'Approval rejected',
    body: row.summary || `Approval ${id} was ${status}.`,
    data: { type: 'approval', approvalId: id, status },
  }).catch(() => {})

  return c.json({ id, status })
})

export default approvals
