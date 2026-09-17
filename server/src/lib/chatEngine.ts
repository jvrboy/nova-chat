/**
 * Advanced Chat Engine
 * ─────────────────────
 * Wires together:
 *   • Brain (memory recall + skill lookup + capability tracking)
 *   • Advanced reasoning strategies (ReAct, ToT, plan-execute, debate, etc.)
 *   • "Never stops until done" task continuation
 *   • Streaming trace visibility for the UI
 *   • Long-running task persistence
 *
 * This engine is invoked by the new chat endpoints (/api/chats/:id/advanced
 * and /api/chats/:id/ultra) — the legacy /api/chats/:id/messages route
 * remains untouched for backward compatibility.
 */

import type { Bindings } from './types'
import { newId, nowIso } from './ids'
import { LlmMessage, generateText } from './llm'
import { aiConfigured } from './ai'
import { semanticSearch, upsertEmbedding } from './embeddings'
import {
  reasonWith, pickStrategy, isTaskComplete,
  ReasoningTrace, ReasoningStep, StrategyId, StrategyChoice,
} from './reasoning'
import { bindBrainDb } from './brain/db'
import { ensureBrainInitialized } from './brain/init'
import { memory as brainMemory } from './brain/memory'
import { skills as brainSkills } from './brain/skills'
import { knowledge as brainKnowledge } from './brain/knowledge'
import { getCapabilities } from './brain/core'
import type { CapabilityMap } from './brain/types'

// ── Types ─────────────────────────────────────────────────────────────

export type ChatMode = 'fast' | 'balanced' | 'ultra'

export interface ChatRequest {
  text: string
  chatId: string
  workspaceId: string
  actorId: string
  mode?: ChatMode
  /** Force a specific strategy (advanced users) */
  strategy?: StrategyId
  /** Max iterations for "never-stops" loop (default 3) */
  maxContinuations?: number
  /** Stream callback (fired for every step + delta) */
  onEvent?: (event: ChatEvent) => void | Promise<void>
}

export type ChatEvent =
  | { type: 'user_message'; id: string; text: string; at: string }
  | { type: 'strategy_chosen'; strategy: StrategyId; reason: string; at: string }
  | { type: 'reasoning_step'; step: ReasoningStep }
  | { type: 'memory_recall'; count: number; memories: { content: string; score: number }[] }
  | { type: 'skill_recall'; count: number; skills: { name: string; mastery: number }[] }
  | { type: 'knowledge_lookup'; count: number; facts: { subject: string; predicate: string; object: string; confidence: number }[] }
  | { type: 'capability_snapshot'; capabilities: CapabilityMap }
  | { type: 'continuation'; round: number; reason: string }
  | { type: 'verification'; complete: boolean; missing: string[] }
  | { type: 'learning'; lesson: string; importance: number }
  | { type: 'assistant_message'; id: string; text: string; trace: ReasoningTrace; at: string }
  | { type: 'error'; message: string; at: string }
  | { type: 'done'; assistantMessageId: string; at: string }

export interface ChatResult {
  userMessageId: string
  assistantMessageId: string
  finalText: string
  trace: ReasoningTrace
  strategyUsed: StrategyId
  strategyReason: string
  continuations: number
  memories: { content: string; score: number }[]
  skills: { name: string; mastery: number }[]
  knowledge: { subject: string; predicate: string; object: string; confidence: number }[]
  capabilitiesBefore: CapabilityMap
  capabilitiesAfter: CapabilityMap
  lessonsLearned: string[]
  durationMs: number
}

// ── Engine ────────────────────────────────────────────────────────────

const STRATEGY_BY_MODE: Record<ChatMode, 'auto' | StrategyId> = {
  fast: 'direct',
  balanced: 'auto',
  ultra: 'auto',
}

const MAX_CONTINUATIONS_BY_MODE: Record<ChatMode, number> = {
  fast: 0,
  balanced: 1,
  ultra: 3,
}

export async function runAdvancedChat(
  env: Bindings,
  db: D1Database,
  req: ChatRequest,
): Promise<ChatResult> {
  const t0 = Date.now()
  const workspaceId = req.workspaceId
  const actorId = req.actorId
  const mode = req.mode ?? 'balanced'
  const maxContinuations = req.maxContinuations ?? MAX_CONTINUATIONS_BY_MODE[mode]
  const text = req.text.trim()
  const emit = req.onEvent ?? (() => {})

  // Bind brain DB so memory/skills/knowledge calls work
  bindBrainDb(db)
  await ensureBrainInitialized()

  const userMsgId = newId('msg')
  const now = nowIso()
  await emit({ type: 'user_message', id: userMsgId, text, at: now })

  // Persist user message
  await db.prepare(
    'INSERT INTO messages (id, chat_id, workspace_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(userMsgId, req.chatId, workspaceId, 'user', text, now).run()

  // Embed for future RAG retrieval (best-effort)
  upsertEmbedding(env, db, { workspaceId, ownerType: 'message', ownerId: userMsgId, content: text }).catch(() => {})

  // Build history (newest 30)
  const { results } = await db.prepare(
    'SELECT role, content FROM messages WHERE chat_id = ? AND id != ? ORDER BY created_at DESC LIMIT 30',
  ).bind(req.chatId, userMsgId).all<{ role: string; content: string }>()
  results.reverse()
  const history: LlmMessage[] = results.map((m) => ({
    role: m.role as LlmMessage['role'],
    content: m.content,
  }))

  // ── Brain recall (memory + skills + knowledge) ──
  let memories: { content: string; score: number }[] = []
  let skillsRecalled: { name: string; mastery: number }[] = []
  let knowledgeFacts: { subject: string; predicate: string; object: string; confidence: number }[] = []

  try {
    const matches = await semanticSearch(env, db, workspaceId, text, 5)
    memories = matches.filter((m) => m.score > 0.3).map((m) => ({ content: m.content, score: m.score }))
    await emit({ type: 'memory_recall', count: memories.length, memories: memories.slice(0, 5) })
  } catch { /* best-effort */ }

  try {
    const similarSkills = await brainSkills.findSimilar(text, 3)
    skillsRecalled = similarSkills.map((s: { name: string; mastery: number }) => ({ name: s.name, mastery: s.mastery }))
    await emit({ type: 'skill_recall', count: skillsRecalled.length, skills: skillsRecalled })
  } catch { /* brain not ready */ }

  try {
    const facts = await brainKnowledge.search(text, 5)
    knowledgeFacts = facts.map((f: any) => ({ subject: f.subject, predicate: f.predicate, object: f.object, confidence: f.confidence ?? 0.5 }))
    await emit({ type: 'knowledge_lookup', count: knowledgeFacts.length, facts: knowledgeFacts })
  } catch { /* brain not ready */ }

  const capabilitiesBefore = getCapabilities()
  await emit({ type: 'capability_snapshot', capabilities: capabilitiesBefore })

  // Augment history with brain context
  const augmentedHistory: LlmMessage[] = [...history]
  if (memories.length || knowledgeFacts.length) {
    const ctxParts: string[] = []
    if (memories.length) {
      ctxParts.push(`RELEVANT MEMORIES (semantic recall):\n${memories.map((m, i) => `${i + 1}. ${m.content.slice(0, 300)}`).join('\n')}`)
    }
    if (knowledgeFacts.length) {
      ctxParts.push(`KNOWN FACTS (knowledge graph):\n${knowledgeFacts.map((f) => `• ${f.subject} ${f.predicate} ${f.object} (conf=${f.confidence.toFixed(2)})`).join('\n')}`)
    }
    if (skillsRecalled.length) {
      ctxParts.push(`APPLICABLE SKILLS:\n${skillsRecalled.map((s) => `• ${s.name} (mastery=${s.mastery.toFixed(2)})`).join('\n')}`)
    }
    augmentedHistory.push({ role: 'system', content: ctxParts.join('\n\n') })
  }

  // ── Pick strategy ──
  const strategyChoice: StrategyChoice = req.strategy
    ? { strategy: req.strategy, reason: 'User-forced strategy' }
    : (mode === 'fast'
      ? { strategy: 'direct', reason: 'Fast mode → direct answer' }
      : pickStrategy(text))
  await emit({ type: 'strategy_chosen', strategy: strategyChoice.strategy, reason: strategyChoice.reason, at: nowIso() })

  // ── Run reasoning strategy ──
  const ctx = {
    env, workspaceId, actorId, db,
    maxIterations: mode === 'ultra' ? 8 : mode === 'balanced' ? 5 : 3,
    onStep: async (step: ReasoningStep) => { await emit({ type: 'reasoning_step', step }) },
  }

  let trace = await reasonWith(text, augmentedHistory, ctx, strategyChoice.strategy)
  let finalText = trace.finalAnswer
  let continuations = 0

  // ── "Never stops until done" continuation loop ──
  if (maxContinuations > 0 && (mode === 'balanced' || mode === 'ultra')) {
    for (let round = 1; round <= maxContinuations; round++) {
      const verification = await isTaskComplete(env, text, finalText)
      await emit({ type: 'verification', complete: verification.complete, missing: verification.missing })

      if (verification.complete) break

      continuations = round
      await emit({
        type: 'continuation',
        round,
        reason: verification.missing.length
          ? `Missing: ${verification.missing.join(', ')}`
          : 'Answer not yet complete; refining.',
      })

      // Re-run with the gap explicitly appended
      const continuationQuery = verification.missing.length
        ? `Earlier you answered:\n${finalText}\n\nThe following is still missing or incomplete: ${verification.missing.join('; ')}.\n\nNow produce the FULL, complete answer that incorporates everything you already had plus what's missing.`
        : `Your previous answer was incomplete. Provide the FULL, complete answer now.`

      const contTrace = await reasonWith(continuationQuery, [
        ...augmentedHistory,
        { role: 'assistant', content: finalText },
      ], ctx, 'reflect_refine')

      // Merge traces
      trace = {
        ...trace,
        steps: [...trace.steps, ...contTrace.steps],
        finalAnswer: contTrace.finalAnswer,
        iterations: trace.iterations + contTrace.iterations,
        toolCalls: trace.toolCalls + contTrace.toolCalls,
        durationMs: trace.durationMs + contTrace.durationMs,
      }
      finalText = contTrace.finalAnswer
    }
  }

  // ── Persist assistant message ──
  const assistantMsgId = newId('msg')
  await db.prepare(
    'INSERT INTO messages (id, chat_id, workspace_id, role, content, tool_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(assistantMsgId, req.chatId, workspaceId, 'assistant', finalText, `reasoning:${trace.strategy}`, nowIso()).run()
  await db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(nowIso(), req.chatId).run()

  // Embed assistant reply for future RAG
  upsertEmbedding(env, db, { workspaceId, ownerType: 'message', ownerId: assistantMsgId, content: finalText }).catch(() => {})

  await emit({ type: 'assistant_message', id: assistantMsgId, text: finalText, trace, at: nowIso() })

  // ── Brain learning: store the experience ──
  const lessons: string[] = []
  try {
    // Store as episodic memory
    await brainMemory.store(
      'episodic',
      `User asked: "${text.slice(0, 200)}". Nova answered (via ${trace.strategy}, conf=${trace.confidence.toFixed(2)}): ${finalText.slice(0, 400)}`,
      {
        importance: Math.min(0.95, 0.5 + trace.confidence * 0.4),
        source: 'chat',
        tags: [trace.strategy, 'chat', mode],
      },
    )
    lessons.push(`Stored episodic memory of chat interaction (${trace.strategy})`)

    // If strategy succeeded with high confidence, reinforce the skill
    if (trace.confidence > 0.7) {
      const skillName = `chat-strategy-${trace.strategy}`
      try {
        const existing = await brainSkills.findByName(skillName)
        if (existing) {
          await brainSkills.recordUse(existing.id, true)
          lessons.push(`Reinforced skill: ${skillName}`)
        } else {
          await brainSkills.create(
            skillName,
            'reasoning',
            `Chat strategy: ${trace.strategy}`,
            { trigger: 'chat-query', approach: trace.strategy, steps: [] },
          )
          lessons.push(`Created new skill: ${skillName}`)
        }
      } catch { /* skill store unavailable */ }
    }
    await emit({ type: 'learning', lesson: lessons[lessons.length - 1], importance: trace.confidence })
  } catch { /* brain learning is best-effort */ }

  // Persist reasoning trace for debugging/observability
  try {
    await db.prepare(
      'INSERT INTO reasoning_traces (id, workspace_id, chat_id, message_id, strategy, steps_count, tool_calls, confidence, iterations, continuations, duration_ms, final_text, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      trace.id, workspaceId, req.chatId, assistantMsgId,
      trace.strategy, trace.steps.length, trace.toolCalls,
      trace.confidence, trace.iterations, continuations,
      trace.durationMs, finalText.slice(0, 8000),
      trace.success ? 1 : 0, nowIso(),
    ).run()
  } catch { /* table may not exist on legacy deploys */ }

  const capabilitiesAfter = getCapabilities()

  await emit({ type: 'done', assistantMessageId: assistantMsgId, at: nowIso() })

  return {
    userMessageId: userMsgId,
    assistantMessageId: assistantMsgId,
    finalText,
    trace,
    strategyUsed: trace.strategy,
    strategyReason: strategyChoice.reason,
    continuations,
    memories,
    skills: skillsRecalled,
    knowledge: knowledgeFacts,
    capabilitiesBefore,
    capabilitiesAfter,
    lessonsLearned: lessons,
    durationMs: Date.now() - t0,
  }
}

// ── Convenience: legacy-style single-shot call ────────────────────────

export async function quickReasoningReply(
  env: Bindings,
  db: D1Database,
  workspaceId: string,
  actorId: string,
  chatId: string,
  text: string,
): Promise<{ assistantMessageId: string; finalText: string; trace: ReasoningTrace }> {
  const result = await runAdvancedChat(env, db, {
    text, chatId, workspaceId, actorId, mode: 'balanced',
  })
  return {
    assistantMessageId: result.assistantMessageId,
    finalText: result.finalText,
    trace: result.trace,
  }
}
