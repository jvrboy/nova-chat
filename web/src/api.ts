// Thin client for the deployed Nova backend (Cloudflare Workers + Hono + D1).
// In dev, Vite proxies /api -> the deployed backend. In production the web app
// is served from the same Pages project, so /api is same-origin.

const API = '/api'
const WORKSPACE_KEY = 'nova.workspaceId'

export function getWorkspaceId(): string {
  let id = localStorage.getItem(WORKSPACE_KEY)
  if (!id) {
    id = `web-${crypto.randomUUID()}`
    localStorage.setItem(WORKSPACE_KEY, id)
  }
  return id
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
