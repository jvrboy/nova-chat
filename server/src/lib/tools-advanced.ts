/**
 * Advanced reasoning tools — registered into the tool registry so the
 * chat loop can call them like any other tool. Each tool wraps a strategy
 * from the reasoning engine.
 */

import type { ToolDefinition, ToolContext } from './tools'
import { reasonWith, pickStrategy, type StrategyId } from './reasoning'
import { createLongTask, loadLongTask, tickLongTask, listLongTasks } from './longTask'
import { generateText } from './llm'
import { aiConfigured, aiChat } from './ai'

function needString(input: Record<string, unknown>, key: string): string {
  const v = input[key]
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing required string field "${key}".`)
  return v
}

function needArray<T = unknown>(input: Record<string, unknown>, key: string): T[] {
  const v = input[key]
  if (!Array.isArray(v)) throw new Error(`Field "${key}" must be an array.`)
  return v as T[]
}

async function quickText(env: any, system: string, user: string, temperature = 0.4): Promise<string> {
  if (!env.OPENAI_API_KEY && aiConfigured(env)) {
    const r = await aiChat(env, [{ role: 'system', content: system }, { role: 'user', content: user }], {})
    return r.text
  }
  return generateText(env, system, user)
}

// ── Tool: reason-react ───────────────────────────────────────────────

const reasonReactTool: ToolDefinition = {
  id: 'reason-react',
  name: 'ReAct Reasoner',
  description: 'Run a multi-step ReAct (Reason+Act+Observe) loop on a question. Each iteration: think → call a tool if helpful → observe → repeat. Best for research-style queries.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question to reason about.' },
      history: { type: 'array', items: { type: 'object' }, description: 'Prior conversation messages (optional).' },
    },
    required: ['query'],
  },
  run: async (input, ctx: ToolContext) => {
    const query = needString(input, 'query')
    const history = (needArray(input, 'history') || []) as any[]
    const trace = await reasonWith(query, history.map((h) => ({ role: h.role ?? 'user', content: h.content ?? '' })), {
      env: ctx.env,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      db: ctx.db,
      maxIterations: 6,
    }, 'react')
    return {
      strategy: trace.strategy,
      answer: trace.finalAnswer,
      steps: trace.steps.length,
      toolCalls: trace.toolCalls,
      confidence: trace.confidence,
      durationMs: trace.durationMs,
      trace: trace.steps.slice(0, 20),
    }
  },
}

// ── Tool: tree-of-thought ────────────────────────────────────────────

const treeOfThoughtTool: ToolDefinition = {
  id: 'tree-of-thought',
  name: 'Tree-of-Thought Explorer',
  description: 'Branch into 3 candidate reasoning paths, score each, and pick the best. Ideal for complex problems with multiple valid solution strategies.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The problem to solve.' },
      branches: { type: 'number', description: 'Number of branches (default 3, max 5).' },
    },
    required: ['query'],
  },
  run: async (input, ctx: ToolContext) => {
    const query = needString(input, 'query')
    const trace = await reasonWith(query, [], {
      env: ctx.env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db, maxIterations: 3,
    }, 'tree_of_thought')
    return {
      strategy: trace.strategy,
      answer: trace.finalAnswer,
      confidence: trace.confidence,
      branchesExplored: trace.iterations,
      trace: trace.steps.slice(0, 15),
    }
  },
}

// ── Tool: plan-execute ───────────────────────────────────────────────

const planExecuteTool: ToolDefinition = {
  id: 'plan-execute',
  name: 'Plan-and-Execute',
  description: 'Decompose a complex goal into 2-5 subtasks, execute each in sequence, then synthesize a final answer. Best for multi-step requests.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The goal to decompose.' },
    },
    required: ['goal'],
  },
  run: async (input, ctx: ToolContext) => {
    const goal = needString(input, 'goal')
    const trace = await reasonWith(goal, [], {
      env: ctx.env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db, maxIterations: 5,
    }, 'plan_execute')
    return {
      strategy: trace.strategy,
      answer: trace.finalAnswer,
      subtasksExecuted: trace.iterations,
      toolCalls: trace.toolCalls,
      confidence: trace.confidence,
      trace: trace.steps.slice(0, 20),
    }
  },
}

// ── Tool: self-critique ──────────────────────────────────────────────

const selfCritiqueTool: ToolDefinition = {
  id: 'self-critique',
  name: 'Self-Critique Refiner',
  description: 'Generate an answer, have an adversarial critic find flaws, then revise. Iterates up to 3 rounds. Best for high-stakes writing, analysis, or factual claims.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question to answer well.' },
    },
    required: ['query'],
  },
  run: async (input, ctx: ToolContext) => {
    const query = needString(input, 'query')
    const trace = await reasonWith(query, [], {
      env: ctx.env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db, maxIterations: 3,
    }, 'self_critique')
    return {
      strategy: trace.strategy,
      answer: trace.finalAnswer,
      iterations: trace.iterations,
      confidence: trace.confidence,
      critiques: trace.steps.filter((s) => s.kind === 'critique').length,
      trace: trace.steps.slice(0, 15),
    }
  },
}

// ── Tool: multi-debate ───────────────────────────────────────────────

const multiDebateTool: ToolDefinition = {
  id: 'multi-debate',
  name: 'Multi-Agent Debate',
  description: 'Convene 3 agents (Analyst, Skeptic, Synthesizer) to debate a question, then synthesize a balanced answer. Best for controversial/comparative questions.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to debate.' },
    },
    required: ['question'],
  },
  run: async (input, ctx: ToolContext) => {
    const question = needString(input, 'question')
    const trace = await reasonWith(question, [], {
      env: ctx.env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db, maxIterations: 3,
    }, 'multi_debate')
    return {
      strategy: trace.strategy,
      answer: trace.finalAnswer,
      agentsConsulted: 3,
      rounds: trace.iterations,
      confidence: trace.confidence,
      trace: trace.steps.slice(0, 15),
    }
  },
}

// ── Tool: long-task-start ────────────────────────────────────────────

const longTaskStartTool: ToolDefinition = {
  id: 'long-task-start',
  name: 'Start Long Task',
  description: 'Start a persistent background task that keeps working on a goal across multiple ticks until it is verified complete. Use for complex multi-step requests that might exceed a single chat turn. Returns the task ID — poll /api/advanced/tasks/:id for status.',
  category: 'Ops',
  risk: 'review',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The goal the task should achieve.' },
      maxAttempts: { type: 'number', description: 'Max retry attempts (default 6, max 20).' },
    },
    required: ['goal'],
  },
  run: async (input, ctx: ToolContext) => {
    if (!ctx.db) throw new Error('long-task-start requires a database binding')
    const goal = needString(input, 'goal')
    const maxAttempts = input.maxAttempts ? Math.min(Math.max(Number(input.maxAttempts) || 6, 1), 20) : 6
    const task = await createLongTask(ctx.db, { workspaceId: ctx.workspaceId, actorId: ctx.actorId, goal, maxAttempts })
    // Kick off the first tick synchronously (plan phase)
    await tickLongTask(ctx.env, ctx.db, task.id).catch(() => {})
    const fresh = await loadLongTask(ctx.db, task.id)
    return { taskId: task.id, status: fresh?.status ?? 'pending', plan: fresh?.plan ?? [] }
  },
}

// ── Tool: long-task-status ───────────────────────────────────────────

const longTaskStatusTool: ToolDefinition = {
  id: 'long-task-status',
  name: 'Long Task Status',
  description: 'Check the status of a long-running task. Returns its current state, steps so far, and final answer if completed.',
  category: 'Ops',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID returned by long-task-start.' },
    },
    required: ['taskId'],
  },
  run: async (input, ctx: ToolContext) => {
    if (!ctx.db) throw new Error('long-task-status requires a database binding')
    const taskId = needString(input, 'taskId')
    const task = await loadLongTask(ctx.db, taskId)
    if (!task || task.workspaceId !== ctx.workspaceId) throw new Error('Task not found.')
    return {
      id: task.id,
      status: task.status,
      attempts: task.attempts,
      maxAttempts: task.maxAttempts,
      verified: task.verified,
      plan: task.plan,
      stepsCount: task.steps.length,
      finalAnswer: task.finalAnswer,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      finishedAt: task.finishedAt,
      recentSteps: task.steps.slice(-5),
    }
  },
}

// ── Tool: long-task-list ─────────────────────────────────────────────

const longTaskListTool: ToolDefinition = {
  id: 'long-task-list',
  name: 'List Long Tasks',
  description: 'List long-running tasks in the workspace, optionally filtered by status.',
  category: 'Ops',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status: pending, planning, working, verifying, needs_more, completed, failed.' },
      limit: { type: 'number', description: 'Max tasks to return (default 20).' },
    },
  },
  run: async (input, ctx: ToolContext) => {
    if (!ctx.db) throw new Error('long-task-list requires a database binding')
    const status = typeof input.status === 'string' ? input.status as any : undefined
    const limit = input.limit ? Math.min(Number(input.limit) || 20, 200) : 20
    const tasks = await listLongTasks(ctx.db, ctx.workspaceId, { status, limit })
    return {
      count: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id, goal: t.goal, status: t.status, attempts: t.attempts,
        verified: t.verified, updatedAt: t.updatedAt, finishedAt: t.finishedAt,
      })),
    }
  },
}

// ── Tool: code-review ────────────────────────────────────────────────

const codeReviewTool: ToolDefinition = {
  id: 'code-review',
  name: 'Code Reviewer',
  description: 'Adversarial code review: scans code for security issues, performance bugs, anti-patterns, and best-practice violations. Returns a structured review with severity-scored findings.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'The code to review.' },
      language: { type: 'string', description: 'Language (e.g. typescript, python).' },
    },
    required: ['code'],
  },
  run: async (input, ctx: ToolContext) => {
    const code = needString(input, 'code')
    const language = typeof input.language === 'string' ? input.language : 'unknown'
    const review = await quickText(
      ctx.env,
      `You are an adversarial code reviewer. Find security issues, performance bugs, anti-patterns, and best-practice violations. Score each finding's severity 1-5. End with SUMMARY: <0-100 overall score>.`,
      `Language: ${language}\n\nCode:\n${code}\n\nReview:`,
      0.3,
    )
    return { review, language, length: code.length }
  },
}

// ── Tool: prompt-optimize ────────────────────────────────────────────

const promptOptimizeTool: ToolDefinition = {
  id: 'prompt-optimize',
  name: 'Prompt Optimizer',
  description: 'Take a raw prompt and evolve it into a maximally clear, specific, well-structured version. Returns the optimized prompt plus a brief explanation of changes.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The prompt to optimize.' },
      goal: { type: 'string', description: 'What the prompt should achieve.' },
    },
    required: ['prompt'],
  },
  run: async (input, ctx: ToolContext) => {
    const prompt = needString(input, 'prompt')
    const goal = typeof input.goal === 'string' ? input.goal : 'general-purpose use'
    const result = await quickText(
      ctx.env,
      'You are a prompt engineering expert. Take the raw prompt and rewrite it into a maximally clear, specific, well-structured version. Include explicit role, context, constraints, output format, and edge-case handling. Output the optimized prompt followed by "CHANGES:" and a bulleted list of what you changed and why.',
      `Goal: ${goal}\n\nRaw prompt:\n${prompt}\n\nOptimized prompt:`,
      0.4,
    )
    return { optimized: result }
  },
}

// ── Tool: synthesize-research ────────────────────────────────────────

const synthesizeResearchTool: ToolDefinition = {
  id: 'synthesize-research',
  name: 'Research Synthesizer',
  description: 'Combine multiple sources (text snippets, tool outputs, prior answers) into a single coherent research synthesis with citations.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The research question.' },
      sources: { type: 'array', items: { type: 'string' }, description: 'Source texts to synthesize.' },
    },
    required: ['question', 'sources'],
  },
  run: async (input, ctx: ToolContext) => {
    const question = needString(input, 'question')
    const sources = needArray<string>(input, 'sources')
    if (!sources.length) throw new Error('Provide at least one source.')
    const synthesis = await quickText(
      ctx.env,
      'You are a research synthesis agent. Combine the sources below into a single coherent answer for the question. Cite sources as [1], [2], etc. Do not invent facts not present in the sources.',
      `Question: ${question}\n\nSources:\n${sources.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}\n\nSynthesis:`,
      0.4,
    )
    return { synthesis, sourcesUsed: sources.length }
  },
}

// ── Tool: strategy-recommend ─────────────────────────────────────────

const strategyRecommendTool: ToolDefinition = {
  id: 'strategy-recommend',
  name: 'Strategy Recommender',
  description: 'Analyze a query and recommend the best reasoning strategy (ReAct, ToT, plan-execute, self-critique, multi-debate, etc.) with reasoning.',
  category: 'Cognition',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The query to analyze.' },
    },
    required: ['query'],
  },
  run: async (input) => {
    const query = needString(input, 'query')
    const choice = pickStrategy(query)
    return {
      query,
      recommendedStrategy: choice.strategy as StrategyId,
      reason: choice.reason,
      availableStrategies: ['direct', 'react', 'tree_of_thought', 'plan_execute', 'self_critique', 'multi_debate', 'reflect_refine'],
    }
  },
}

// ── Tool: chain-tools ────────────────────────────────────────────────

const chainToolsTool: ToolDefinition = {
  id: 'chain-tools',
  name: 'Tool Chain (Pipeline)',
  description: 'Run a sequence of tools where each tool\'s output feeds into the next tool\'s input. Specify a list of {tool, input} steps; the output of step N is merged into step N+1\'s input as `prev`.',
  category: 'Ops',
  risk: 'review',
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string' },
            input: { type: 'object' },
          },
        },
      },
    },
    required: ['steps'],
  },
  run: async (input, ctx: ToolContext) => {
    const steps = needArray(input, 'steps') as Array<{ tool: string; input: Record<string, unknown> }>
    if (!steps.length) throw new Error('Provide at least one step.')
    // Lazy-load to avoid circular import
    const { runTool, getTool } = await import('./tools')
    const results: Array<{ tool: string; ok: boolean; output?: unknown; error?: string }> = []
    let prev: unknown = null
    for (const step of steps) {
      const tool = getTool(step.tool)
      if (!tool) {
        results.push({ tool: step.tool, ok: false, error: 'Unknown tool' })
        break
      }
      if (tool.risk !== 'safe') {
        results.push({ tool: step.tool, ok: false, error: `Tool ${step.tool} (${tool.risk}) cannot be chained` })
        break
      }
      try {
        const stepInput = { ...step.input, prev }
        const output = await runTool(step.tool, stepInput, { env: ctx.env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db })
        prev = output
        results.push({ tool: step.tool, ok: true, output })
      } catch (err) {
        results.push({ tool: step.tool, ok: false, error: err instanceof Error ? err.message : 'unknown' })
        break
      }
    }
    return { steps: results.length, finalOutput: prev, results }
  },
}

// ── Export the bundle ────────────────────────────────────────────────

export const advancedTools: ToolDefinition[] = [
  reasonReactTool,
  treeOfThoughtTool,
  planExecuteTool,
  selfCritiqueTool,
  multiDebateTool,
  longTaskStartTool,
  longTaskStatusTool,
  longTaskListTool,
  codeReviewTool,
  promptOptimizeTool,
  synthesizeResearchTool,
  strategyRecommendTool,
  chainToolsTool,
]
