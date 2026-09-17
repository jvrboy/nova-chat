/**
 * Long-Running Task Engine
 * ──────────────────────────
 * Persistent, resumable, observable background tasks that survive across
 * Cloudflare Worker invocations. Designed for "never stops until done"
 * semantics — the cron handler picks up pending tasks and continues work
 * on each scheduled tick until the task's goal is verified complete.
 *
 * Lifecycle:
 *   pending → planning → working → verifying → completed | failed
 *                              ↑                ↓
 *                              └─ needs_more ────┘
 *
 * Each task has:
 *   • goal        — natural-language objective
 *   • plan        — subtask decomposition (LLM-generated)
 *   • state       — JSON blob of accumulated context
 *   • steps       — ordered log of every step attempted
 *   • status      — lifecycle state
 *   • attempts    — bounded retry counter
 *   • verified    — true once isTaskComplete(goal, finalState) returns true
 */

import type { Bindings } from './types'
import { newId, nowIso } from './ids'
import { chatComplete, generateText, LlmMessage } from './llm'
import { aiConfigured, aiChat } from './ai'
import { runTool, toolAsLlmSpec, toolRegistry, getTool } from './tools'
import { reasonWith, isTaskComplete, ReasoningTrace } from './reasoning'
import { semanticSearch } from './embeddings'
import { bindBrainDb } from './brain/db'
import { ensureBrainInitialized } from './brain/init'
import { memory as brainMemory } from './brain/memory'
import { appendAudit } from './db'

// ── Types ─────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'working'
  | 'verifying'
  | 'needs_more'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface LongTaskStep {
  id: string
  kind: 'plan' | 'subtask' | 'tool_call' | 'observation' | 'reasoning' | 'verification' | 'answer'
  title: string
  detail: string
  at: string
  durationMs?: number
  metadata?: Record<string, unknown>
}

export interface LongTask {
  id: string
  workspaceId: string
  actorId: string
  goal: string
  status: TaskStatus
  plan: string[]              // subtask list
  state: Record<string, unknown>  // accumulated context
  steps: LongTaskStep[]
  attempts: number
  maxAttempts: number
  verified: boolean
  finalAnswer: string | null
  strategy: string | null
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

// ── Persistence ────────────────────────────────────────────────────────

const MAX_PLAN_STEPS = 8
const MAX_STEPS_PER_TICK = 6

export async function createLongTask(
  db: D1Database,
  params: { workspaceId: string; actorId: string; goal: string; maxAttempts?: number },
): Promise<LongTask> {
  const id = newId('ltask')
  const now = nowIso()
  const maxAttempts = Math.min(Math.max(params.maxAttempts ?? 6, 1), 20)
  await db.prepare(
    `INSERT INTO long_tasks
     (id, workspace_id, actor_id, goal, status, plan, state, steps, attempts, max_attempts, verified, final_answer, strategy, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', '[]', '{}', '[]', 0, ?, 0, NULL, NULL, ?, ?)`,
  ).bind(id, params.workspaceId, params.actorId, params.goal, maxAttempts, now, now).run()

  await appendAudit(db, {
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: 'long_task.created',
    resource: 'long_task',
    resourceId: id,
    risk: 'low',
    metadata: { goal: params.goal.slice(0, 200) },
  })

  return loadLongTask(db, id) as Promise<LongTask>
}

export async function loadLongTask(db: D1Database, id: string): Promise<LongTask | null> {
  const row = await db.prepare('SELECT * FROM long_tasks WHERE id = ?').bind(id).first<any>()
  if (!row) return null
  return deserializeTask(row)
}

export async function listLongTasks(db: D1Database, workspaceId: string, opts: { status?: TaskStatus; limit?: number } = {}): Promise<LongTask[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  if (opts.status) {
    const { results } = await db.prepare(
      'SELECT * FROM long_tasks WHERE workspace_id = ? AND status = ? ORDER BY updated_at DESC LIMIT ?',
    ).bind(workspaceId, opts.status, limit).all<any>()
    return results.map(deserializeTask)
  }
  const { results } = await db.prepare(
    'SELECT * FROM long_tasks WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?',
  ).bind(workspaceId, limit).all<any>()
  return results.map(deserializeTask)
}

export async function listPendingTasks(db: D1Database, limit = 10): Promise<LongTask[]> {
  const { results } = await db.prepare(
    `SELECT * FROM long_tasks
     WHERE status IN ('pending', 'planning', 'working', 'verifying', 'needs_more')
     ORDER BY
       CASE status WHEN 'pending' THEN 0 WHEN 'planning' THEN 1 WHEN 'working' THEN 2 WHEN 'needs_more' THEN 3 WHEN 'verifying' THEN 4 END,
       updated_at ASC
     LIMIT ?`,
  ).bind(limit).all<any>()
  return results.map(deserializeTask)
}

function deserializeTask(row: any): LongTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    goal: row.goal,
    status: row.status as TaskStatus,
    plan: safeJson(row.plan, []),
    state: safeJson(row.state, {}),
    steps: safeJson(row.steps, []),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 6),
    verified: !!Number(row.verified ?? 0),
    finalAnswer: row.final_answer ?? null,
    strategy: row.strategy ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? null,
  }
}

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}

async function persistTask(db: D1Database, task: LongTask): Promise<void> {
  const now = nowIso()
  await db.prepare(
    `UPDATE long_tasks
     SET status = ?, plan = ?, state = ?, steps = ?, attempts = ?, verified = ?, final_answer = ?, strategy = ?, updated_at = ?, finished_at = ?
     WHERE id = ?`,
  ).bind(
    task.status,
    JSON.stringify(task.plan.slice(0, MAX_PLAN_STEPS)),
    JSON.stringify(task.state),
    JSON.stringify(task.steps.slice(-100)),  // keep last 100 steps
    task.attempts,
    task.verified ? 1 : 0,
    task.finalAnswer,
    task.strategy,
    now,
    task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled' ? now : null,
    task.id,
  ).run()
}

// ── Cancellation ───────────────────────────────────────────────────────

export async function cancelLongTask(db: D1Database, id: string, workspaceId: string, actorId: string): Promise<LongTask | null> {
  const task = await loadLongTask(db, id)
  if (!task || task.workspaceId !== workspaceId) return null
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return task
  task.status = 'cancelled'
  task.steps.push({ id: newId('step'), kind: 'reasoning', title: 'Task cancelled by user', detail: `Cancelled by ${actorId}`, at: nowIso() })
  await persistTask(db, task)
  await appendAudit(db, {
    workspaceId, actorId, action: 'long_task.cancelled',
    resource: 'long_task', resourceId: id, risk: 'low',
  })
  return task
}

// ── The tick: advance a task by one unit of work ─────────────────────

/**
 * Advances a long-running task by one logical unit. Called repeatedly by:
 *   • the originating request (synchronously, while the user waits)
 *   • the cron handler (to pick up where the request left off)
 *
 * Returns the updated task. The caller should re-check `task.status` to
 * decide whether to call again (status ∈ {pending, planning, working,
 * verifying, needs_more}) or stop (status ∈ {completed, failed, cancelled}).
 */
export async function tickLongTask(env: Bindings, db: D1Database, taskId: string): Promise<LongTask | null> {
  const task = await loadLongTask(db, taskId)
  if (!task) return null
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return task

  bindBrainDb(db)
  await ensureBrainInitialized().catch(() => {})

  try {
    switch (task.status) {
      case 'pending': await planPhase(env, db, task); break
      case 'planning':
      case 'working': await workPhase(env, db, task); break
      case 'verifying': await verifyPhase(env, db, task); break
      case 'needs_more': await needsMorePhase(env, db, task); break
    }
  } catch (err) {
    task.steps.push({
      id: newId('step'),
      kind: 'reasoning',
      title: 'Tick error',
      detail: err instanceof Error ? err.message : 'unknown error',
      at: nowIso(),
    })
    if (task.attempts >= task.maxAttempts) {
      task.status = 'failed'
      task.finalAnswer = `Task failed after ${task.attempts} attempts. Last error: ${err instanceof Error ? err.message : 'unknown'}`
    } else {
      task.attempts += 1
      task.status = 'working'
    }
  }

  await persistTask(db, task)
  return task
}

// ── Phase 1: plan ─────────────────────────────────────────────────────

async function planPhase(env: Bindings, db: D1Database, task: LongTask): Promise<void> {
  task.status = 'planning'
  const t0 = Date.now()
  const planText = await quickText(
    env,
    'You are a planning agent. Decompose the goal into 2-6 concrete, ordered subtasks. Respond ONLY as a numbered list, one subtask per line, no preamble.',
    `Goal: ${task.goal}\n\nSubtasks:`,
    0.3,
  )
  const subtasks = planText.split('\n').map((l) => l.replace(/^\s*\d+[\.\)]\s*/, '').trim()).filter(Boolean).slice(0, MAX_PLAN_STEPS)
  task.plan = subtasks
  task.steps.push({
    id: newId('step'),
    kind: 'plan',
    title: `Planned ${subtasks.length} subtasks`,
    detail: subtasks.join('\n'),
    at: nowIso(),
    durationMs: Date.now() - t0,
  })

  // Recall relevant memories
  try {
    const matches = await semanticSearch(env, db, task.workspaceId, task.goal, 5)
    if (matches.length) {
      task.state.recalledMemories = matches.map((m) => ({ content: m.content, score: m.score }))
      task.steps.push({
        id: newId('step'),
        kind: 'observation',
        title: `Recalled ${matches.length} memories`,
        detail: matches.slice(0, 3).map((m) => m.content.slice(0, 200)).join('\n---\n'),
        at: nowIso(),
      })
    }
  } catch { /* best-effort */ }

  task.status = 'working'
  task.state.currentSubtask = 0
  task.state.subtaskResults = []
}

// ── Phase 2: work on next subtask(s) ──────────────────────────────────

async function workPhase(env: Bindings, db: D1Database, task: LongTask): Promise<void> {
  const currentSubtaskIdx = (task.state.currentSubtask as number) ?? 0
  if (currentSubtaskIdx >= task.plan.length) {
    task.status = 'verifying'
    return
  }

  const subtask = task.plan[currentSubtaskIdx]
  const t0 = Date.now()

  // Use ReAct to make progress on this subtask
  const subtaskResults = (task.state.subtaskResults as string[]) ?? []
  const priorContext = subtaskResults.length
    ? `Prior subtask results:\n${subtaskResults.map((r, i) => `### Subtask ${i + 1} result:\n${r}`).join('\n\n')}\n\n`
    : ''

  const trace: ReasoningTrace = await reasonWith(
    subtask,
    [
      { role: 'system', content: `You are working on subtask ${currentSubtaskIdx + 1} of ${task.plan.length} for the larger goal: ${task.goal}. Be thorough. Use tools if they would help.` },
      { role: 'system', content: priorContext + `Larger goal context: ${task.goal}` },
    ],
    {
      env, workspaceId: task.workspaceId, actorId: task.actorId, db,
      maxIterations: 4,
      allowedToolIds: 'all',  // long tasks are explicit user requests → allow all tools (still subject to risk policy)
    },
    'react',
  )

  task.steps.push({
    id: newId('step'),
    kind: 'subtask',
    title: `Subtask ${currentSubtaskIdx + 1}/${task.plan.length}: ${subtask.slice(0, 100)}`,
    detail: trace.finalAnswer.slice(0, 800),
    at: nowIso(),
    durationMs: Date.now() - t0,
    metadata: { strategy: trace.strategy, toolCalls: trace.toolCalls, confidence: trace.confidence },
  })

  subtaskResults.push(trace.finalAnswer)
  task.state.subtaskResults = subtaskResults
  task.state.currentSubtask = currentSubtaskIdx + 1
  task.strategy = trace.strategy

  // If we've completed all subtasks, move to verification
  if ((task.state.currentSubtask as number) >= task.plan.length) {
    task.status = 'verifying'
  }
}

// ── Phase 3: verify completeness ──────────────────────────────────────

async function verifyPhase(env: Bindings, db: D1Database, task: LongTask): Promise<void> {
  const t0 = Date.now()
  const subtaskResults = (task.state.subtaskResults as string[]) ?? []
  const synthAnswer = await quickText(
    env,
    'You are a synthesis agent. Combine the subtask results below into a single, coherent final answer for the user\'s original goal. Do not invent new information.',
    `Original goal: ${task.goal}\n\nSubtask results:\n${subtaskResults.map((r, i) => `### Subtask ${i + 1}\n${r}`).join('\n\n')}\n\nFinal synthesized answer:`,
    0.4,
  )

  task.finalAnswer = synthAnswer
  task.steps.push({
    id: newId('step'),
    kind: 'answer',
    title: 'Synthesized final answer',
    detail: synthAnswer.slice(0, 800),
    at: nowIso(),
    durationMs: Date.now() - t0,
  })

  // Verify against goal
  const verification = await isTaskComplete(env, task.goal, synthAnswer)
  task.steps.push({
    id: newId('step'),
    kind: 'verification',
    title: `Verification: ${verification.complete ? 'COMPLETE' : 'INCOMPLETE'}`,
    detail: verification.missing.length ? `Missing: ${verification.missing.join('; ')}` : 'All criteria satisfied.',
    at: nowIso(),
  })

  if (verification.complete) {
    task.verified = true
    task.status = 'completed'
    task.finishedAt = nowIso()

    // Store as episodic memory in the brain
    try {
      await brainMemory.store(
        'episodic',
        `Long task COMPLETED: "${task.goal.slice(0, 200)}". Final answer: ${synthAnswer.slice(0, 600)}`,
        {
          importance: 0.85,
          source: 'long_task',
          tags: ['completed', task.strategy ?? 'unknown'],
        },
      )
    } catch { /* best-effort */ }

    await appendAudit(db, {
      workspaceId: task.workspaceId,
      actorId: task.actorId,
      action: 'long_task.completed',
      resource: 'long_task',
      resourceId: task.id,
      risk: 'low',
      metadata: { goal: task.goal.slice(0, 200) },
    })
  } else {
    task.verified = false
    task.state.missingItems = verification.missing
    task.status = 'needs_more'
    task.attempts += 1

    if (task.attempts >= task.maxAttempts) {
      task.status = 'failed'
      task.finalAnswer = `${synthAnswer}\n\n[Note: Task reached max attempts (${task.maxAttempts}) without full verification. Missing: ${verification.missing.join(', ')}]`
      task.finishedAt = nowIso()
    }
  }
}

// ── Phase 4: needs_more — close the gap and re-verify ─────────────────

async function needsMorePhase(env: Bindings, db: D1Database, task: LongTask): Promise<void> {
  const missing = (task.state.missingItems as string[]) ?? []
  if (!missing.length) {
    task.status = 'completed'
    return
  }

  const t0 = Date.now()
  // Append the gap to the plan and resume working
  for (const m of missing.slice(0, 3)) {
    task.plan.push(`Address gap: ${m}`)
  }
  task.state.currentSubtask = (task.state.currentSubtask as number) ?? 0
  task.steps.push({
    id: newId('step'),
    kind: 'plan',
    title: `Added ${Math.min(missing.length, 3)} gap-closing subtasks`,
    detail: missing.slice(0, 3).join('\n'),
    at: nowIso(),
    durationMs: Date.now() - t0,
  })
  task.status = 'working'
}

// ── Convenience helpers ────────────────────────────────────────────────

async function quickText(env: Bindings, system: string, user: string, temperature = 0.4): Promise<string> {
  if (!env.OPENAI_API_KEY && aiConfigured(env)) {
    const r = await aiChat(env, [{ role: 'system', content: system }, { role: 'user', content: user }], {})
    return r.text
  }
  return generateText(env, system, user)
}

/**
 * Drains up to N pending long tasks. Called by the cron handler on every
 * scheduled tick. Each task is advanced by one phase (plan → work on one
 * subtask → verify → done OR needs_more → work → …).
 */
export async function drainPendingLongTasks(env: Bindings, db: D1Database, maxTasks = 5): Promise<{ processed: number; completed: number; failed: number }> {
  const pending = await listPendingTasks(db, maxTasks)
  let completed = 0
  let failed = 0
  for (const task of pending) {
    try {
      // Advance by up to MAX_STEPS_PER_TICK phases per cron tick
      let cur = task
      for (let i = 0; i < MAX_STEPS_PER_TICK; i++) {
        cur = (await tickLongTask(env, db, cur.id))!
        if (!cur) break
        if (cur.status === 'completed') { completed++; break }
        if (cur.status === 'failed') { failed++; break }
        if (cur.status === 'cancelled') break
      }
    } catch (err) {
      failed++
      // best-effort: mark as failed if it keeps erroring
      try {
        const cur = await loadLongTask(db, task.id)
        if (cur && cur.attempts >= cur.maxAttempts) {
          cur.status = 'failed'
          cur.finalAnswer = `Cron tick failed repeatedly: ${err instanceof Error ? err.message : 'unknown'}`
          cur.finishedAt = nowIso()
          await persistTask(db, cur)
        }
      } catch { /* nothing more we can do */ }
    }
  }
  return { processed: pending.length, completed, failed }
}

// Re-export for tool use
export { reasonWith }
