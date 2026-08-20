import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { supabaseStatus } from '../lib/supabase'
import { kaggleStatus } from '../lib/kaggle'
import { e2bStatus } from '../lib/e2b'

const observability = new Hono<AppEnv>()

// Real request metrics derived from the request_log table (populated by the logging
// middleware in src/index.tsx on every request) — not a simulation.
observability.get('/summary', async (c) => {
  const workspaceId = c.get('workspaceId')
  const windowMinutes = Number(c.req.query('windowMinutes') ?? 60)
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()

  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) as requests,
            SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as server_errors,
            SUM(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END) as client_errors,
            AVG(latency_ms) as avg_latency_ms,
            MAX(latency_ms) as max_latency_ms
     FROM request_log WHERE workspace_id = ? AND created_at >= ?`
  ).bind(workspaceId, since).first<any>()

  const byPath = await c.env.DB.prepare(
    `SELECT path, COUNT(*) as count, AVG(latency_ms) as avg_latency_ms
     FROM request_log WHERE workspace_id = ? AND created_at >= ?
     GROUP BY path ORDER BY count DESC LIMIT 10`
  ).bind(workspaceId, since).all()

  const jobStats = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as count FROM jobs WHERE workspace_id = ? GROUP BY status`
  ).bind(workspaceId).all()

  return c.json({ windowMinutes, totals, byPath: byPath.results, jobStats: jobStats.results })
})

observability.get('/audit', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT * FROM audit_log WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100')
    .bind(workspaceId)
    .all()
  return c.json({ audit: results })
})

// GET /api/observability/dashboard - single call bundling everything the
// mobile usage dashboard screen needs (summary + recent audit + agent/tool usage).
observability.get('/dashboard', async (c) => {
  const workspaceId = c.get('workspaceId')
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) as requests,
            SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) as server_errors,
            AVG(latency_ms) as avg_latency_ms
     FROM request_log WHERE workspace_id = ? AND created_at >= ?`
  ).bind(workspaceId, since).first<any>()

  const agentRuns = await c.env.DB.prepare(
    `SELECT agent_key, COUNT(*) as runs FROM agent_runs WHERE workspace_id = ? AND created_at >= ? GROUP BY agent_key ORDER BY runs DESC`
  ).bind(workspaceId, since).all()

  const jobStats = await c.env.DB.prepare(`SELECT status, COUNT(*) as count FROM jobs WHERE workspace_id = ? GROUP BY status`).bind(workspaceId).all()
  const pendingApprovals = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM approvals WHERE workspace_id = ? AND status = 'pending'`).bind(workspaceId).first<{ count: number }>()
  const chatCount = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM chats WHERE workspace_id = ?`).bind(workspaceId).first<{ count: number }>()
  const memoryCount = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM memories WHERE workspace_id = ?`).bind(workspaceId).first<{ count: number }>()

  return c.json({
    windowHours: 24,
    requests: totals,
    agentRuns: agentRuns.results,
    jobStats: jobStats.results,
    pendingApprovals: pendingApprovals?.count ?? 0,
    chatCount: chatCount?.count ?? 0,
    memoryCount: memoryCount?.count ?? 0,
  })
})

observability.get('/health', async (c) => {
  const workspaceId = c.get('workspaceId')
  try {
    await c.env.DB.prepare('SELECT 1').first()
    const llmOk = Boolean(c.env.OPENAI_API_KEY)
    return c.json({
      status: 'ok',
      db: 'ok',
      llmConfigured: llmOk,
      workspaceId,
      checkedAt: new Date().toISOString(),
      providers: {
        supabase: supabaseStatus(c.env),
        kaggle: kaggleStatus(c.env),
        e2b: e2bStatus(c.env),
      },
    })
  } catch (error) {
    return c.json({ status: 'error', message: error instanceof Error ? error.message : 'health check failed' }, 500)
  }
})

// GET /api/observability/providers - dedicated, lightweight endpoint for just
// the third-party provider configuration state (no key material returned).
observability.get('/providers', (c) => {
  return c.json({
    supabase: supabaseStatus(c.env),
    kaggle: kaggleStatus(c.env),
    e2b: e2bStatus(c.env),
  })
})

export default observability
