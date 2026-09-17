/**
 * Advanced Reasoning Engine
 * ──────────────────────────
 * Multi-strategy reasoning primitives that go beyond the brain's pure-TS
 * cognitive loop. These strategies integrate the LLM to perform:
 *
 *   • ReAct        — explicit Reason → Act (tool call) → Observe loop
 *   • Tree-of-    — branch N candidate thoughts, score, expand best
 *     Thought
 *   • Plan-and-   — decompose into subtasks, execute each, join results
 *     Execute
 *   • Self-       — generate → critique → revise (adversarial)
 *     Critique
 *   • Multi-      — convene 3 agents with different personas, debate,
 *     Debate       synthesize
 *   • Reflect-    — solve → reflect → retry with refined prompt
 *     and-Refine
 *
 * Each strategy returns a structured ReasoningTrace that the chat engine
 * can stream to the UI so users see *how* Nova arrived at its answer.
 *
 * Designed to be LLM-agnostic: works with or without an LLM key (falls
 * back to deterministic heuristics so the engine never hard-fails).
 */

import type { Bindings } from './types'
import { chatComplete, generateText, LlmMessage, LlmToolSpec } from './llm'
import { aiConfigured, aiChat } from './ai'
import { runTool, toolAsLlmSpec, toolRegistry, getTool } from './tools'
import { newId, nowIso } from './ids'

// ── Types ──────────────────────────────────────────────────────────────

export type StrategyId =
  | 'react'
  | 'tree_of_thought'
  | 'plan_execute'
  | 'self_critique'
  | 'multi_debate'
  | 'reflect_refine'
  | 'direct'

export type TraceStepKind =
  | 'reasoning'      // internal thought
  | 'tool_call'      // invoked a tool
  | 'tool_result'    // tool output
  | 'observation'    // what we learned
  | 'plan'           // task decomposition
  | 'subtask'        // executed a subtask
  | 'critique'       // self/adversarial critique
  | 'revision'       // revised output
  | 'debate'         // agent contribution
  | 'synthesis'      // final merge
  | 'answer'         // final answer

export interface ReasoningStep {
  kind: TraceStepKind
  title: string
  detail: string
  at: string
  durationMs?: number
  metadata?: Record<string, unknown>
}

export interface ReasoningTrace {
  id: string
  strategy: StrategyId
  steps: ReasoningStep[]
  finalAnswer: string
  confidence: number
  iterations: number
  toolCalls: number
  tokensUsed?: number
  durationMs: number
  success: boolean
  error?: string
}

export type ReasoningContext = {
  env: Bindings
  workspaceId: string
  actorId: string
  db?: D1Database
  /** Allowed tool IDs (safe-only by default; pass more if running in agent mode) */
  allowedToolIds?: string[] | 'all'
  /** Hard cap on LLM iterations per strategy */
  maxIterations?: number
  /** Called for every step — used by SSE streaming routes */
  onStep?: (step: ReasoningStep) => void | Promise<void>
}

// ── Helpers ────────────────────────────────────────────────────────────

const DEFAULT_MAX_ITER = 6

function pickTools(ctx: ReasoningContext): LlmToolSpec[] {
  if (ctx.allowedToolIds === 'all') return toolRegistry.map(toolAsLlmSpec)
  if (Array.isArray(ctx.allowedToolIds) && ctx.allowedToolIds.length) {
    return toolRegistry
      .filter((t) => ctx.allowedToolIds!.includes(t.id) && t.risk === 'safe')
      .map(toolAsLlmSpec)
  }
  // Default: safe-only, like the open chat policy
  return toolRegistry.filter((t) => t.risk === 'safe').map(toolAsLlmSpec)
}

function enforceSafeToolPolicy(name: string): void {
  const tool = getTool(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  if (tool.risk !== 'safe') throw new Error(`Tool ${name} (${tool.risk}) is not allowed in reasoning engine.`)
}

async function llm(env: Bindings, messages: LlmMessage[], opts?: { tools?: LlmToolSpec[]; temperature?: number; maxTokens?: number }): Promise<{ message: LlmMessage; usage?: { total_tokens?: number } }> {
  // Free-tier AI pool fallback
  if (!env.OPENAI_API_KEY && aiConfigured(env)) {
    const msgs = messages.map((m) => ({
      role: m.role === 'tool' ? 'assistant' : (m.role as 'system' | 'user' | 'assistant'),
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
    }))
    const r = await aiChat(env, msgs, {})
    return { message: { role: 'assistant', content: r.text }, usage: undefined }
  }
  const r = await chatComplete(env, {
    messages,
    tools: opts?.tools,
    toolChoice: opts?.tools?.length ? 'auto' : undefined,
    temperature: opts?.temperature ?? 0.4,
    maxTokens: opts?.maxTokens,
  })
  return { message: r.message, usage: r.usage }
}

async function quickText(env: Bindings, system: string, user: string, temperature = 0.4): Promise<string> {
  if (!env.OPENAI_API_KEY && aiConfigured(env)) {
    const r = await aiChat(env, [{ role: 'system', content: system }, { role: 'user', content: user }], {})
    return r.text
  }
  return generateText(env, system, user)
}

function elapsed(from: number): number { return Date.now() - from }

async function emit(ctx: ReasoningContext, step: ReasoningStep): Promise<void> {
  if (ctx.onStep) {
    try { await ctx.onStep(step) } catch { /* never block on emit */ }
  }
}

// ── Strategy: direct (baseline) ────────────────────────────────────────

async function strategyDirect(
  query: string,
  history: LlmMessage[],
  ctx: ReasoningContext,
): Promise<ReasoningTrace> {
  const t0 = Date.now()
  const id = newId('trace')
  const steps: ReasoningStep[] = []
  const tools = pickTools(ctx)

  const messages: LlmMessage[] = [
    { role: 'system', content: 'You are Nova, an advanced AI assistant. Answer directly and concisely.' },
    ...history,
    { role: 'user', content: query },
  ]

  let toolCalls = 0
  let finalAnswer = ''
  let iterations = 0
  const maxIter = ctx.maxIterations ?? 4

  try {
    for (; iterations < maxIter; iterations++) {
      const start = Date.now()
      const { message, usage } = await llm(ctx.env, messages, { tools, temperature: 0.5 })
      messages.push(message)

      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }
          const step: ReasoningStep = { kind: 'tool_call', title: `Calling tool: ${call.function.name}`, detail: JSON.stringify(args).slice(0, 500), at: nowIso() }
          steps.push(step); await emit(ctx, step)
          try {
            enforceSafeToolPolicy(call.function.name)
            const result = await runTool(call.function.name, args, { env: ctx.env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db })
            toolCalls++
            const rStep: ReasoningStep = { kind: 'tool_result', title: `Tool result: ${call.function.name}`, detail: JSON.stringify(result).slice(0, 800), at: nowIso(), durationMs: elapsed(start) }
            steps.push(rStep); await emit(ctx, rStep)
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 4000), name: call.function.name })
          } catch (err) {
            const eStep: ReasoningStep = { kind: 'tool_result', title: `Tool blocked: ${call.function.name}`, detail: err instanceof Error ? err.message : 'unknown', at: nowIso() }
            steps.push(eStep); await emit(ctx, eStep)
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err instanceof Error ? err.message : 'blocked' }), name: call.function.name })
          }
        }
        continue
      }

      finalAnswer = typeof message.content === 'string' ? message.content : ''
      const aStep: ReasoningStep = { kind: 'answer', title: 'Final answer', detail: finalAnswer.slice(0, 500), at: nowIso(), durationMs: elapsed(t0) }
      steps.push(aStep); await emit(ctx, aStep)
      break
    }
  } catch (err) {
    return { id, strategy: 'direct', steps, finalAnswer: '', confidence: 0, iterations, toolCalls, durationMs: elapsed(t0), success: false, error: err instanceof Error ? err.message : 'unknown error' }
  }

  return {
    id, strategy: 'direct', steps, finalAnswer,
    confidence: finalAnswer ? 0.75 : 0.2,
    iterations, toolCalls, durationMs: elapsed(t0), success: !!finalAnswer,
  }
}

// ── Strategy: ReAct (Reason + Act + Observe) ──────────────────────────

async function strategyReAct(
  query: string,
  history: LlmMessage[],
  ctx: ReasoningContext,
): Promise<ReasoningTrace> {
  const t0 = Date.now()
  const id = newId('trace')
  const steps: ReasoningStep[] = []
  const tools = pickTools(ctx)
  const maxIter = ctx.maxIterations ?? 6

  const systemPrompt = `You are Nova using the ReAct (Reason+Act+Observe) strategy.
For each turn, you MUST follow this exact format:

THOUGHT: <one or two sentences of reasoning about what to do next>
ACTION: <tool name> OR FINAL:<your final answer>

When you have enough information to answer the user, use ACTION: FINAL:<answer>.
Otherwise, call a tool by name with proper arguments.

Be methodical: think before each action. Prefer a single tool call per turn.
After a tool returns, observe its output (in the tool result message) and reason again.`

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: query },
  ]

  let finalAnswer = ''
  let toolCalls = 0

  try {
    for (let i = 0; i < maxIter; i++) {
      const start = Date.now()
      const { message } = await llm(ctx.env, messages, { tools, temperature: 0.3 })
      messages.push(message)

      // Record explicit reasoning
      const text = typeof message.content === 'string' ? message.content : ''
      if (text) {
        const rStep: ReasoningStep = { kind: 'reasoning', title: `Iteration ${i + 1}: thought`, detail: text.slice(0, 800), at: nowIso(), durationMs: elapsed(start) }
        steps.push(rStep); await emit(ctx, rStep)
      }

      // Check for FINAL: marker in text
      const finalMatch = text.match(/FINAL:\s*([\s\S]+)$/i)
      if (finalMatch && !message.tool_calls?.length) {
        finalAnswer = finalMatch[1].trim()
        break
      }

      // Tool calls
      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }
          const cStep: ReasoningStep = { kind: 'tool_call', title: `Act: ${call.function.name}`, detail: JSON.stringify(args).slice(0, 500), at: nowIso() }
          steps.push(cStep); await emit(ctx, cStep)

          let resultStr: string
          try {
            enforceSafeToolPolicy(call.function.name)
            const result = await runTool(call.function.name, args, { env: ctx.env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db })
            toolCalls++
            resultStr = JSON.stringify(result).slice(0, 4000)
          } catch (err) {
            resultStr = JSON.stringify({ error: err instanceof Error ? err.message : 'blocked' })
          }

          const oStep: ReasoningStep = { kind: 'observation', title: `Observe: ${call.function.name}`, detail: resultStr.slice(0, 800), at: nowIso() }
          steps.push(oStep); await emit(ctx, oStep)
          messages.push({ role: 'tool', tool_call_id: call.id, content: resultStr, name: call.function.name })
        }
        continue
      }

      // No tool call and no FINAL marker — treat content as answer
      if (text) { finalAnswer = text; break }
    }

    if (!finalAnswer) {
      // Force a final synthesis turn
      const { message } = await llm(ctx.env, [
        ...messages,
        { role: 'user', content: 'Now provide your FINAL answer. Use the format FINAL:<answer>' },
      ], { temperature: 0.2 })
      const text = typeof message.content === 'string' ? message.content : ''
      const m = text.match(/FINAL:\s*([\s\S]+)$/i)
      finalAnswer = m ? m[1].trim() : text
    }

    const aStep: ReasoningStep = { kind: 'answer', title: 'Final answer', detail: finalAnswer.slice(0, 500), at: nowIso(), durationMs: elapsed(t0) }
    steps.push(aStep); await emit(ctx, aStep)
  } catch (err) {
    return { id, strategy: 'react', steps, finalAnswer: '', confidence: 0, iterations: steps.length, toolCalls, durationMs: elapsed(t0), success: false, error: err instanceof Error ? err.message : 'unknown error' }
  }

  return {
    id, strategy: 'react', steps, finalAnswer,
    confidence: Math.min(0.9, 0.6 + toolCalls * 0.05),
    iterations: steps.length, toolCalls, durationMs: elapsed(t0), success: !!finalAnswer,
  }
}

// ── Strategy: Plan-and-Execute ────────────────────────────────────────

async function strategyPlanExecute(
  query: string,
  history: LlmMessage[],
  ctx: ReasoningContext,
): Promise<ReasoningTrace> {
  const t0 = Date.now()
  const id = newId('trace')
  const steps: ReasoningStep[] = []
  const tools = pickTools(ctx)

  // Step 1: Plan
  const planStart = Date.now()
  const planText = await quickText(
    ctx.env,
    'You are a planning agent. Decompose the user request into 2-5 concrete subtasks. Respond ONLY as a numbered list, one subtask per line, no preamble.',
    `Request: ${query}\n\nSubtasks:`,
    0.3,
  )
  const subtasks = planText.split('\n').map((l) => l.replace(/^\s*\d+[\.\)]\s*/, '').trim()).filter(Boolean).slice(0, 5)
  const planStep: ReasoningStep = { kind: 'plan', title: `Planned ${subtasks.length} subtasks`, detail: subtasks.join('\n'), at: nowIso(), durationMs: elapsed(planStart) }
  steps.push(planStep); await emit(ctx, planStep)

  // Step 2: Execute each subtask
  const subAnswers: string[] = []
  let toolCalls = 0
  for (let i = 0; i < subtasks.length; i++) {
    const subStart = Date.now()
    const subMessages: LlmMessage[] = [
      { role: 'system', content: `You are executing subtask ${i + 1} of ${subtasks.length} for a larger goal. Use tools if helpful. Reply with the subtask's answer only.` },
      ...history,
      { role: 'user', content: subtasks[i] },
    ]

    let subAnswer = ''
    for (let iter = 0; iter < 3; iter++) {
      const { message } = await llm(ctx.env, subMessages, { tools, temperature: 0.3 })
      subMessages.push(message)
      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }
          try {
            enforceSafeToolPolicy(call.function.name)
            const result = await runTool(call.function.name, args, { env: ctx.env, workspaceId: ctx.workspaceId, actorId: ctx.actorId, db: ctx.db })
            toolCalls++
            subMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 3000), name: call.function.name })
          } catch (err) {
            subMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err instanceof Error ? err.message : 'blocked' }), name: call.function.name })
          }
        }
        continue
      }
      subAnswer = typeof message.content === 'string' ? message.content : ''
      break
    }
    subAnswers.push(`### Subtask ${i + 1}: ${subtasks[i]}\n${subAnswer}`)
    const sStep: ReasoningStep = { kind: 'subtask', title: `Subtask ${i + 1}/${subtasks.length}`, detail: subAnswer.slice(0, 500), at: nowIso(), durationMs: elapsed(subStart) }
    steps.push(sStep); await emit(ctx, sStep)
  }

  // Step 3: Synthesize
  const synthStart = Date.now()
  const finalAnswer = await quickText(
    ctx.env,
    'You are a synthesis agent. Combine the subtask outputs below into a single, coherent final answer for the user. Do not invent new information.',
    `Original request: ${query}\n\nSubtask outputs:\n${subAnswers.join('\n\n')}\n\nFinal answer:`,
    0.4,
  )
  const synStep: ReasoningStep = { kind: 'synthesis', title: 'Synthesized final answer', detail: finalAnswer.slice(0, 500), at: nowIso(), durationMs: elapsed(synthStart) }
  steps.push(synStep); await emit(ctx, synStep)

  const aStep: ReasoningStep = { kind: 'answer', title: 'Final answer', detail: finalAnswer.slice(0, 500), at: nowIso(), durationMs: elapsed(t0) }
  steps.push(aStep); await emit(ctx, aStep)

  return {
    id, strategy: 'plan_execute', steps, finalAnswer,
    confidence: Math.min(0.92, 0.7 + subtasks.length * 0.04),
    iterations: subtasks.length, toolCalls, durationMs: elapsed(t0), success: !!finalAnswer,
  }
}

// ── Strategy: Self-Critique (generate → critique → revise) ───────────

async function strategySelfCritique(
  query: string,
  history: LlmMessage[],
  ctx: ReasoningContext,
): Promise<ReasoningTrace> {
  const t0 = Date.now()
  const id = newId('trace')
  const steps: ReasoningStep[] = []
  const maxIter = Math.min(ctx.maxIterations ?? 3, 4)

  // Initial draft
  const draftStart = Date.now()
  const draft = await quickText(
    ctx.env,
    'You are Nova, an expert assistant. Provide a thorough, accurate answer to the user\'s question.',
    `Question: ${query}\n\nAnswer:`,
    0.5,
  )
  const dStep: ReasoningStep = { kind: 'answer', title: 'Draft answer', detail: draft.slice(0, 500), at: nowIso(), durationMs: elapsed(draftStart) }
  steps.push(dStep); await emit(ctx, dStep)

  let currentAnswer = draft
  let lastScore = 0
  let toolCalls = 0

  for (let i = 0; i < maxIter; i++) {
    // Critique
    const cStart = Date.now()
    const critique = await quickText(
      ctx.env,
      'You are an adversarial critic. Find flaws, missing information, logical errors, or unsupported claims in the answer. Be specific. End with SCORE: <0-100>.',
      `Question: ${query}\n\nAnswer to critique:\n${currentAnswer}\n\nCritique:`,
      0.3,
    )
    const cStep: ReasoningStep = { kind: 'critique', title: `Critique round ${i + 1}`, detail: critique.slice(0, 600), at: nowIso(), durationMs: elapsed(cStart) }
    steps.push(cStep); await emit(ctx, cStep)

    const scoreMatch = critique.match(/SCORE:\s*(\d{1,3})/i)
    lastScore = scoreMatch ? Math.min(100, parseInt(scoreMatch[1], 10)) : 75
    if (lastScore >= 88) break

    // Revise
    const rStart = Date.now()
    const revised = await quickText(
      ctx.env,
      'You are Nova revising your answer. Address every flaw the critic identified. Do not introduce new unsupported claims. Produce the improved answer only.',
      `Question: ${query}\n\nPrevious answer:\n${currentAnswer}\n\nCritic feedback:\n${critique}\n\nRevised answer:`,
      0.4,
    )
    const rStep: ReasoningStep = { kind: 'revision', title: `Revision round ${i + 1}`, detail: revised.slice(0, 500), at: nowIso(), durationMs: elapsed(rStart) }
    steps.push(rStep); await emit(ctx, rStep)
    currentAnswer = revised
  }

  return {
    id, strategy: 'self_critique', steps, finalAnswer: currentAnswer,
    confidence: Math.min(0.95, lastScore / 100),
    iterations: steps.length, toolCalls, durationMs: elapsed(t0), success: !!currentAnswer,
  }
}

// ── Strategy: Tree-of-Thought ─────────────────────────────────────────

async function strategyTreeOfThought(
  query: string,
  history: LlmMessage[],
  ctx: ReasoningContext,
): Promise<ReasoningTrace> {
  const t0 = Date.now()
  const id = newId('trace')
  const steps: ReasoningStep[] = []
  const branches = 3
  const depth = Math.min(ctx.maxIterations ?? 2, 3)

  // Generate N candidate approaches
  const genStart = Date.now()
  const approaches = await quickText(
    ctx.env,
    `You are a reasoning strategist. Propose ${branches} DIFFERENT approaches to answering the question. Use distinct strategies (e.g. analytical, creative, evidence-based). Format as a numbered list.`,
    `Question: ${query}\n\n${branches} approaches:`,
    0.7,
  )
  const approachList = approaches.split('\n').map((l) => l.replace(/^\s*\d+[\.\)]\s*/, '').trim()).filter(Boolean).slice(0, branches)
  const apStep: ReasoningStep = { kind: 'plan', title: `Generated ${approachList.length} candidate approaches`, detail: approachList.join('\n'), at: nowIso(), durationMs: elapsed(genStart) }
  steps.push(apStep); await emit(ctx, apStep)

  // Expand each approach to a full answer
  const candidates: { approach: string; answer: string; score: number }[] = []
  for (let i = 0; i < approachList.length; i++) {
    const eStart = Date.now()
    const ans = await quickText(
      ctx.env,
      'You are Nova answering the question using this specific approach. Stay faithful to the approach.',
      `Question: ${query}\n\nApproach to use: ${approachList[i]}\n\nAnswer:`,
      0.4,
    )
    const scorePrompt = await quickText(
      ctx.env,
      'You are scoring an answer. Consider accuracy, completeness, and clarity. Reply with just SCORE: <0-100>.',
      `Question: ${query}\n\nAnswer:\n${ans}\n\nSCORE:`,
      0.2,
    )
    const m = scorePrompt.match(/SCORE:\s*(\d{1,3})/i)
    const score = m ? Math.min(100, parseInt(m[1], 10)) : 70
    candidates.push({ approach: approachList[i], answer: ans, score })
    const cStep: ReasoningStep = { kind: 'reasoning', title: `Branch ${i + 1}: score ${score}`, detail: `Approach: ${approachList[i].slice(0, 200)}\nAnswer: ${ans.slice(0, 300)}`, at: nowIso(), durationMs: elapsed(eStart) }
    steps.push(cStep); await emit(ctx, cStep)
  }

  // Optional depth-2 refinement on the best candidate
  if (depth > 1 && candidates.length) {
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    const refined = await quickText(
      ctx.env,
      'You are Nova refining the best answer. Improve clarity, depth, and accuracy. Keep what works, fix what doesn\'t.',
      `Question: ${query}\n\nBest answer so far (score ${best.score}):\n${best.answer}\n\nRefined answer:`,
      0.4,
    )
    const rStep: ReasoningStep = { kind: 'revision', title: 'Refined best candidate', detail: refined.slice(0, 500), at: nowIso() }
    steps.push(rStep); await emit(ctx, rStep)
    candidates[0] = { ...best, answer: refined, score: Math.min(100, best.score + 5) }
  }

  candidates.sort((a, b) => b.score - a.score)
  const finalAnswer = candidates[0]?.answer ?? ''
  const aStep: ReasoningStep = { kind: 'answer', title: `Best branch (score ${candidates[0]?.score ?? 0})`, detail: finalAnswer.slice(0, 500), at: nowIso(), durationMs: elapsed(t0) }
  steps.push(aStep); await emit(ctx, aStep)

  return {
    id, strategy: 'tree_of_thought', steps, finalAnswer,
    confidence: (candidates[0]?.score ?? 0) / 100,
    iterations: candidates.length, toolCalls: 0, durationMs: elapsed(t0), success: !!finalAnswer,
  }
}

// ── Strategy: Multi-Agent Debate ─────────────────────────────────────

async function strategyMultiDebate(
  query: string,
  history: LlmMessage[],
  ctx: ReasoningContext,
): Promise<ReasoningTrace> {
  const t0 = Date.now()
  const id = newId('trace')
  const steps: ReasoningStep[] = []
  const personas = [
    { name: 'Analyst', system: 'You are a rigorous Analyst. Focus on facts, data, and logical structure. Cite specific claims.' },
    { name: 'Skeptic', system: 'You are a Skeptic. Challenge assumptions, point out edge cases, and demand evidence. Push back when others overreach.' },
    { name: 'Synthesizer', system: 'You are a Synthesizer. Find common ground, integrate perspectives, and produce a balanced final answer.' },
  ]

  // Round 1: each agent answers independently
  const contributions: { agent: string; text: string }[] = []
  for (const p of personas.slice(0, 2)) {
    const start = Date.now()
    const ans = await quickText(ctx.env, p.system, `Question: ${query}\n\nYour response (as ${p.name}):`, 0.5)
    contributions.push({ agent: p.name, text: ans })
    const cStep: ReasoningStep = { kind: 'debate', title: `${p.name} contribution`, detail: ans.slice(0, 500), at: nowIso(), durationMs: elapsed(start) }
    steps.push(cStep); await emit(ctx, cStep)
  }

  // Round 2: each agent critiques the others
  for (const p of personas.slice(0, 2)) {
    const start = Date.now()
    const others = contributions.filter((c) => c.agent !== p.name).map((c) => `${c.agent}: ${c.text}`).join('\n\n')
    const critique = await quickText(ctx.env, p.system, `Question: ${query}\n\nOther agents' contributions:\n${others}\n\nYour critique and refined position (as ${p.name}):`, 0.4)
    contributions.push({ agent: p.name, text: critique })
    const cStep: ReasoningStep = { kind: 'critique', title: `${p.name} critique`, detail: critique.slice(0, 500), at: nowIso(), durationMs: elapsed(start) }
    steps.push(cStep); await emit(ctx, cStep)
  }

  // Round 3: Synthesizer integrates
  const start = Date.now()
  const synth = await quickText(
    ctx.env,
    personas[2].system,
    `Question: ${query}\n\nAll contributions and critiques:\n${contributions.map((c) => `### ${c.agent}\n${c.text}`).join('\n\n')}\n\nSynthesized final answer:`,
    0.4,
  )
  const sStep: ReasoningStep = { kind: 'synthesis', title: 'Synthesized answer', detail: synth.slice(0, 500), at: nowIso(), durationMs: elapsed(start) }
  steps.push(sStep); await emit(ctx, sStep)
  const aStep: ReasoningStep = { kind: 'answer', title: 'Final answer', detail: synth.slice(0, 500), at: nowIso() }
  steps.push(aStep); await emit(ctx, aStep)

  return {
    id, strategy: 'multi_debate', steps, finalAnswer: synth,
    confidence: 0.88, iterations: contributions.length, toolCalls: 0, durationMs: elapsed(t0), success: !!synth,
  }
}

// ── Strategy: Reflect-and-Refine ──────────────────────────────────────

async function strategyReflectRefine(
  query: string,
  history: LlmMessage[],
  ctx: ReasoningContext,
): Promise<ReasoningTrace> {
  const t0 = Date.now()
  const id = newId('trace')
  const steps: ReasoningStep[] = []
  const maxIter = Math.min(ctx.maxIterations ?? 2, 3)

  let current = await quickText(ctx.env, 'You are Nova. Answer the user\'s question well.', `Question: ${query}\n\nAnswer:`, 0.5)
  const dStep: ReasoningStep = { kind: 'answer', title: 'Initial answer', detail: current.slice(0, 500), at: nowIso() }
  steps.push(dStep); await emit(ctx, dStep)

  for (let i = 0; i < maxIter; i++) {
    const rStart = Date.now()
    const reflection = await quickText(
      ctx.env,
      'You are Nova reflecting on your own answer. Identify any weakness, missing context, or improvement opportunity. Then describe how to improve.',
      `Question: ${query}\n\nCurrent answer:\n${current}\n\nReflection:`,
      0.3,
    )
    const rStep: ReasoningStep = { kind: 'critique', title: `Reflection ${i + 1}`, detail: reflection.slice(0, 500), at: nowIso(), durationMs: elapsed(rStart) }
    steps.push(rStep); await emit(ctx, rStep)

    const eStart = Date.now()
    const improved = await quickText(
      ctx.env,
      'You are Nova refining your answer based on your reflection. Apply the improvements.',
      `Question: ${query}\n\nCurrent answer:\n${current}\n\nReflection:\n${reflection}\n\nImproved answer:`,
      0.4,
    )
    const eStep: ReasoningStep = { kind: 'revision', title: `Refined ${i + 1}`, detail: improved.slice(0, 500), at: nowIso(), durationMs: elapsed(eStart) }
    steps.push(eStep); await emit(ctx, eStep)
    current = improved
  }

  return {
    id, strategy: 'reflect_refine', steps, finalAnswer: current,
    confidence: 0.85, iterations: maxIter, toolCalls: 0, durationMs: elapsed(t0), success: !!current,
  }
}

// ── Strategy auto-router ──────────────────────────────────────────────

export interface StrategyChoice {
  strategy: StrategyId
  reason: string
}

/**
 * Heuristic strategy router. Picks the best strategy based on the query's
 * shape — no extra LLM call required (kept cheap and deterministic).
 */
export function pickStrategy(query: string): StrategyChoice {
  const q = query.toLowerCase().trim()
  const wordCount = q.split(/\s+/).length
  const hasQuestion = /\?$/.test(q) || /\b(what|why|how|when|who|which|where|can you|could you|will|should|is|are)\b/.test(q)
  const hasMultiStep = /\b(and then|after that|step|steps|first.*then|next|finally|process|workflow|pipeline)\b/.test(q)
  const hasResearch = /\b(research|find out|investigate|analyze|study|compare|review|survey)\b/.test(q)
  const hasControversy = /\b(debate|controversial|pros and cons|trade-off|tradeoffs|vs\.?|versus|argument)\b/.test(q)
  const hasCreative = /\b(write|draft|compose|create|design|brainstorm|generate|story|poem|essay)\b/.test(q)
  const hasComplexMath = /\b(prove|derive|solve for|equation|theorem|integral|derivative|matrix|proof)\b/.test(q)

  if (hasControversy) return { strategy: 'multi_debate', reason: 'Controversial/comparative query → convene multiple agents' }
  if (hasMultiStep) return { strategy: 'plan_execute', reason: 'Multi-step task → decompose and execute' }
  if (hasResearch) return { strategy: 'react', reason: 'Research-style query → ReAct with tools' }
  if (hasCreative) return { strategy: 'self_critique', reason: 'Creative work → draft, critique, refine' }
  if (hasComplexMath) return { strategy: 'tree_of_thought', reason: 'Complex reasoning → explore multiple solution paths' }
  if (wordCount > 50) return { strategy: 'plan_execute', reason: 'Long, complex query → break down' }
  if (hasQuestion && wordCount < 15) return { strategy: 'direct', reason: 'Short direct question → answer directly' }
  return { strategy: 'reflect_refine', reason: 'Default → answer + reflect + refine' }
}

// ── Public entry: run with chosen strategy ────────────────────────────

export async function reasonWith(
  query: string,
  history: LlmMessage[],
  ctx: ReasoningContext,
  strategy?: StrategyId,
): Promise<ReasoningTrace> {
  const chosen = strategy ?? pickStrategy(query).strategy
  switch (chosen) {
    case 'direct': return strategyDirect(query, history, ctx)
    case 'react': return strategyReAct(query, history, ctx)
    case 'tree_of_thought': return strategyTreeOfThought(query, history, ctx)
    case 'plan_execute': return strategyPlanExecute(query, history, ctx)
    case 'self_critique': return strategySelfCritique(query, history, ctx)
    case 'multi_debate': return strategyMultiDebate(query, history, ctx)
    case 'reflect_refine': return strategyReflectRefine(query, history, ctx)
  }
}

// ── "Never stops until done" — persistent task continuation ───────────

/**
 * Returns true if the LLM's answer actually completes the user's request.
 * Used by the chat engine to decide whether to auto-continue.
 */
export async function isTaskComplete(env: Bindings, query: string, answer: string): Promise<{ complete: boolean; missing: string[] }> {
  if (!env.OPENAI_API_KEY && !aiConfigured(env)) {
    // Heuristic fallback: assume complete if answer is non-empty and > 50 chars
    return { complete: answer.trim().length > 50, missing: [] }
  }
  const text = await quickText(
    env,
    'You are a task verifier. Decide whether the answer fully addresses the user\'s request. Reply with COMPLETE: yes|no then MISSING: <comma-separated list of what is missing>.',
    `User request: ${query}\n\nProposed answer:\n${answer.slice(0, 2000)}\n\nVerdict:`,
    0.2,
  )
  const completeMatch = text.match(/COMPLETE:\s*(yes|no)/i)
  const missingMatch = text.match(/MISSING:\s*([^\n]+)/i)
  return {
    complete: completeMatch ? /^yes/i.test(completeMatch[1]) : true,
    missing: missingMatch ? missingMatch[1].split(',').map((s) => s.trim()).filter(Boolean) : [],
  }
}

export { toolRegistry, getTool }
