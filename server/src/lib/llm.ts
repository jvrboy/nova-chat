import type { Bindings } from './types'

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
