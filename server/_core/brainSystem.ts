import { runAgent, type AgentRole } from "./agents";

export type MemoryKind = "preference" | "fact" | "goal" | "conversation" | "tool-result";
export type Memory = { id: string; userId: string; kind: MemoryKind; text: string; tags: string[]; importance: number; createdAt: string; lastAccessedAt: string; };
const memories = new Map<string, Memory[]>();
const tokenize = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2));
const similarity = (a: string, b: string) => { const left = tokenize(a), right = tokenize(b); if (!left.size || !right.size) return 0; let overlap = 0; for (const token of left) if (right.has(token)) overlap += 1; return overlap / Math.sqrt(left.size * right.size); };

export function storeMemory(input: Omit<Memory, "id" | "createdAt" | "lastAccessedAt">) { const now = new Date().toISOString(); const memory = { ...input, id: crypto.randomUUID(), createdAt: now, lastAccessedAt: now }; const current = memories.get(input.userId) ?? []; memories.set(input.userId, [...current, memory].slice(-500)); return memory; }
export function recallMemories(userId: string, query: string, limit = 8) { const now = new Date().toISOString(); return (memories.get(userId) ?? []).map(memory => ({ memory, score: similarity(query, `${memory.text} ${memory.tags.join(" ")}`) + memory.importance * .05 })).sort((a, b) => b.score - a.score).slice(0, limit).map(({ memory, score }) => { memory.lastAccessedAt = now; return { ...memory, score }; }); }
export function listMemories(userId: string) { return memories.get(userId) ?? []; }
export function forgetMemory(userId: string, id: string) { const remaining = (memories.get(userId) ?? []).filter(memory => memory.id !== id); memories.set(userId, remaining); return { deleted: remaining.length < (memories.get(userId) ?? []).length }; }

export type Activation = "relu" | "tanh" | "sigmoid" | "linear";
export type DenseLayer = { weights: number[][]; bias: number[]; activation?: Activation };
const activate = (value: number, activation: Activation = "linear") => activation === "relu" ? Math.max(0, value) : activation === "tanh" ? Math.tanh(value) : activation === "sigmoid" ? 1 / (1 + Math.exp(-value)) : value;
export function neuralForward(input: number[], layers: DenseLayer[]) { let values = [...input]; for (const layer of layers) { if (layer.weights.length !== layer.bias.length) throw new Error("Layer weights and bias dimensions do not match"); values = layer.weights.map((row, index) => activate(row.reduce((sum, weight, weightIndex) => sum + weight * (values[weightIndex] ?? 0), 0) + layer.bias[index], layer.activation)); } return values; }
export function neuralFeatureVector(values: number[]) { const safe = values.filter(Number.isFinite); const average = safe.length ? safe.reduce((sum, value) => sum + value, 0) / safe.length : 0; const variance = safe.length ? safe.reduce((sum, value) => sum + (value - average) ** 2, 0) / safe.length : 0; return [average, Math.sqrt(variance), safe.at(-1) ?? 0, safe.at(-2) ?? 0, safe.length]; }

export async function runAgentSwarm(input: { roles: AgentRole[]; prompt: string; model?: string; maxSteps?: number }) { const uniqueRoles = [...new Set(input.roles)]; const results = await Promise.all(uniqueRoles.map(role => runAgent(role, [{ role: "user", content: input.prompt }], { model: input.model, maxSteps: input.maxSteps ?? 3 }))); return { members: results.map(result => ({ agentId: result.agentId, agentName: result.agentName, finalResponse: result.finalResponse, stepsUsed: result.stepsUsed })), synthesisPrompt: results.map(result => `${result.agentName}:\n${result.finalResponse}`).join("\n\n"), consensusCount: results.length }; }
