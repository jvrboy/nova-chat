// Thin client for the deployed Nova backend (Cloudflare Workers + Hono + D1).
// In dev, Vite proxies /api -> the deployed backend. In production the web app
// is served from the same Pages project, so /api is same-origin.

const API = '/api'
const WORKSPACE_KEY = 'nova.workspaceId'

// A shared "sync key" lets all your devices land in the SAME workspace, so
// chats and settings persist and sync across devices. Set it in Settings.
const SYNCKEY = 'nova.syncKey'
export function getSyncKey(): string { return localStorage.getItem(SYNCKEY) ?? '' }
export function setSyncKey(k: string): void { localStorage.setItem(SYNCKEY, k.trim()) }
export function getWorkspaceId(): string {
  const key = getSyncKey()
  if (key) return `sync-${key.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
  let id = localStorage.getItem(WORKSPACE_KEY)
  if (!id) { id = `web-${crypto.randomUUID()}`; localStorage.setItem(WORKSPACE_KEY, id) }
  return id
}
export async function pullRemoteSettings(): Promise<Record<string, unknown> | null> {
  try { const r = await req<{ settings: Record<string, unknown> | null }>('/sync'); return r.settings } catch { return null }
}
export async function pushRemoteSettings(settings: Record<string, unknown>): Promise<void> {
  try { await req('/sync', { method: 'PUT', body: JSON.stringify({ settings }) }) } catch { /* offline */ }
}

async function req<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': getWorkspaceId(),
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text
    try { msg = (JSON.parse(text) as { error?: string }).error ?? text } catch { /* keep raw */ }
    throw new Error(`${res.status}: ${msg || res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ---- Chat ----
export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string; ts?: number; tool?: string | null }
export type ChatSummary = { id: string; title: string; created_at: string; updated_at: string }

export async function listChats() {
  return req<{ chats: ChatSummary[] }>('/chats')
}
export async function createChat(title?: string) {
  return req<ChatSummary>('/chats', { method: 'POST', body: JSON.stringify({ title: title ?? 'New conversation' }) })
}
export async function getMessages(chatId: string) {
  return req<{ messages: { id: string; role: string; content: string; tool_name: string | null; created_at: string }[] }>(
    `/chats/${encodeURIComponent(chatId)}/messages`
  )
}
export async function sendChat(chatId: string, text: string) {
  const data = await req<{
    userMessage: { id: string; role: string; text: string; createdAt: string }
    assistantMessage: { id: string; role: string; text: string; tool?: string; createdAt: string }
  }>(`/chats/${encodeURIComponent(chatId)}/messages`, { method: 'POST', body: JSON.stringify({ text }) })
  return data
}

// ---- Market engine ----
export type SymbolInfo = { id: string; name: string; class: string; base: number; digits: number; pip: number }

export async function marketSymbols() {
  return req<{ count: number; symbols: SymbolInfo[] }>('/market/symbols')
}
export async function marketQuote(symbol: string, timeframe = '1h') {
  return req<{ price: number; priceFormatted: string; changePct24: number; name: string; class: string }>(
    `/market/quote/${encodeURIComponent(symbol)}?timeframe=${timeframe}`
  )
}
export async function marketAnalyze(symbol: string, timeframe = '1h') {
  return req<{ id: string; overallBias: string; overallConfidence: number; commentary: string }>(
    '/market/analyze',
    { method: 'POST', body: JSON.stringify({ symbol, timeframe }) }
  )
}
export async function marketStrategies() {
  return req<{ count: number; strategies: { id: string; name: string }[] }>('/market/strategies')
}
export async function marketBacktest(symbol: string, timeframe = '1h', strategyId?: string) {
  return req<Record<string, unknown>>('/market/backtest', {
    method: 'POST',
    body: JSON.stringify({ symbol, timeframe, strategyId }),
  })
}

// ---- Insights ----
export async function cryptoOp(body: Record<string, unknown>) {
  return req<Record<string, unknown>>('/insights/crypto', { method: 'POST', body: JSON.stringify(body) })
}
export async function transformData(from: string, to: string, data: unknown) {
  return req<{ output: string }>('/insights/transform', { method: 'POST', body: JSON.stringify({ from, to, data }) })
}
export async function textStats(text: string) {
  return req<Record<string, unknown>>('/insights/text', { method: 'POST', body: JSON.stringify({ text }) })
}

// ---- Health ----
export async function health() {
  return req<{ status: string; service: string; time: string }>('/health')
}

// ---- Projects (real CRUD) ----
export type Project = { id: string; name: string; description: string; color: string; updated_at: string }
export type ProjectTask = { id: string; title: string; description: string; status: string; priority: string }
export async function listProjects() { return req<{ projects: Project[] }>('/projects') }
export async function createProject(name: string, description = '', color = '#55d6ff') {
  return req<{ id: string; name: string }>('/projects', { method: 'POST', body: JSON.stringify({ name, description, color }) })
}
export async function listProjectTasks(projectId: string) { return req<{ tasks: ProjectTask[] }>(`/projects/${encodeURIComponent(projectId)}/tasks`) }
export async function setTaskStatus(taskId: string, status: string) {
  return req(`/projects/tasks/${encodeURIComponent(taskId)}`, { method: 'PATCH', body: JSON.stringify({ status }) })
}
export async function deleteChat(chatId: string) {
  return req(`/chats/${encodeURIComponent(chatId)}`, { method: 'DELETE' })
}

// ---- Chat management + MIDI ----
export async function updateChat(chatId: string, patch: { title?: string; archived?: boolean }) {
  return req(`/chats/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify(patch) })
}
export async function generateMidi(body: { key?: string; tempo?: number; bars?: number; style?: string }) {
  return req<{ ok: boolean; base64: string; filename: string; meta: Record<string, unknown> }>('/midi/generate', { method: 'POST', body: JSON.stringify(body) })
}
