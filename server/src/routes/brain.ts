import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { bindBrainDb } from '../lib/brain/db'
import { ensureBrainInitialized } from '../lib/brain/init'
import { reason } from '../lib/brain/reasoning'
import { memory } from '../lib/brain/memory'
import { skills } from '../lib/brain/skills'
import { knowledge } from '../lib/brain/knowledge'
import { submitUserTask, runTrainingSession } from '../lib/brain/training'
import { snapshot, recentCognitions, getCycle, getStatus, getCapabilities, periodicReflection } from '../lib/brain/core'
import type { TaskCategory } from '../lib/brain/types'

// ---------------------------------------------------------------------------
// /api/brain — the ported brain-project cognitive engine, persisted to D1.
// A self-improving reasoning engine: observe → reason → plan → act → verify →
// reflect → learn, with persistent memory, a learning skill store, a knowledge
// base, reflections, training runs, and capability metrics.
// ---------------------------------------------------------------------------

const brain = new Hono<AppEnv>()

const CATEGORIES: TaskCategory[] = ['logic', 'math', 'language', 'planning', 'creative', 'coding', 'reasoning']

// Bind D1 + ensure the brain is seeded before any endpoint runs.
brain.use('*', async (c, next) => {
  bindBrainDb(c.env.DB)
  await ensureBrainInitialized()
  await next()
})

// Health / status snapshot: cycle, status, capabilities, counts.
brain.get('/status', async (c) => {
  const snap = await snapshot()
  return c.json({ ...snap, cycle: getCycle(), status: getStatus(), capabilities: getCapabilities() })
})

// Direct reasoning on an input. No task persisted — pure inference.
// Body: { category, input, hints? }
brain.post('/reason', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const category = String(body?.category ?? 'reasoning') as TaskCategory
  if (!CATEGORIES.includes(category)) return c.json({ error: `Unknown category: ${category}. Valid: ${CATEGORIES.join(', ')}` }, 400)
  const hints = Array.isArray(body?.hints) ? body.hints.map(String) : []
  try {
    const result = reason(category, body?.input, hints)
    return c.json({ ok: true, category, ...result })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Reasoning failed' }, 400)
  }
})

// Submit a task for the full cognitive loop (observe→reason→plan→act→verify→
// reflect→learn). The brain learns from the outcome (skill store + capabilities).
// Body: { title, description?, category, difficulty?, input, expected? }
brain.post('/solve', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const title = String(body?.title ?? '').trim()
  const category = String(body?.category ?? 'reasoning') as TaskCategory
  if (!title) return c.json({ error: 'Field "title" is required.' }, 400)
  if (!CATEGORIES.includes(category)) return c.json({ error: `Unknown category: ${category}.` }, 400)
  const difficulty = Math.min(Math.max(Number(body?.difficulty ?? 3) || 3, 1), 10)
  try {
    const result = await submitUserTask(title, String(body?.description ?? ''), category, difficulty, body?.input ?? null, body?.expected ?? null)
    return c.json({ ok: true, workspaceId, ...result })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Solve failed' }, 400)
  }
})

// Run a self-training session: the brain generates & solves its own tasks and
// improves. Body: { name?, taskCount?, categories?, difficulty? }
brain.post('/train', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const rounds = Math.min(Math.max(Number(body?.rounds ?? body?.taskCount ?? 2) || 2, 1), 20)
  const categories = (Array.isArray(body?.categories) ? body.categories : CATEGORIES).filter((x: string) => CATEGORIES.includes(x as TaskCategory)) as TaskCategory[]
  const difficultyStart = Math.min(Math.max(Number(body?.difficultyStart ?? 1) || 1, 1), 10)
  const difficultyEnd = Math.min(Math.max(Number(body?.difficultyEnd ?? body?.difficulty ?? 5) || 5, difficultyStart), 10)
  try {
    const result = await runTrainingSession({ rounds, categories, difficultyStart, difficultyEnd, seed: typeof body?.seed === 'number' ? body.seed : undefined })
    return c.json({ ok: true, ...result })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Training failed' }, 400)
  }
})

// Memory: store / recall / recent / count.
brain.post('/memory', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const kind = String(body?.kind ?? 'semantic')
  const content = String(body?.content ?? '').trim()
  if (!content) return c.json({ error: 'Field "content" is required.' }, 400)
  const rec = await memory.store(kind as any, content, { importance: Number(body?.importance ?? 0.5), source: body?.source ? String(body.source) : 'user', tags: Array.isArray(body?.tags) ? body.tags.map(String) : undefined })
  return c.json({ ok: true, memory: rec }, 201)
})
brain.get('/memory/recall', async (c) => {
  const q = c.req.query('q') ?? ''
  const limit = Math.min(Number(c.req.query('limit') ?? 5) || 5, 50)
  const results = await memory.recall(q, undefined, limit)
  return c.json({ query: q, count: results.length, results })
})
brain.get('/memory/recent', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 10) || 10, 100)
  const results = await memory.recent(limit)
  return c.json({ count: results.length, results })
})

// Skills: list / search.
brain.get('/skills', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
  const all = await skills.all(limit)
  return c.json({ count: all.length, mastered: await skills.masteredCount(), total: await skills.count(), skills: all })
})

// Knowledge: assert a fact / search.
brain.post('/knowledge', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const subject = String(body?.subject ?? '').trim()
  const predicate = String(body?.predicate ?? '').trim()
  const object = String(body?.object ?? '').trim()
  if (!subject || !predicate || !object) return c.json({ error: 'Provide subject, predicate, and object.' }, 400)
  const fact = await knowledge.assert(subject, predicate, object, Number(body?.confidence ?? 0.7), body?.source ? String(body.source) : 'user')
  return c.json({ ok: true, fact }, 201)
})
brain.get('/knowledge/search', async (c) => {
  const q = c.req.query('q') ?? ''
  const limit = Math.min(Number(c.req.query('limit') ?? 5) || 5, 50)
  const results = await knowledge.search(q, limit)
  return c.json({ query: q, count: results.length, results, total: await knowledge.count() })
})

// Cognitions (the brain's chain-of-thought log).
brain.get('/cognitions', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 100)
  const results = await recentCognitions(limit)
  return c.json({ count: results.length, cognitions: results })
})

// Trigger a periodic self-reflection across recent tasks.
brain.post('/reflect', async (c) => {
  const reflection = await periodicReflection()
  return c.json({ ok: true, reflection })
})

export default brain
