import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { appendAudit } from '../lib/db'
import { chatComplete, streamChatComplete, LlmMessage } from '../lib/llm'
import { runTool, toolAsLlmSpec, toolRegistry } from '../lib/tools'
import { semanticSearch, upsertEmbedding } from '../lib/embeddings'

const chat = new Hono<AppEnv>()

const SYSTEM_PROMPT = `You are Nova, a helpful, concise AI assistant embedded in a productivity workspace app.
You can use tools when they would produce a more accurate or useful answer (calculations, summarization, translation,
sentiment analysis, fetching public web pages, redacting PII, formatting JSON, hashing, date math, risk scoring, chunking
text, UUIDs, QR payloads, entity extraction, classification, unit conversion, CSV parsing, OCR, and semantic memory recall).
Only call a tool when it is actually needed — for simple conversation, just reply directly.
If relevant prior context is provided under "RELEVANT MEMORY", use it naturally without mentioning the retrieval mechanism.
Be direct and avoid filler. If you don't know something and no tool can help, say so plainly.`

// Only expose "safe" tools directly in open chat; 'review'/'sensitive' tools stay behind explicit tool-run calls or agents.
const chatTools = toolRegistry.filter((t) => t.risk === 'safe').map(toolAsLlmSpec)

async function buildContextMessages(env: AppEnv['Bindings'], db: D1Database, workspaceId: string, chatId: string, latestUserText: string): Promise<LlmMessage[]> {
  const history = await db.prepare('SELECT role, content, tool_name FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 30')
    .bind(chatId)
    .all<{ role: string; content: string; tool_name: string | null }>()

  const messages: LlmMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

  // Real RAG: pull the most relevant stored memories/past messages by meaning,
  // not just the last 30 turns, so the assistant can recall older context.
  try {
    const matches = await semanticSearch(env, db, workspaceId, latestUserText, 4)
    const relevant = matches.filter((m) => m.score > 0.35)
    if (relevant.length) {
      messages.push({
        role: 'system',
        content: `RELEVANT MEMORY (retrieved by semantic similarity, may or may not be relevant):\n${relevant.map((m, i) => `${i + 1}. [${m.ownerType}] ${m.content}`).join('\n')}`,
      })
    }
  } catch { /* RAG is best-effort; never block the chat on it */ }

  messages.push(...history.results.map((m) => ({ role: m.role as LlmMessage['role'], content: m.content })))
  return messages
}

// GET /api/chats - list chats for the workspace
chat.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT id, title, created_at, updated_at FROM chats WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100')
    .bind(workspaceId)
    .all()
  return c.json({ chats: results })
})

// POST /api/chats - create a new chat
chat.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const body = await c.req.json().catch(() => ({}))
  const id = newId('chat')
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'New conversation'
  const at = nowIso()
  await c.env.DB.prepare('INSERT INTO chats (id, workspace_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, workspaceId, title, at, at).run()
  return c.json({ id, title, created_at: at, updated_at: at }, 201)
})

// GET /api/chats/:id/messages
chat.get('/:id/messages', async (c) => {
  const workspaceId = c.get('workspaceId')
  const chatId = c.req.param('id')
  const owner = await c.env.DB.prepare('SELECT id FROM chats WHERE id = ? AND workspace_id = ?').bind(chatId, workspaceId).first()
  if (!owner) return c.json({ error: 'Chat not found in workspace.' }, 404)
  const { results } = await c.env.DB.prepare('SELECT id, role, content, tool_name, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC').bind(chatId).all()
  return c.json({ messages: results })
})

// POST /api/chats/:id/messages - send a message, get a real LLM reply (with tool-calling + RAG), single JSON response.
chat.post('/:id/messages', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const chatId = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return c.json({ error: 'Field "text" is required.' }, 400)

  const chatRow = await c.env.DB.prepare('SELECT id, title FROM chats WHERE id = ? AND workspace_id = ?').bind(chatId, workspaceId).first<{ id: string; title: string }>()
  if (!chatRow) return c.json({ error: 'Chat not found in workspace.' }, 404)

  const now = nowIso()
  const userMsgId = newId('msg')
  await c.env.DB.prepare('INSERT INTO messages (id, chat_id, workspace_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(userMsgId, chatId, workspaceId, 'user', text, now)
    .run()
  upsertEmbedding(c.env, c.env.DB, { workspaceId, ownerType: 'message', ownerId: userMsgId, content: text }).catch(() => {})

  if (chatRow.title === 'New conversation') {
    await c.env.DB.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').bind(text.slice(0, 40), now, chatId).run()
  }

  const messages = await buildContextMessages(c.env, c.env.DB, workspaceId, chatId, text)

  let toolUsed: string | undefined
  let finalText = ''
  try {
    for (let i = 0; i < 4; i++) {
      const completion = await chatComplete(c.env, { messages, tools: chatTools, toolChoice: 'auto', temperature: 0.5 })
      const { message } = completion
      messages.push(message)
      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }
          toolUsed = call.function.name
          const outcome = await runTool(call.function.name, args, { env: c.env, workspaceId, actorId, db: c.env.DB })
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome), name: call.function.name })
        }
        continue
      }
      finalText = typeof message.content === 'string' ? message.content : ''
      break
    }
  } catch (error) {
    finalText = `Sorry, I hit an error talking to the language model: ${error instanceof Error ? error.message : 'unknown error'}`
  }

  const assistantMsgId = newId('msg')
  await c.env.DB.prepare('INSERT INTO messages (id, chat_id, workspace_id, role, content, tool_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(assistantMsgId, chatId, workspaceId, 'assistant', finalText, toolUsed ?? null, nowIso())
    .run()
  await c.env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(nowIso(), chatId).run()

  return c.json({
    userMessage: { id: userMsgId, role: 'user', text, createdAt: now },
    assistantMessage: { id: assistantMsgId, role: 'assistant', text: finalText, tool: toolUsed, createdAt: nowIso() },
  })
})

// POST /api/chats/:id/stream - Server-Sent Events streaming variant. Emits
// { type: 'delta', text } chunks as they arrive from the LLM, then a final
// { type: 'done', assistantMessage } event once the message is persisted.
// This is a real token stream (from streamChatComplete), not a fake chunked replay.
chat.post('/:id/stream', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const chatId = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return c.json({ error: 'Field "text" is required.' }, 400)

  const chatRow = await c.env.DB.prepare('SELECT id, title FROM chats WHERE id = ? AND workspace_id = ?').bind(chatId, workspaceId).first<{ id: string; title: string }>()
  if (!chatRow) return c.json({ error: 'Chat not found in workspace.' }, 404)

  const now = nowIso()
  const userMsgId = newId('msg')
  await c.env.DB.prepare('INSERT INTO messages (id, chat_id, workspace_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(userMsgId, chatId, workspaceId, 'user', text, now)
    .run()
  upsertEmbedding(c.env, c.env.DB, { workspaceId, ownerType: 'message', ownerId: userMsgId, content: text }).catch(() => {})
  if (chatRow.title === 'New conversation') {
    await c.env.DB.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').bind(text.slice(0, 40), now, chatId).run()
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'user_message', data: JSON.stringify({ id: userMsgId, role: 'user', text, createdAt: now }) })

    const messages = await buildContextMessages(c.env, c.env.DB, workspaceId, chatId, text)
    let finalText = ''
    let toolUsed: string | undefined

    try {
      for (let round = 0; round < 4; round++) {
        let sawToolCall = false
        let roundContent = ''
        const generator = streamChatComplete(c.env, { messages, tools: chatTools, toolChoice: 'auto', temperature: 0.5 })
        let doneMessage: LlmMessage | null = null

        for await (const event of generator) {
          if (event.type === 'delta') {
            roundContent += event.text
            await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: event.text }) })
          } else {
            doneMessage = event.message
          }
        }

        if (!doneMessage) break
        messages.push(doneMessage)

        if (doneMessage.tool_calls?.length) {
          sawToolCall = true
          for (const call of doneMessage.tool_calls) {
            let args: Record<string, unknown> = {}
            try { args = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }
            toolUsed = call.function.name
            await stream.writeSSE({ event: 'tool_call', data: JSON.stringify({ tool: call.function.name, args }) })
            const outcome = await runTool(call.function.name, args, { env: c.env, workspaceId, actorId, db: c.env.DB })
            await stream.writeSSE({ event: 'tool_result', data: JSON.stringify(outcome) })
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome), name: call.function.name })
          }
        }
        finalText = roundContent || finalText
        if (!sawToolCall) break
      }
    } catch (error) {
      finalText = `Sorry, I hit an error talking to the language model: ${error instanceof Error ? error.message : 'unknown error'}`
      await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: finalText }) })
    }

    const assistantMsgId = newId('msg')
    await c.env.DB.prepare('INSERT INTO messages (id, chat_id, workspace_id, role, content, tool_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(assistantMsgId, chatId, workspaceId, 'assistant', finalText, toolUsed ?? null, nowIso())
      .run()
    await c.env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(nowIso(), chatId).run()

    await stream.writeSSE({
      event: 'done',
      data: JSON.stringify({ assistantMessage: { id: assistantMsgId, role: 'assistant', text: finalText, tool: toolUsed, createdAt: nowIso() } }),
    })
  })
})

chat.delete('/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const chatId = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM messages WHERE chat_id = ? AND workspace_id = ?').bind(chatId, workspaceId).run()
  const result = await c.env.DB.prepare('DELETE FROM chats WHERE id = ? AND workspace_id = ?').bind(chatId, workspaceId).run()
  if (!result.meta.changes) return c.json({ error: 'Chat not found in workspace.' }, 404)
  await appendAudit(c.env.DB, { workspaceId, actorId: c.get('actorId'), action: 'chat.deleted', resource: 'chat', resourceId: chatId })
  return c.json({ deleted: true })
})

export default chat
