import type { Bindings } from './types'
import { newId, nowIso } from './ids'
import { appendAudit, parseJson } from './db'
import { runTool } from './tools'
import { notifyWorkspace } from './push'

export type WorkflowStep = {
  id: string
  type: 'tool' | 'approval' | 'notification'
  name: string
  toolId?: string
  input?: Record<string, unknown>
  risk?: 'safe' | 'review' | 'sensitive'
  message?: string
}

export type WorkflowRunOutcome =
  | { status: 'completed'; runId: string; stepResults: unknown[] }
  | { status: 'failed'; runId: string; stepResults: unknown[] }
  | { status: 'waiting_approval'; runId: string; approvalId: string; stepResults: unknown[] }

/** Executes a *user-defined* workflow. Shared by the manual `POST /run` route
 * and the Cron Trigger's scheduled-workflow runner, so scheduling isn't a
 * second, divergent code path. */
export async function executeWorkflow(
  env: Bindings,
  db: D1Database,
  workflowRow: { id: string; name: string; steps: string; workspace_id: string },
  actorId = 'scheduler'
): Promise<WorkflowRunOutcome> {
  const workspaceId = workflowRow.workspace_id
  const steps: WorkflowStep[] = parseJson(workflowRow.steps, [])
  const runId = newId('run')
  const stepResults: unknown[] = []

  await db.prepare('INSERT INTO workflow_runs (id, workflow_id, workspace_id, status, input, started_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(runId, workflowRow.id, workspaceId, 'running', '{}', nowIso())
    .run()

  for (const step of steps) {
    if (step.type === 'tool' && step.toolId) {
      const outcome = await runTool(step.toolId, step.input ?? {}, { env, workspaceId, actorId, db })
      stepResults.push({ stepId: step.id, name: step.name, ...outcome })
      if (!outcome.ok) {
        await db.prepare('UPDATE workflow_runs SET status = ?, step_results = ?, error = ?, completed_at = ? WHERE id = ?')
          .bind('failed', JSON.stringify(stepResults), outcome.error, nowIso(), runId)
          .run()
        return { status: 'failed', runId, stepResults }
      }
    } else if (step.type === 'approval') {
      const approvalId = newId('approval')
      await db.prepare('INSERT INTO approvals (id, workspace_id, workflow_run_id, step_id, risk, summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(approvalId, workspaceId, runId, step.id, step.risk ?? 'review', `Workflow "${workflowRow.name}" awaiting approval at step "${step.name}".`, 'pending', nowIso())
        .run()
      stepResults.push({ stepId: step.id, name: step.name, status: 'waiting_approval', approvalId })
      await db.prepare('UPDATE workflow_runs SET status = ?, step_results = ? WHERE id = ?').bind('waiting_approval', JSON.stringify(stepResults), runId).run()
      notifyWorkspace(env, db, workspaceId, { title: 'Approval needed', body: `Workflow "${workflowRow.name}" is waiting on your approval.`, data: { type: 'approval', approvalId } }).catch(() => {})
      return { status: 'waiting_approval', runId, approvalId, stepResults }
    } else if (step.type === 'notification') {
      stepResults.push({ stepId: step.id, name: step.name, status: 'completed', queued: true })
      notifyWorkspace(env, db, workspaceId, { title: workflowRow.name, body: step.message || `Step "${step.name}" completed.` }).catch(() => {})
    }
  }

  await db.prepare('UPDATE workflow_runs SET status = ?, step_results = ?, completed_at = ? WHERE id = ?')
    .bind('completed', JSON.stringify(stepResults), nowIso(), runId)
    .run()
  await appendAudit(db, { workspaceId, actorId, action: 'workflow.executed', resource: 'workflow', resourceId: workflowRow.id, metadata: { stepCount: steps.length } })
  return { status: 'completed', runId, stepResults }
}

/** Called from the Cron Trigger: finds workflows whose next_run_at has passed,
 * runs them, and reschedules based on their schedule_minutes interval. This is
 * a real recurring scheduler, not a client-invoked simulation. */
export async function runDueScheduledWorkflows(env: Bindings, db: D1Database) {
  const now = nowIso()
  const { results: due } = await db.prepare(
    "SELECT * FROM workflows WHERE enabled = 1 AND schedule_minutes IS NOT NULL AND next_run_at IS NOT NULL AND next_run_at <= ?"
  ).bind(now).all<any>()

  const ran: string[] = []
  for (const workflow of due) {
    await executeWorkflow(env, db, workflow, 'scheduler').catch(() => {})
    ran.push(workflow.id)
    const nextRunAt = new Date(Date.now() + workflow.schedule_minutes * 60_000).toISOString()
    await db.prepare('UPDATE workflows SET next_run_at = ? WHERE id = ?').bind(nextRunAt, workflow.id).run()
  }
  return { ranCount: ran.length, workflowIds: ran }
}
