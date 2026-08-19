import type { AgentRole } from "./agents";

export type ToolRisk = "read" | "compute" | "external" | "code";
export type ToolCircuitState = "closed" | "open" | "half_open";

export type ToolPolicy = {
  name: string;
  description: string;
  risk: ToolRisk;
  allowedAgents: AgentRole[] | "all";
  maxCallsPerMinute: number;
  failureThreshold: number;
  minimumSamples: number;
  cooldownMs: number;
};

type RuntimeState = { successes: number; failures: number; openedAt?: number; lastError?: string; lastUsedAt?: number };

const commonAgents: AgentRole[] = ["forex_analyst", "code_reviewer", "music_composer", "data_analyst", "research_agent", "writing_assistant", "math_tutor", "translator", "summarizer", "brainstormer", "sound_designer", "quant_researcher", "risk_manager", "memory_architect", "ml_engineer", "music_producer", "audio_engineer", "market_microstructure", "data_engineer", "automation_orchestrator", "qa_engineer"];

export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  calculator: { name: "calculator", description: "Evaluate safe arithmetic expressions.", risk: "compute", allowedAgents: "all", maxCallsPerMinute: 120, failureThreshold: .6, minimumSamples: 10, cooldownMs: 15_000 },
  text_analysis: { name: "text_analysis", description: "Analyze text statistics and sentiment.", risk: "compute", allowedAgents: "all", maxCallsPerMinute: 60, failureThreshold: .6, minimumSamples: 10, cooldownMs: 15_000 },
  code_execution: { name: "code_execution", description: "Execute agent-provided code in the existing sandbox pathway.", risk: "code", allowedAgents: ["code_reviewer", "data_analyst", "math_tutor"], maxCallsPerMinute: 20, failureThreshold: .35, minimumSamples: 5, cooldownMs: 30_000 },
  data_processing: { name: "data_processing", description: "Transform and summarize structured data.", risk: "compute", allowedAgents: "all", maxCallsPerMinute: 60, failureThreshold: .6, minimumSamples: 10, cooldownMs: 15_000 },
  web_search: { name: "web_search", description: "Request current web research.", risk: "external", allowedAgents: ["forex_analyst", "research_agent", "brainstormer"], maxCallsPerMinute: 30, failureThreshold: .5, minimumSamples: 5, cooldownMs: 20_000 },
  forex_signal_snapshot: { name: "forex_signal_snapshot", description: "Compute advanced forex indicators and a non-guaranteed snapshot.", risk: "compute", allowedAgents: ["forex_analyst", "quant_researcher", "risk_manager"], maxCallsPerMinute: 30, failureThreshold: .5, minimumSamples: 5, cooldownMs: 20_000 },
  forex_multi_timeframe: { name: "forex_multi_timeframe", description: "Calculate timeframe confluence.", risk: "compute", allowedAgents: ["forex_analyst", "quant_researcher", "risk_manager"], maxCallsPerMinute: 20, failureThreshold: .5, minimumSamples: 5, cooldownMs: 20_000 },
  create_synth_patch: { name: "create_synth_patch", description: "Generate a Serum/Xfer-style engine-neutral synth patch.", risk: "compute", allowedAgents: ["music_composer", "sound_designer", "brainstormer", "music_producer", "audio_engineer"], maxCallsPerMinute: 30, failureThreshold: .5, minimumSamples: 5, cooldownMs: 15_000 },
  advanced_market_structure: { name: "advanced_market_structure", description: "Compute pivots, Fibonacci, Ichimoku, Supertrend, divergence, volume profile, and confluence.", risk: "compute", allowedAgents: ["forex_analyst", "quant_researcher", "risk_manager", "market_microstructure"], maxCallsPerMinute: 20, failureThreshold: .5, minimumSamples: 5, cooldownMs: 20_000 },
  music_quantize: { name: "music_quantize", description: "Quantize note events to a bounded musical grid.", risk: "compute", allowedAgents: ["music_composer", "music_producer", "audio_engineer"], maxCallsPerMinute: 60, failureThreshold: .5, minimumSamples: 5, cooldownMs: 15_000 },
  music_rhythm: { name: "music_rhythm", description: "Generate deterministic Euclidean and drum-grid patterns.", risk: "compute", allowedAgents: ["music_composer", "music_producer", "audio_engineer"], maxCallsPerMinute: 60, failureThreshold: .5, minimumSamples: 5, cooldownMs: 15_000 },
  persistent_remember: { name: "persistent_remember", description: "Persist scoped memory with embeddings and retention metadata.", risk: "external", allowedAgents: ["memory_architect", "automation_orchestrator"], maxCallsPerMinute: 30, failureThreshold: .4, minimumSamples: 5, cooldownMs: 30_000 },
  persistent_recall: { name: "persistent_recall", description: "Recall durable memories using scoped cosine similarity.", risk: "external", allowedAgents: ["memory_architect", "ml_engineer", "automation_orchestrator"], maxCallsPerMinute: 60, failureThreshold: .5, minimumSamples: 5, cooldownMs: 20_000 },
  technical_indicator_suite: { name: "technical_indicator_suite", description: "Compute a bounded suite of deterministic technical-analysis indicators.", risk: "compute", allowedAgents: ["forex_analyst", "quant_researcher", "risk_manager", "market_microstructure", "data_analyst", "ui_architect", "multimodal_curator"], maxCallsPerMinute: 30, failureThreshold: .5, minimumSamples: 5, cooldownMs: 20_000 },
  agentic_workflow_plan: { name: "agentic_workflow_plan", description: "Create a safe role-aware workflow plan with verification and rollback gates.", risk: "compute", allowedAgents: ["brainstormer", "research_agent", "automation_orchestrator", "qa_engineer", "ui_architect", "multimodal_curator", "observability_engineer", "security_reviewer"], maxCallsPerMinute: 30, failureThreshold: .5, minimumSamples: 5, cooldownMs: 15_000 },
  advanced_music_arrangement: { name: "advanced_music_arrangement", description: "Generate bounded chord, arpeggio, swing, humanization, velocity, and MIDI-note outputs.", risk: "compute", allowedAgents: ["music_composer", "music_producer", "audio_engineer", "sound_designer", "brainstormer"], maxCallsPerMinute: 60, failureThreshold: .5, minimumSamples: 5, cooldownMs: 15_000 },
  market_screening_snapshot: { name: "market_screening_snapshot", description: "Screen supplied crypto or stock OHLCV assets with deterministic indicators; never executes trades.", risk: "compute", allowedAgents: ["crypto_screening_analyst", "equity_screening_analyst", "market_data_steward", "screening_synthesizer", "quant_researcher", "risk_manager"], maxCallsPerMinute: 20, failureThreshold: .45, minimumSamples: 5, cooldownMs: 20_000 },
  advanced_strategy_backtest: { name: "advanced_strategy_backtest", description: "Run cost-aware historical strategy simulations; never places orders.", risk: "compute", allowedAgents: ["crypto_screening_analyst", "equity_screening_analyst", "quant_researcher", "risk_manager"], maxCallsPerMinute: 10, failureThreshold: .4, minimumSamples: 5, cooldownMs: 30_000 },
  market_stream_subscription: { name: "market_stream_subscription", description: "Build bounded provider subscription payloads without exposing credentials.", risk: "external", allowedAgents: ["market_data_steward", "crypto_screening_analyst", "equity_screening_analyst", "market_microstructure"], maxCallsPerMinute: 30, failureThreshold: .5, minimumSamples: 5, cooldownMs: 20_000 },
};

const runtime = new Map<string, RuntimeState>();
const callWindow = new Map<string, { startedAt: number; count: number }>();

function stateFor(toolName: string) { const current = runtime.get(toolName) ?? { successes: 0, failures: 0 }; runtime.set(toolName, current); return current; }

export function canInvokeTool(toolName: string, agentRole: AgentRole) {
  const policy = TOOL_POLICIES[toolName];
  if (!policy) return { allowed: false, reason: "Tool is not registered." };
  if (policy.allowedAgents !== "all" && !policy.allowedAgents.includes(agentRole)) return { allowed: false, reason: `Agent '${agentRole}' is not permitted to call '${toolName}'.` };
  const state = stateFor(toolName);
  if (state.openedAt) {
    const elapsed = Date.now() - state.openedAt;
    if (elapsed < policy.cooldownMs) return { allowed: false, reason: `Circuit is open for '${toolName}' until cooldown elapses.` };
    return { allowed: true, state: "half_open" as const, reason: "Cooldown elapsed; probe call allowed." };
  }
  const window = callWindow.get(toolName);
  if (window && Date.now() - window.startedAt < 60_000 && window.count >= policy.maxCallsPerMinute) return { allowed: false, reason: `Rate limit reached for '${toolName}'.` };
  return { allowed: true, state: "closed" as const, reason: "Permission and circuit checks passed." };
}

export function recordToolSuccess(toolName: string) { const state = stateFor(toolName); state.successes += 1; state.lastUsedAt = Date.now(); state.openedAt = undefined; state.lastError = undefined; const window = callWindow.get(toolName); if (!window || Date.now() - window.startedAt >= 60_000) callWindow.set(toolName, { startedAt: Date.now(), count: 1 }); else window.count += 1; }

export function recordToolFailure(toolName: string, error: string) { const policy = TOOL_POLICIES[toolName]; if (!policy) return; const state = stateFor(toolName); state.failures += 1; state.lastUsedAt = Date.now(); state.lastError = error.slice(0, 500); const total = state.successes + state.failures; if (total >= policy.minimumSamples && state.failures / total >= policy.failureThreshold) state.openedAt = Date.now(); }

export function listToolPolicies() { return Object.values(TOOL_POLICIES).map(policy => ({ ...policy })); }
export function getToolPolicy(toolName: string) { return TOOL_POLICIES[toolName] ? { ...TOOL_POLICIES[toolName] } : undefined; }

export function listToolRuntime() { return Object.values(TOOL_POLICIES).map(policy => { const state = stateFor(policy.name); const decision = canInvokeTool(policy.name, policy.allowedAgents === "all" ? "brainstormer" : policy.allowedAgents[0]); return { toolName: policy.name, state: state.openedAt ? (Date.now() - state.openedAt >= policy.cooldownMs ? "half_open" : "open") : "closed" as ToolCircuitState, successes: state.successes, failures: state.failures, lastError: state.lastError ?? null, lastUsedAt: state.lastUsedAt ?? null, allowedNow: decision.allowed }; }); }

export function resetToolCircuit(toolName: string) { if (!TOOL_POLICIES[toolName]) throw new Error(`Unknown tool: ${toolName}`); runtime.set(toolName, { successes: 0, failures: 0 }); callWindow.delete(toolName); return { toolName, reset: true }; }
