import type { Bindings } from './types'
import { runTool } from './tools'
import { runAgent } from './agents'
import { newId, nowIso } from './ids'
import { appendAudit } from './db'

export type PipelineStepDef =
  | { id: string; type: 'tool'; toolId: string; name: string; mapInput: (ctx: PipelineContext) => Record<string, unknown> }
  | { id: string; type: 'agent'; agentKey: string; name: string; mapInput: (ctx: PipelineContext) => string }
  | { id: string; type: 'approval'; name: string; risk: 'review' | 'sensitive' }
  | { id: string; type: 'notification'; name: string; mapMessage: (ctx: PipelineContext) => string }

export type PipelineDefinition = {
  id: string
  name: string
  description: string
  steps: PipelineStepDef[]
}

export type PipelineContext = {
  input: Record<string, unknown>
  results: Record<string, unknown>
}

export type PipelineStepResult = { stepId: string; name: string; type: PipelineStepDef['type']; status: 'completed' | 'failed' | 'waiting_approval'; output?: unknown; error?: string; at: string }

export const pipelineRegistry: PipelineDefinition[] = [
  {
    id: 'file-to-task',
    name: 'File-to-Task Pipeline',
    description: 'Chunk an imported document, summarize each part, and stage a review task before creating a workspace task.',
    steps: [
      { id: 'chunk', type: 'tool', toolId: 'chunk-text', name: 'Chunk document', mapInput: (ctx) => ({ text: ctx.input.text, chunkSize: 1200 }) },
      { id: 'summarize', type: 'tool', toolId: 'summarize', name: 'Summarize document', mapInput: (ctx) => ({ text: ctx.input.text, style: 'bullets' }) },
      { id: 'review', type: 'approval', name: 'Request human review', risk: 'review' },
      { id: 'notify', type: 'notification', name: 'Notify workspace', mapMessage: (ctx) => `Document processed: ${(ctx.results.summarize as any)?.summary?.slice(0, 120) ?? 'summary ready'}` },
    ],
  },
  {
    id: 'research-brief',
    name: 'Research Brief Pipeline',
    description: 'Runs the Research Agent against a URL or topic, then produces a risk assessment of the findings before notifying the workspace.',
    steps: [
      { id: 'research', type: 'agent', agentKey: 'research', name: 'Research topic', mapInput: (ctx) => String(ctx.input.topic ?? '') },
      { id: 'risk', type: 'tool', toolId: 'risk-score', name: 'Assess findings risk', mapInput: (ctx) => ({ text: String((ctx.results.research as any)?.output ?? '') }) },
      { id: 'notify', type: 'notification', name: 'Notify workspace', mapMessage: (ctx) => `Research brief ready on "${ctx.input.topic}".` },
    ],
  },
  {
    id: 'content-review',
    name: 'Content Review Pipeline',
    description: 'Redacts PII from a piece of content, scores sentiment, and requires approval before publishing.',
    steps: [
      { id: 'redact', type: 'tool', toolId: 'redact', name: 'Redact PII', mapInput: (ctx) => ({ text: ctx.input.text }) },
      { id: 'sentiment', type: 'tool', toolId: 'sentiment', name: 'Analyze sentiment', mapInput: (ctx) => ({ text: ctx.input.text }) },
      { id: 'approval', type: 'approval', name: 'Approve for publishing', risk: 'sensitive' },
      { id: 'notify', type: 'notification', name: 'Notify workspace', mapMessage: () => 'Content approved and ready to publish.' },
    ],
  },
  {
    id: 'incident-triage',
    name: 'Incident Triage Pipeline',
    description: 'Runs the Ops Agent to score a proposed action, and gates high-risk actions behind approval automatically.',
    steps: [
      { id: 'assess', type: 'agent', agentKey: 'ops', name: 'Assess operational risk', mapInput: (ctx) => String(ctx.input.action ?? '') },
      { id: 'approval', type: 'approval', name: 'Approve high-risk action', risk: 'sensitive' },
      { id: 'notify', type: 'notification', name: 'Notify workspace', mapMessage: (ctx) => `Incident triage complete for: ${ctx.input.action}` },
    ],
  },
]

export function getPipeline(id: string): PipelineDefinition | undefined {
  return pipelineRegistry.find((p) => p.id === id)
}

/**
 * Runs a pipeline step-by-step. Stops and returns 'waiting_approval' at the first
 * unresolved approval gate — callers are expected to persist state and resume
 * (the API layer does this via the workflow_runs / approvals tables).
 */
export async function runPipeline(
  env: Bindings,
  pipeline: PipelineDefinition,
  input: Record<string, unknown>,
  runCtx: { workspaceId: string; actorId: string; db: D1Database }
): Promise<{ status: 'completed' | 'waiting_approval' | 'failed'; results: PipelineStepResult[]; context: PipelineContext }> {
  const context: PipelineContext = { input, results: {} }
  const results: PipelineStepResult[] = []

  for (const step of pipeline.steps) {
    try {
      if (step.type === 'tool') {
        const args = step.mapInput(context)
        const outcome = await runTool(step.toolId, args, { env, workspaceId: runCtx.workspaceId, actorId: runCtx.actorId, db: runCtx.db })
        if (!outcome.ok) throw new Error(outcome.error)
        context.results[step.id] = outcome.result
        results.push({ stepId: step.id, name: step.name, type: step.type, status: 'completed', output: outcome.result, at: nowIso() })
      } else if (step.type === 'agent') {
        const agentInput = step.mapInput(context)
        const outcome = await runAgent(env, step.agentKey, agentInput, { workspaceId: runCtx.workspaceId, actorId: runCtx.actorId, db: runCtx.db })
        if (outcome.status === 'failed') throw new Error(outcome.error ?? 'Agent failed.')
        context.results[step.id] = outcome
        results.push({ stepId: step.id, name: step.name, type: step.type, status: 'completed', output: outcome, at: nowIso() })
      } else if (step.type === 'approval') {
        results.push({ stepId: step.id, name: step.name, type: step.type, status: 'waiting_approval', at: nowIso() })
        await appendAudit(runCtx.db, {
          workspaceId: runCtx.workspaceId,
          actorId: runCtx.actorId,
          action: 'pipeline.approval_required',
          resource: 'pipeline',
          resourceId: pipeline.id,
          risk: step.risk === 'sensitive' ? 'high' : 'medium',
          metadata: { stepId: step.id },
        })
        return { status: 'waiting_approval', results, context }
      } else if (step.type === 'notification') {
        const messageText = step.mapMessage(context)
        context.results[step.id] = { queued: true, message: messageText }
        results.push({ stepId: step.id, name: step.name, type: step.type, status: 'completed', output: { message: messageText }, at: nowIso() })
      }
    } catch (error) {
      results.push({ stepId: step.id, name: step.name, type: step.type, status: 'failed', error: error instanceof Error ? error.message : 'Step failed.', at: nowIso() })
      return { status: 'failed', results, context }
    }
  }

  return { status: 'completed', results, context }
}
