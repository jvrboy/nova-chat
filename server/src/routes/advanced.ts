/**
 * /api/advanced — Advanced reasoning endpoints
 * ──────────────────────────────────────────────
 * Exposes the new reasoning engine + long-task engine + brain integration
 * as REST endpoints. Designed to be the "power-user" surface, complementing
 * the existing /api/chats routes (which remain for backward compat).
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import {
  runAdvancedChat, ChatEvent, ChatMode,
} from '../lib/chatEngine'
import {
  createLongTask, loadLongTask, listLongTasks, tickLongTask, cancelLongTask,
  drainPendingLongTasks,
} from '../lib/longTask'
import { pickStrategy, StrategyId } from '../lib/reasoning'
import { runTrainingSession } from '../lib/brain/training'
import { bindBrainDb } from '../lib/brain/db'
import { ensureBrainInitialized } from '../lib/brain/init'
import { periodicReflection, getCapabilities, getCycle, snapshot } from '../lib/brain/core'

const advanced = new Hono<AppEnv>()

// ── /reason — one-shot reasoning (no persistence) ─────────────────────

advanced.post('/reason', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const query = String(body?.query ?? '').trim()
  if (!query) return c.json({ error: 'Field "query" is required.' }, 400)

  const choice = pickStrategy(query)
  return c.json({
    query,
    recommendedStrategy: choice.strategy,
    reason: choice.reason,
    strategies: ['direct', 'react', 'tree_of_thought', 'plan_execute', 'self_critique', 'multi_debate', 'reflect_refine'],
  })
})

// ── /chat — non-streaming advanced chat ───────────────────────────────

advanced.post('/chat/:chatId', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const chatId = c.req.param('chatId')
  const body = await c.req.json().catch(() => ({}))
  const text = String(body?.text ?? '').trim()
  if (!text) return c.json({ error: 'Field "text" is required.' }, 400)

  const mode = (body?.mode === 'fast' || body?.mode === 'balanced' || body?.mode === 'ultra' ? body.mode : 'balanced') as ChatMode
  const strategy = body?.strategy as StrategyId | undefined

  // Verify chat ownership
  const chatRow = await c.env.DB.prepare('SELECT id FROM chats WHERE id = ? AND workspace_id = ?').bind(chatId, workspaceId).first()
  if (!chatRow) return c.json({ error: 'Chat not found in workspace.' }, 404)

  const result = await runAdvancedChat(c.env, c.env.DB, {
    text, chatId, workspaceId, actorId, mode, strategy,
  })
  return c.json(result)
})

// ── /chat/:chatId/stream — SSE streaming advanced chat ────────────────

advanced.post('/chat/:chatId/stream', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const chatId = c.req.param('chatId')
  const body = await c.req.json().catch(() => ({}))
  const text = String(body?.text ?? '').trim()
  if (!text) return c.json({ error: 'Field "text" is required.' }, 400)

  const chatRow = await c.env.DB.prepare('SELECT id FROM chats WHERE id = ? AND workspace_id = ?').bind(chatId, workspaceId).first()
  if (!chatRow) return c.json({ error: 'Chat not found in workspace.' }, 404)

  const mode = (body?.mode === 'fast' || body?.mode === 'balanced' || body?.mode === 'ultra' ? body.mode : 'balanced') as ChatMode
  const strategy = body?.strategy as StrategyId | undefined

  return streamSSE(c, async (stream) => {
    try {
      const result = await runAdvancedChat(c.env, c.env.DB, {
        text, chatId, workspaceId, actorId, mode, strategy,
        onEvent: async (event: ChatEvent) => {
          const eventType = event.type
          await stream.writeSSE({ event: eventType, data: JSON.stringify(event) })
        },
      })
      await stream.writeSSE({ event: 'result', data: JSON.stringify(result) })
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: err instanceof Error ? err.message : 'unknown error', at: nowIso() }),
      })
    }
  })
})

// ── /tasks — Long-running persistent tasks ─────────────────────────────

advanced.post('/tasks', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const body = await c.req.json().catch(() => ({}))
  const goal = String(body?.goal ?? '').trim()
  if (!goal) return c.json({ error: 'Field "goal" is required.' }, 400)
  const maxAttempts = body?.maxAttempts ? Math.min(Math.max(Number(body.maxAttempts) || 6, 1), 20) : 6

  const task = await createLongTask(c.env.DB, { workspaceId, actorId, goal, maxAttempts })

  // Optionally kick off the first tick synchronously (best-effort, doesn't block)
  if (body?.startImmediately !== false) {
    try {
      await tickLongTask(c.env, c.env.DB, task.id)
    } catch { /* cron will pick it up */ }
  }

  const fresh = await loadLongTask(c.env.DB, task.id)
  return c.json(fresh, 201)
})

advanced.get('/tasks', async (c) => {
  const workspaceId = c.get('workspaceId')
  const status = c.req.query('status') as any
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
  const tasks = await listLongTasks(c.env.DB, workspaceId, { status, limit })
  return c.json({ count: tasks.length, tasks })
})

advanced.get('/tasks/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const task = await loadLongTask(c.env.DB, c.req.param('id'))
  if (!task || task.workspaceId !== workspaceId) return c.json({ error: 'Task not found.' }, 404)
  return c.json(task)
})

advanced.post('/tasks/:id/tick', async (c) => {
  const workspaceId = c.get('workspaceId')
  const task = await loadLongTask(c.env.DB, c.req.param('id'))
  if (!task || task.workspaceId !== workspaceId) return c.json({ error: 'Task not found.' }, 404)
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    return c.json(task)
  }
  const updated = await tickLongTask(c.env, c.env.DB, task.id)
  return c.json(updated)
})

advanced.post('/tasks/:id/cancel', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const updated = await cancelLongTask(c.env.DB, c.req.param('id'), workspaceId, actorId)
  if (!updated) return c.json({ error: 'Task not found.' }, 404)
  return c.json(updated)
})

// ── /tasks/:id/stream — SSE: keep pushing ticks until done ─────────────

advanced.post('/tasks/:id/stream', async (c) => {
  const workspaceId = c.get('workspaceId')
  const task = await loadLongTask(c.env.DB, c.req.param('id'))
  if (!task || task.workspaceId !== workspaceId) return c.json({ error: 'Task not found.' }, 404)

  return streamSSE(c, async (stream) => {
    let current = task
    let tickCount = 0
    const maxTicks = 30 // safety bound
    while (tickCount < maxTicks) {
      tickCount++
      await stream.writeSSE({ event: 'tick_start', data: JSON.stringify({ tick: tickCount, status: current.status, at: nowIso() }) })
      try {
        current = (await tickLongTask(c.env, c.env.DB, current.id))!
        if (!current) break
        await stream.writeSSE({ event: 'task', data: JSON.stringify(current) })
        if (current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') break
        // small delay between ticks
        await new Promise((r) => setTimeout(r, 200))
      } catch (err) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: err instanceof Error ? err.message : 'unknown' }) })
        break
      }
    }
    await stream.writeSSE({ event: 'done', data: JSON.stringify({ ticks: tickCount, finalStatus: current?.status }) })
  })
})

// ── /train — Run a training session (continuous learning) ──────────────

advanced.post('/train', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const rounds = Math.min(Math.max(Number(body?.rounds ?? 2) || 2, 1), 20)
  const difficultyStart = Math.min(Math.max(Number(body?.difficultyStart ?? 1) || 1, 1), 10)
  const difficultyEnd = Math.min(Math.max(Number(body?.difficultyEnd ?? 5) || 5, difficultyStart), 10)

  bindBrainDb(c.env.DB)
  await ensureBrainInitialized()

  try {
    const result = await runTrainingSession({
      rounds,
      categories: ['logic', 'math', 'language', 'planning', 'creative', 'coding', 'reasoning'],
      difficultyStart,
      difficultyEnd,
      seed: typeof body?.seed === 'number' ? body.seed : undefined,
    })
    return c.json({ ok: true, ...result })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Training failed' }, 500)
  }
})

// ── /reflect — Trigger a periodic reflection ───────────────────────────

advanced.post('/reflect', async (c) => {
  bindBrainDb(c.env.DB)
  await ensureBrainInitialized()
  const reflection = await periodicReflection()
  return c.json({ ok: true, reflection, capabilities: getCapabilities(), cycle: getCycle() })
})

// ── /capabilities — current brain capability map ───────────────────────

advanced.get('/capabilities', async (c) => {
  bindBrainDb(c.env.DB)
  await ensureBrainInitialized()
  const snap = await snapshot()
  return c.json({
    capabilities: getCapabilities(),
    cycle: getCycle(),
    status: snap.status,
    memoryCount: snap.memoryCount,
    skillCount: snap.skillCount,
    totalTasks: snap.totalTasks,
    successRate: snap.successRate,
    uptime: snap.uptime,
  })
})

export default advanced
