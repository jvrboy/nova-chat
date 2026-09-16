// Orchestration layer — the "ultimate pipeline". An orchestrator agent takes an
// idea through: prompt evolution → deep research → UX mapping → architecture
// synthesis, with an adversarial critique loop and recursive optimization.
// Every stage emits visible reasoning steps (streamed via SSE by the route).
import type { Bindings } from './types'
import type { D1Database } from '@cloudflare/workers-types'
import { aiChat, aiConfigured } from './ai'
import { cleanOutput } from './parse'
import { validateProjectFiles, type FileInput } from './sandbox'

export type StageId =
  | 'prompt_evolution' | 'deep_research' | 'ux_mapping'
  | 'architecture' | 'adversarial_critique' | 'optimization'

export type ReasoningStep = {
  stage: StageId
  title: string
  detail: string
  status: 'running' | 'done' | 'failed'
  durationMs: number
  output?: string
}

export type PipelineResult = {
  ok: boolean
  steps: ReasoningStep[]
  evolvedPrompt: string
  research: string
  uxMap: string
  architecture: string
  critiqueScore: number
  iterations: number
  final: string
  usedAi: boolean
}

const STAGE_PROMPTS: Record<StageId, (idea: string, ctx: Record<string, string>) => string> = {
  prompt_evolution: (idea) => `You are a prompt evolution engine. Take this raw idea and evolve it into a maximally deep, clear, specific product brief. Expand the core concept, identify the target user, key differentiators, and success criteria.\n\nRaw idea: "${idea}"\n\nRespond with the evolved brief (3-5 paragraphs).`,
  deep_research: (_idea, ctx) => `You are a deep research sub-agent. Based on this evolved brief, analyze current industry trends, competitor patterns, and build a concise market strategy.\n\nBrief:\n${ctx.evolvedPrompt}\n\nRespond with: trends, competitor patterns, positioning, and go-to-market strategy.`,
  ux_mapping: (_idea, ctx) => `You are a UX specialist agent. Map the full user journey for this product, applying professional interface design principles and brand identity guidance.\n\nProduct brief:\n${ctx.evolvedPrompt}\n\nMarket strategy:\n${ctx.research}\n\nRespond with: user journey stages, key screens, interaction patterns, and design principles.`,
  architecture: (_idea, ctx) => `You are an architectural engine. Auto-generate the tech stack logic and codebase structure for this product. Recommend a concrete stack (e.g. Next.js, Flutter, Cloudflare Workers), folder structure, and core modules.\n\nProduct brief:\n${ctx.evolvedPrompt}\n\nUX map:\n${ctx.uxMap}\n\nRespond with: recommended stack, folder structure, core modules, and data flow.`,
  adversarial_critique: (_idea, ctx) => `You are an adversarial critic. Attack this architecture plan ruthlessly: find flaws, security risks, scalability issues, and missing pieces. Then score it 0-100.\n\nArchitecture:\n${ctx.architecture}\n\nRespond with: flaws found, then "SCORE: <0-100>".`,
  optimization: (_idea, ctx) => `You are a recursive optimizer. Given the critique below, produce a final, refined, production-ready plan that fixes every flaw.\n\nOriginal architecture:\n${ctx.architecture}\n\nCritique:\n${ctx.critique}\n\nRespond with the final optimized plan.`,
}

// Offline (no-AI) deterministic fallback so the pipeline always completes.
function offlineStage(stage: StageId, idea: string, _ctx: Record<string, string>): string {
  switch (stage) {
    case 'prompt_evolution':
      return `Evolved brief for "${idea}": a focused product solving a concrete user problem. Core concept: ${idea}. Target user: builders who want an autonomous pipeline from idea to deployment. Differentiators: full-loop agency (ideation, research, design, architecture, critique), self-improving via the brain engine, real-time data grounding. Success criteria: production-ready scaffold with validated files, consistent UX, and measurable quality score.`
    case 'deep_research':
      return `Market analysis (offline synthesis): the autonomous-dev-agent space is trending toward multi-agent orchestration, adversarial self-critique, and edge deployment. Competitor patterns: prompt-chaining frameworks and single-agent copilots dominate; few close the loop to deployment. Positioning: Nova as the orchestrated, self-critiquing pipeline. Go-to-market: start with the scaffold generator, expand to CI/CD integration.`
    case 'ux_mapping':
      return `User journey: (1) Idea entry → (2) watch streamed reasoning stages → (3) review evolved brief & research → (4) inspect architecture & file tree → (5) accept or refine. Key screens: Home (idea input), Pipeline view (stage timeline), Review (critique + score), Output (sandbox-validated file tree). Design principles: quiet, editorial, progressive disclosure, visible reasoning.`
    case 'architecture':
      return `Recommended stack: Next.js (web) + Cloudflare Workers (edge API) + D1 (state) + the Nova brain engine for self-improvement. Folder structure: /web (UI), /server/src/routes (API), /server/src/lib (engines: brain, market, ai, realtime, orchestrate, sandbox). Core modules: orchestrator, prompt evolution, research, UX mapping, architecture synthesis, adversarial critique, sandbox validation. Data flow: idea → stages → critique → optimized plan → validated artifacts.`
    case 'adversarial_critique':
      return `Flaws found: (1) offline stages lack live data — mitigate by wiring real-time providers; (2) no CI/CD yet — add GitHub Actions; (3) single-region state — consider D1 replication. SCORE: 82`
    case 'optimization':
      return `Final optimized plan: Next.js web + Workers edge API + D1, with the orchestration pipeline, adversarial critique (score-gated ≥70), sandbox-validated artifacts, real-time market/AI grounding, and a brain engine that learns from every run. CI/CD via GitHub Actions.`
  }
}

export async function runPipeline(
  env: Bindings,
  idea: string,
  opts: { maxIterations?: number; critiqueThreshold?: number; db?: D1Database } = {}
): Promise<PipelineResult> {
  const useAi = aiConfigured(env)
  const maxIter = Math.min(Math.max(opts.maxIterations ?? 1, 1), 3)
  const threshold = Math.min(Math.max(opts.critiqueThreshold ?? 70, 0), 100)
  const steps: ReasoningStep[] = []
  const ctx: Record<string, string> = {}

  async function runStage(stage: StageId): Promise<string> {
    const t0 = Date.now()
    const titles: Record<StageId, string> = {
      prompt_evolution: 'Evolving the core idea into a deep, specific brief',
      deep_research: 'Researching trends, competitors, and market strategy',
      ux_mapping: 'Mapping the full user journey & design system',
      architecture: 'Synthesizing tech stack & codebase structure',
      adversarial_critique: 'Adversarial critic attacking the plan for flaws',
      optimization: 'Recursively optimizing against the objective',
    }
    let output: string
    let status: ReasoningStep['status'] = 'done'
    try {
      if (useAi) {
        const r = await aiChat(env, [{ role: 'user', content: STAGE_PROMPTS[stage](idea, ctx) }], { db: opts.db })
        output = cleanOutput(r.text)
      } else {
        output = offlineStage(stage, idea, ctx)
      }
    } catch {
      status = 'failed'
      output = offlineStage(stage, idea, ctx)
    }
    steps.push({ stage, title: titles[stage], detail: STAGE_PROMPTS[stage](idea, ctx).slice(0, 200), status, durationMs: Date.now() - t0, output: output.slice(0, 4000) })
    return output
  }

  ctx.evolvedPrompt = await runStage('prompt_evolution')
  ctx.research = await runStage('deep_research')
  ctx.uxMap = await runStage('ux_mapping')
  ctx.architecture = await runStage('architecture')

  // Adversarial critique loop (recursive optimization).
  let iterations = 0
  let critiqueScore = 0
  let final = ctx.architecture
  for (let i = 0; i < maxIter; i++) {
    iterations++
    ctx.critique = await runStage('adversarial_critique')
    const m = ctx.critique.match(/SCORE:\s*(\d{1,3})/)
    critiqueScore = m ? Math.min(parseInt(m[1], 10), 100) : 75
    if (critiqueScore >= threshold) { final = ctx.architecture; break }
    final = await runStage('optimization')
    ctx.architecture = final
  }

  return {
    ok: true,
    steps,
    evolvedPrompt: ctx.evolvedPrompt,
    research: ctx.research,
    uxMap: ctx.uxMap,
    architecture: ctx.architecture,
    critiqueScore,
    iterations,
    final: cleanOutput(final),
    usedAi: useAi,
  }
}

export { validateProjectFiles }
export type { FileInput }
