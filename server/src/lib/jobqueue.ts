import type { Bindings } from './types'
import { runTool } from './tools'
import { nowIso } from './ids'
import { parseJson, appendAudit } from './db'
import { notifyWorkspace } from './push'

/**
 * Drains due jobs from the `jobs` table for a workspace (or, if workspaceId is
 * omitted, across all workspaces — used by the Cron Trigger). Runs actual tool
 * executions, not a simulation. Failed jobs are retried with exponential
 * backoff up to max_attempts, then marked 'dead'.
 */
export async function drainJobQueue(env: Bindings, workspaceId?: string, limit = 25) {
  const db = env.DB
  const now = nowIso()
  const query = workspaceId
    ? db.prepare('SELECT * FROM jobs WHERE workspace_id = ? AND status = ? AND next_run_at <= ? ORDER BY priority DESC, created_at ASC LIMIT ?').bind(workspaceId, 'queued', now, limit)
    : db.prepare('SELECT * FROM jobs WHERE status = ? AND next_run_at <= ? ORDER BY priority DESC, created_at ASC LIMIT ?').bind('queued', now, limit)

  const { results: dueJobs } = await query.all<any>()
  const completed: string[] = []
  const retried: string[] = []
  const dead: string[] = []

  for (const job of dueJobs) {
    await db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').bind('running', nowIso(), job.id).run()
    const input = parseJson(job.input, {})
    const outcome = await runTool(job.tool_id, input, { env, workspaceId: job.workspace_id, actorId: 'job-worker', db })

    if (outcome.ok) {
      await db.prepare('UPDATE jobs SET status = ?, result = ?, updated_at = ? WHERE id = ?')
        .bind('completed', JSON.stringify(outcome.result), nowIso(), job.id)
        .run()
      completed.push(job.id)
      await appendAudit(db, { workspaceId: job.workspace_id, actorId: 'job-worker', action: 'job.completed', resource: 'job', resourceId: job.id, metadata: { toolId: job.tool_id } })
      notifyWorkspace(env, db, job.workspace_id, { title: 'Job completed', body: `${job.tool_id} finished successfully.`, data: { type: 'job', jobId: job.id, status: 'completed' } }).catch(() => {})
    } else {
      const attempts = job.attempts + 1
      if (attempts >= job.max_attempts) {
        await db.prepare('UPDATE jobs SET status = ?, attempts = ?, error = ?, updated_at = ? WHERE id = ?')
          .bind('dead', attempts, outcome.error, nowIso(), job.id)
          .run()
        dead.push(job.id)
        await appendAudit(db, { workspaceId: job.workspace_id, actorId: 'job-worker', action: 'job.dead_lettered', resource: 'job', resourceId: job.id, risk: 'medium', metadata: { toolId: job.tool_id, error: outcome.error } })
        notifyWorkspace(env, db, job.workspace_id, { title: 'Job failed', body: `${job.tool_id} failed after ${attempts} attempts: ${outcome.error ?? 'unknown error'}`, data: { type: 'job', jobId: job.id, status: 'dead' } }).catch(() => {})
      } else {
        const backoffMs = Math.min(30 * 60_000, 2 ** attempts * 5000)
        const nextRunAt = new Date(Date.now() + backoffMs).toISOString()
        await db.prepare('UPDATE jobs SET status = ?, attempts = ?, next_run_at = ?, error = ?, updated_at = ? WHERE id = ?')
          .bind('queued', attempts, nextRunAt, outcome.error, nowIso(), job.id)
          .run()
        retried.push(job.id)
      }
    }
  }

  return { completed, retried, dead, processed: dueJobs.length }
}
