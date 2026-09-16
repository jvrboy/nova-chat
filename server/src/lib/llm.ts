import type { Bindings } from './types'
import { aiChat, aiConfigured, type ChatMessage as AiMessage } from './ai'

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | LlmContentPart[] | null
  tool_call_id?: string
  tool_calls?: LlmToolCall[]
  name?: string
}

export type LlmToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type LlmToolSpec = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ChatCompletionResult = {
  message: LlmMessage
  raw: unknown
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

const ALLOWED_MODELS = new Set([
  'gpt-5', 'gpt-5.1', 'gpt-5.2', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-codex', 'gpt-5.2-codex', 'gpt-5.3-codex',
])

export function resolveModel(env: Bindings, override?: string): string {
  const model = override || env.LLM_MODEL || 'gpt-5-mini'
  return ALLOWED_MODELS.has(model) ? model : 'gpt-5-mini'
}

/**
 * True when a usable LLM key is configured. When false (e.g. the OPENAI_API_KEY
 * secret was never set on a fresh deploy), the chat route falls back to a
 * built-in offline responder so the app stays functional instead of erroring.
 */
export function llmAvailable(env: Bindings): boolean {
  return typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim().length > 0 && !env.OPENAI_API_KEY.includes('dummy')
}

/**
 * Offline fallback assistant. Produces a genuinely useful reply for the kinds
 * of questions the local tool engine already covers (arithmetic, word counts,
 * date math) and a clear capability summary otherwise. Used only when no LLM
 * key is configured, so the deployed web app always responds.
 */
export function offlineReply(userText: string): string {
  const text = userText.trim()
  const lower = text.toLowerCase()

  // Arithmetic: evaluate a simple expression like "12 * 8" or "what is 5 + 3?"
  const exprMatch = lower.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/x×÷^%]|plus|minus|times|divided by|multiplied by)\s*(-?\d+(?:\.\d+)?)/)
  if (exprMatch) {
    const a = parseFloat(exprMatch[1])
    const b = parseFloat(exprMatch[3])
    const op = exprMatch[2]
    let result: number | null = null
    if (op === '+' || op === 'plus') result = a + b
    else if (op === '-' || op === 'minus') result = a - b
    else if (op === '*' || op === 'x' || op === '×' || op === 'times' || op === 'multiplied by') result = a * b
    else if (op === '/' || op === '÷' || op === 'divided by') result = b === 0 ? null : a / b
    else if (op === '^') result = Math.pow(a, b)
    else if (op === '%') result = b === 0 ? null : a % b
    if (result !== null && isFinite(result)) {
      const nice = Number.isInteger(result) ? String(result) : result.toFixed(4).replace(/\.?0+$/, '')
      return `${a} ${op} ${b} = ${nice}. (Computed on-device by Nova's calculator tool — the language model isn't configured on this deployment yet.)`
    }
    return `That expression divides by zero, which is undefined. (Computed by Nova's calculator tool.)`
  }

  // Word / character count.
  if (/\b(word count|how many words|count words|count the words)\b/.test(lower)) {
    const words = text.split(/\s+/).filter(Boolean).length
    return `That message is ${words} words and ${text.length} characters long. (From Nova's word-count tool — no LLM needed.)`
  }

  // Date / time.
  if (/\b(what (day|date|time) is|today'?s date|current time|what time)\b/.test(lower)) {
    const now = new Date()
    return `Right now it's ${now.toUTCString()} (UTC). (From Nova's date-math tool.)`
  }

  // Greetings.
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(lower)) {
    return `Hello — I'm Nova. I can help you think through a question, a draft, or a half-formed idea. Note: this deployment doesn't have a language-model key configured yet, so I'm running on my built-in tools (calculator, word count, date math, market analysis, data transforms). Set the OPENAI_API_KEY secret to unlock full conversational replies. What would you like to work on?`
  }

  // Default capability summary.
  return `I'm Nova, running on my built-in tool engine because this deployment has no language-model key configured (set the OPENAI_API_KEY secret to enable full conversational replies). I can still help right now with: arithmetic ("12 * 8"), word/character counts, date & time, market analysis and backtests (see the Studio), data transformation (JSON/CSV/YAML/Base64), text statistics, hashing, UUIDs, and more. What are you working through?`
}

/**
 * Minimal OpenAI-compatible chat completion client built on fetch, so it works
 * inside the Cloudflare Workers runtime without pulling in the full Node SDK.
 */
export async function chatComplete(
  env: Bindings,
  options: {
    model?: string
    messages: LlmMessage[]
    tools?: LlmToolSpec[]
    toolChoice?: 'auto' | 'none'
    temperature?: number
    maxTokens?: number
  }
): Promise<ChatCompletionResult> {
  // No OpenAI key but free-tier AI pools configured? Route through the
  // multi-provider router (Groq/Gemini/Ollama) with automatic key rotation.
  if (!llmAvailable(env) && aiConfigured(env)) {
    const msgs: AiMessage[] = options.messages.map((m) => ({
      role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant',
      content: typeof m.content === 'string' ? m.content : m.content == null ? '' : JSON.stringify(m.content),
    }))
    const r = await aiChat(env, msgs, {})
    return { message: { role: 'assistant', content: r.text }, raw: { provider: r.provider, model: r.model }, usage: undefined }
  }

  const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = resolveModel(env, options.model)

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
  }
  if (options.tools?.length) {
    body.tools = options.tools
    body.tool_choice = options.toolChoice ?? 'auto'
  }
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    // A hung provider must not stall the whole request chain.
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 500)}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: LlmMessage }>
    usage?: ChatCompletionResult['usage']
  }
  const message = data.choices?.[0]?.message
  if (!message) throw new Error('LLM response contained no message.')
  return { message, raw: data, usage: data.usage }
}

/**
 * Streaming variant of chatComplete for SSE endpoints. Yields incremental text
 * deltas as they arrive from the OpenAI-compatible proxy (`stream: true`),
 * and also accumulates any tool_calls so the caller can execute them once the
 * stream ends. This is the real streaming path used by /api/chats/:id/stream
 * and /api/agents/:key/stream — not a fake chunked-JSON simulation.
 */
export async function* streamChatComplete(
  env: Bindings,
  options: { model?: string; messages: LlmMessage[]; tools?: LlmToolSpec[]; toolChoice?: 'auto' | 'none'; temperature?: number }
): AsyncGenerator<{ type: 'delta'; text: string } | { type: 'done'; message: LlmMessage }, void, unknown> {
  const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = resolveModel(env, options.model)

  const body: Record<string, unknown> = { model, messages: options.messages, stream: true }
  if (options.tools?.length) {
    body.tools = options.tools
    body.tool_choice = options.toolChoice ?? 'auto'
  }
  if (options.temperature !== undefined) body.temperature = options.temperature

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    throw new Error(`LLM stream request failed (${response.status}): ${text.slice(0, 500)}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  const toolCallsById: Record<number, { id: string; type: 'function'; function: { name: string; arguments: string } }> = {}

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      let json: any
      try { json = JSON.parse(payload) } catch { continue }
      const delta = json.choices?.[0]?.delta
      if (!delta) continue
      if (typeof delta.content === 'string' && delta.content.length) {
        content += delta.content
        yield { type: 'delta', text: delta.content }
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          if (!toolCallsById[idx]) toolCallsById[idx] = { id: tc.id ?? `call_${idx}`, type: 'function', function: { name: '', arguments: '' } }
          if (tc.function?.name) toolCallsById[idx].function.name += tc.function.name
          if (tc.function?.arguments) toolCallsById[idx].function.arguments += tc.function.arguments
          if (tc.id) toolCallsById[idx].id = tc.id
        }
      }
    }
  }

  const toolCalls = Object.values(toolCallsById)
  yield { type: 'done', message: { role: 'assistant', content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) } }
}

/** Simple non-tool-calling helper for one-shot text generation (summaries, translations, etc). */
export async function generateText(env: Bindings, systemPrompt: string, userPrompt: string, model?: string): Promise<string> {
  const result = await chatComplete(env, {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
  })
  return typeof result.message.content === 'string' ? result.message.content : ''
}
