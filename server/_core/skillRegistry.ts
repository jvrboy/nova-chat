export type BackendSkill = { id: string; name: string; category: "research" | "trading" | "music" | "engineering" | "memory" | "agentic"; description: string; tools: string[]; risk: "low" | "medium" | "high"; requiresAuth: boolean };

export const BACKEND_SKILLS: BackendSkill[] = [
  { id: "market-structure", name: "Market Structure Analysis", category: "trading", description: "Pivots, Fibonacci, Ichimoku, Supertrend, divergence, volume profile, and confluence snapshots.", tools: ["advanced_market_structure", "forex_signal_snapshot"], risk: "high", requiresAuth: true },
  { id: "research-validation", name: "Research Validation", category: "research", description: "Backtest, forward-test, walk-forward, cost modeling, and uncertainty reporting.", tools: ["research_backtest", "forward_test", "walk_forward"], risk: "high", requiresAuth: true },
  { id: "music-production", name: "Music Production", category: "music", description: "Scales, chord extensions, quantization, Euclidean rhythms, drum grids, automation, and synth patch design.", tools: ["music_scale", "music_quantize", "music_rhythm", "create_synth_patch"], risk: "low", requiresAuth: true },
  { id: "durable-memory", name: "Durable Memory", category: "memory", description: "Retention-aware persistent embeddings with scoped recall and deletion.", tools: ["persistent_remember", "persistent_recall", "purge_expired"], risk: "medium", requiresAuth: true },
  { id: "agent-swarms", name: "Agent Swarms", category: "agentic", description: "Role-scoped parallel analysis with synthesis and governance controls.", tools: ["agent_swarm", "pipeline_execute"], risk: "medium", requiresAuth: true },
  { id: "sandbox-engineering", name: "Bounded Engineering Sandbox", category: "engineering", description: "Short, import-free calculations for safe lightweight transformations.", tools: ["sandbox_execute", "sandbox_capabilities"], risk: "medium", requiresAuth: true },
];

export function listSkills(category?: BackendSkill["category"]) { return category ? BACKEND_SKILLS.filter(skill => skill.category === category) : BACKEND_SKILLS; }
export function getSkill(id: string) { return BACKEND_SKILLS.find(skill => skill.id === id); }
