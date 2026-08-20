import type { Bindings } from './types'
import { chatComplete, LlmMessage, LlmToolSpec } from './llm'
import { runTool, toolAsLlmSpec, toolRegistry, ToolDefinition } from './tools'
import { newId, nowIso } from './ids'
import { appendAudit } from './db'

export type AgentStep = {
  type: 'assistant_message' | 'tool_call' | 'tool_result' | 'approval_required'
  content?: string
  toolId?: string
  input?: Record<string, unknown>
  output?: unknown
  at: string
}

export type AgentDefinition = {
  key: string
  name: string
  description: string
  systemPrompt: string
  allowedToolIds: string[] | 'all'
  maxSteps: number
  /** Agent keys this agent is allowed to hand off (delegate) sub-tasks to. Used
   * by the planner for real multi-agent orchestration instead of one-shot calls. */
  canDelegateTo?: string[]
}

function toolsFor(agent: AgentDefinition): ToolDefinition[] {
  if (agent.allowedToolIds === 'all') return toolRegistry
  return toolRegistry.filter((t) => agent.allowedToolIds.includes(t.id))
}

export const agentRegistry: AgentDefinition[] = [
  {
    key: 'planner',
    name: 'Planner Agent',
    description: 'Breaks a goal into a concrete plan of milestones, tasks, and risks. Can delegate sub-tasks to specialist agents (research, coder, writer, analyst) via the delegate-to-agent tool.',
    systemPrompt:
      'You are Nova\'s Planner Agent, an orchestrator. Given a goal, produce a structured plan: milestones, first tasks, key risks, and a single clear next action. ' +
      'You have a special "delegate-to-agent" tool that hands a sub-task to another specialist agent (research, coder, writer, analyst, datasci, integrations) and returns their output — use it when a step genuinely needs that specialist\'s tools (e.g. delegate research questions to the research agent instead of guessing, or dataset work to datasci). ' +
      'Use date-math for scheduling and chunk-text for long inputs directly. Be concise and concrete. When you are done, give your final answer as plain text, incorporating any delegated results — do not keep calling tools once you have enough information.',
    allowedToolIds: ['date-math', 'chunk-text', 'risk-score', 'word-count', 'schedule-parse'],
    canDelegateTo: ['research', 'coder', 'writer', 'analyst', 'datasci', 'integrations'],
    maxSteps: 8,
  },
  {
    key: 'research',
    name: 'Research Agent',
    description: 'Fetches and synthesizes information from public web pages.',
    systemPrompt:
      'You are Nova\'s Research Agent. You can fetch public HTTPS pages with web-fetch or web-search-summary and summarize what you find. Always cite the URL(s) you used. If a fetch fails, say so plainly rather than inventing content. Keep the final answer under 300 words.',
    allowedToolIds: ['web-fetch', 'web-search-summary', 'summarize', 'chunk-text', 'entity-extract'],
    maxSteps: 6,
  },
  {
    key: 'coder',
    name: 'Coder Agent',
    description: 'Writes, explains, reviews, and now actually EXECUTES code in a real isolated sandbox (via E2B) to verify it works before reporting results.',
    systemPrompt:
      'You are Nova\'s Coder Agent. You write, explain, and review code, suggest fixes, and reason about correctness and security. ' +
      'You have a real code-execute tool backed by an isolated E2B cloud sandbox — when a user asks you to run/test/verify code, or when verifying your own generated snippet would materially increase confidence, actually call code-execute and report the real stdout/stderr/results, rather than just guessing what it would output. code-execute is sensitive and requires approval before it runs. ' +
      'Use code-explain for structured static walkthroughs and code-generate to draft small snippets before executing them.',
    allowedToolIds: ['code-explain', 'code-generate', 'code-execute', 'hash', 'json-format', 'diff-text', 'regex-extract'],
    maxSteps: 6,
  },
  {
    key: 'ops',
    name: 'Ops Agent',
    description: 'Assesses operational risk of a proposed action and recommends whether it needs human approval.',
    systemPrompt:
      'You are Nova\'s Ops Agent. Given a description of a proposed action (e.g. a workflow step or automation), use risk-score to assess it, then give a short recommendation: proceed, proceed with approval, or block. Always explain the flags that drove your recommendation.',
    allowedToolIds: ['risk-score', 'redact'],
    maxSteps: 4,
  },
  {
    key: 'writer',
    name: 'Writer Agent',
    description: 'Drafts and refines written content: summaries, translations, tone adjustments.',
    systemPrompt:
      'You are Nova\'s Writer Agent. You draft, summarize, translate, and refine written content clearly and concisely. Use the summarize/translate/sentiment tools when they would improve accuracy, otherwise just write directly.',
    allowedToolIds: ['summarize', 'translate', 'sentiment', 'word-count'],
    maxSteps: 5,
  },
  {
    key: 'analyst',
    name: 'Analyst Agent',
    description: 'Analyzes structured/semi-structured data (CSV, JSON), classifies and extracts entities, and reports findings.',
    systemPrompt:
      'You are Nova\'s Analyst Agent. You work with structured and semi-structured data: parsing CSV, validating/formatting JSON, extracting entities, classifying items into categories, and doing unit conversions. Report findings clearly with concrete numbers, never vague generalities.',
    allowedToolIds: ['csv-to-json', 'json-format', 'entity-extract', 'classify', 'unit-convert', 'calculator'],
    maxSteps: 6,
  },
  {
    key: 'datasci',
    name: 'Data Science Agent',
    description: 'Finds real-world datasets on Kaggle, downloads and parses them, and runs real Python/R analysis code on them in an isolated sandbox — a full find-data-then-analyze-it loop.',
    systemPrompt:
      'You are Nova\'s Data Science Agent. Given a topic or question, you: (1) search Kaggle for a relevant public dataset with kaggle-dataset-search, (2) inspect it with kaggle-dataset-info if useful, (3) download and extract it with kaggle-dataset-download, (4) parse the extracted CSV with csv-to-json if needed, and (5) actually RUN real analysis code (pandas/numpy/stats) in the sandbox with code-execute to compute real numbers — never fabricate statistics. code-execute and kaggle-dataset-download are sensitive/review-risk and will need approval; explain clearly what you are about to run and why. Report concrete findings with real computed numbers, and cite the dataset ref you used.',
    allowedToolIds: ['kaggle-dataset-search', 'kaggle-dataset-info', 'kaggle-dataset-download', 'kaggle-kernel-search', 'csv-to-json', 'code-execute', 'calculator', 'unit-convert'],
    maxSteps: 8,
  },
  {
    key: 'integrations',
    name: 'Integrations Agent',
    description: 'Manages data stored in the user\'s own connected third-party accounts (Supabase project tables) and reports on which providers are configured.',
    systemPrompt:
      'You are Nova\'s Integrations Agent. You read and write data in the user\'s own Supabase project tables via supabase-query/supabase-write/supabase-delete (PostgREST — respects whatever tables and RLS policies already exist there; you cannot create tables). Use provider-status first if you are unsure whether Supabase/Kaggle/E2B are configured at all, so you can give an accurate answer instead of guessing. supabase-write and supabase-delete are sensitive and require approval — always explain exactly what will change before those run.',
    allowedToolIds: ['supabase-query', 'supabase-write', 'supabase-delete', 'provider-status', 'json-format'],
    maxSteps: 6,
  },
  {
    key: 'support',
    name: 'Support Agent',
    description: 'Handles user-facing help requests: answers questions about the app, drafts responses, and escalates risky requests for approval.',
    systemPrompt:
      'You are Nova\'s Support Agent, acting as a first line of help for app users. Answer questions clearly and kindly. If a request looks risky (e.g. touches credentials, destructive actions, or production systems), use risk-score to check it and recommend escalation rather than acting on it yourself. Use redact before repeating any user-supplied text back that might contain PII.',
    allowedToolIds: ['risk-score', 'redact', 'summarize', 'sentiment'],
    maxSteps: 5,
  },
  {
    key: 'guardian',
    name: 'Guardian Agent',
    description: 'Security/compliance reviewer: scans content or proposed actions for PII exposure, credential leakage, and destructive-operation risk before they proceed.',
    systemPrompt:
      'You are Nova\'s Guardian Agent, a security and compliance reviewer. Given a piece of content or a proposed action, use redact to find PII/secrets and risk-score to assess operational danger. Give a clear verdict: SAFE, NEEDS_REVIEW, or BLOCK, with the specific reasons. Be conservative — when in doubt, recommend review rather than approving.',
    allowedToolIds: ['redact', 'risk-score', 'hash'],
    maxSteps: 4,
  },
]

export function getAgent(key: string): AgentDefinition | undefined {
  return agentRegistry.find((a) => a.key === key)
}

export type AgentRunResult = {
  runId: string
  agentKey: string
  status: 'completed' | 'waiting_approval' | 'failed'
  steps: AgentStep[]
  output?: string
  error?: string
}

/**
 * Runs an agent to completion (or until it needs human approval / hits maxSteps),
 * using a real tool-calling loop against the LLM.
 */
export async function runAgent(
  env: Bindings,
  agentKey: string,
  input: string,
  ctx: { workspaceId: string; actorId: string; db: D1Database }
): Promise<AgentRunResult> {
  const agent = getAgent(agentKey)
  if (!agent) return { runId: newId('run'), agentKey, status: 'failed', steps: [], error: `Unknown agent: ${agentKey}` }

  const runId = newId('run')
  const tools = toolsFor(agent)
  const toolSpecs: LlmToolSpec[] = tools.map(toolAsLlmSpec)
  const delegateTargets = agent.canDelegateTo ?? []
  if (delegateTargets.length) {
    toolSpecs.push({
      type: 'function',
      function: {
        name: 'delegate-to-agent',
        description: `Hand off a sub-task to a specialist agent and get their result back. Available agents: ${delegateTargets.join(', ')}.`,
        parameters: {
          type: 'object',
          properties: {
            agent: { type: 'string', enum: delegateTargets },
            task: { type: 'string', description: 'The specific sub-task to delegate, phrased as a self-contained instruction.' },
          },
          required: ['agent', 'task'],
        },
      },
    })
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: agent.systemPrompt },
    { role: 'user', content: input },
  ]
  const steps: AgentStep[] = []
  let delegationDepth = 0

  for (let i = 0; i < agent.maxSteps; i++) {
    let completion
    try {
      completion = await chatComplete(env, { messages, tools: toolSpecs, toolChoice: 'auto', temperature: 0.3 })
    } catch (error) {
      return { runId, agentKey, status: 'failed', steps, error: error instanceof Error ? error.message : 'LLM call failed.' }
    }
    const { message } = completion
    messages.push(message)

    if (message.tool_calls?.length) {
      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(call.function.arguments || '{}') } catch { /* leave empty */ }

        // Multi-agent handoff: the planner (or any agent with canDelegateTo) can
        // route a sub-task to a specialist agent and fold their answer back in.
        if (call.function.name === 'delegate-to-agent' && delegationDepth < 3) {
          delegationDepth += 1
          const targetAgent = String(args.agent ?? '')
          const task = String(args.task ?? '')
          const childRunId = newId('run')
          steps.push({ type: 'tool_call', toolId: 'delegate-to-agent', input: { agent: targetAgent, task }, at: nowIso() })

          let delegateResult: AgentRunResult
          if (!delegateTargets.includes(targetAgent)) {
            delegateResult = { runId: childRunId, agentKey: targetAgent, status: 'failed', steps: [], error: `Agent "${targetAgent}" is not a valid delegation target.` }
          } else {
            delegateResult = await runAgent(env, targetAgent, task, ctx)
          }

          await env.DB.prepare(
            'INSERT INTO agent_delegations (id, workspace_id, parent_run_id, child_run_id, from_agent, to_agent, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(newId('deleg'), ctx.workspaceId, runId, delegateResult.runId, agentKey, targetAgent, task, nowIso()).run().catch(() => {})

          const summary = delegateResult.status === 'completed'
            ? delegateResult.output ?? ''
            : `Delegation to ${targetAgent} did not complete (status: ${delegateResult.status}${delegateResult.error ? `, error: ${delegateResult.error}` : ''}).`

          steps.push({ type: 'tool_result', toolId: 'delegate-to-agent', output: { agent: targetAgent, runId: delegateResult.runId, status: delegateResult.status, output: summary }, at: nowIso() })
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ agent: targetAgent, status: delegateResult.status, result: summary }), name: 'delegate-to-agent' })
          continue
        }

        const tool = tools.find((t) => t.id === call.function.name)
        if (tool && tool.risk === 'sensitive') {
          steps.push({ type: 'approval_required', toolId: tool.id, input: args, at: nowIso() })
          await appendAudit(ctx.db, {
            workspaceId: ctx.workspaceId,
            actorId: ctx.actorId,
            action: 'agent.approval_required',
            resource: 'agent_run',
            resourceId: runId,
            risk: 'high',
            metadata: { agentKey, toolId: tool.id },
          })
          return { runId, agentKey, status: 'waiting_approval', steps }
        }

        steps.push({ type: 'tool_call', toolId: call.function.name, input: args, at: nowIso() })
        const result = await runTool(call.function.name, args, { env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db })
        steps.push({ type: 'tool_result', toolId: call.function.name, output: result, at: nowIso() })
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result), name: call.function.name })
      }
      continue // let the model see tool results and decide next step
    }

    // No tool calls: this is the final answer.
    const content = typeof message.content === 'string' ? message.content : ''
    steps.push({ type: 'assistant_message', content, at: nowIso() })
    await appendAudit(ctx.db, {
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      action: 'agent.completed',
      resource: 'agent_run',
      resourceId: runId,
      risk: 'low',
      metadata: { agentKey, steps: steps.length },
    })
    return { runId, agentKey, status: 'completed', steps, output: content }
  }

  return { runId, agentKey, status: 'completed', steps, output: 'Agent reached its step limit before finishing. Try a narrower request.' }
}
