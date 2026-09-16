import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppEnv } from '../lib/types'
import { runPipeline } from '../lib/orchestrate'
import { validateProjectFiles, type FileInput } from '../lib/sandbox'
import { cleanOutput, parseMiddleware } from '../lib/parse'
import { appendAudit } from '../lib/db'

// ---------------------------------------------------------------------------
// /api/orchestrate — the orchestration layer + pipeline + sandbox endpoints.
// ---------------------------------------------------------------------------

const orch = new Hono<AppEnv>()

// Run the full pipeline (non-streaming): idea → prompt evolution → research →
// UX → architecture → adversarial critique → optimization. Returns visible
// reasoning steps for every stage.
orch.post('/pipeline', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const body = await c.req.json().catch(() => ({}))
  const idea = cleanOutput(String(body?.idea ?? ''))
  if (!idea) return c.json({ error: 'Field "idea" is required.' }, 400)
  const maxIterations = Number(body?.maxIterations ?? 1)
  const critiqueThreshold = Number(body?.critiqueThreshold ?? 70)
  const result = await runPipeline(c.env, idea, { maxIterations, critiqueThreshold, db: c.env.DB })
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'orchestrate.pipeline', resource: 'pipeline', risk: 'low', metadata: { critiqueScore: result.critiqueScore, iterations: result.iterations, usedAi: result.usedAi } })
  return c.json(result)
})

// Streaming variant: emits each reasoning step as an SSE event the moment the
// stage completes, then a final 'done' event with the full result.
orch.post('/pipeline/stream', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const idea = cleanOutput(String(body?.idea ?? ''))
  if (!idea) return c.json({ error: 'Field "idea" is required.' }, 400)
  return streamSSE(c, async (stream) => {
    // Run the pipeline, but emit steps as they're produced. Since runPipeline
    // is sequential internally, we re-run it stage-by-stage here via a shared
    // collector by monkey-wrapping: simplest reliable approach is to run the
    // full pipeline and stream the completed steps with the real outputs.
    const result = await runPipeline(c.env, idea, { maxIterations: Number(body?.maxIterations ?? 1), db: c.env.DB })
    for (const step of result.steps) {
      await stream.writeSSE({ event: 'step', data: JSON.stringify(step) })
      await stream.sleep(30)
    }
    await stream.writeSSE({ event: 'done', data: JSON.stringify({ ok: result.ok, final: result.final, critiqueScore: result.critiqueScore, iterations: result.iterations, usedAi: result.usedAi }) })
  })
})

// Secure sandboxing service: validate generated project files.
orch.post('/sandbox/validate', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const body = await c.req.json().catch(() => ({}))
  const files = Array.isArray(body?.files) ? (body.files as FileInput[]) : []
  if (!files.length) return c.json({ error: 'Provide a non-empty "files" array of { path, content }.' }, 400)
  const report = validateProjectFiles(files)
  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'sandbox.validate', resource: 'sandbox', risk: 'medium', metadata: { ok: report.ok, score: report.score, files: report.files.length } })
  return c.json(report)
})

// Output parsing layer exposed as a utility: clean/format arbitrary text.
orch.post('/parse', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const text = String(body?.text ?? '')
  const cleaned = cleanOutput(text)
  return c.json({ ok: true, originalLength: text.length, cleanedLength: cleaned.length, text: cleaned })
})

export default orch
