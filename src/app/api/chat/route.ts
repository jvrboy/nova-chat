import { NextRequest } from "next/server";
import { getChat, createMessage, updateMessage, getSettings } from "@/lib/storage";
import { parseArtifactsFromMarkdown, inferTitle } from "@/lib/artifacts";
import { saveArtifact } from "@/lib/artifacts/server";
import { executeTool, TOOLS } from "@/lib/tools";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  chatId: string;
  message: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  toolsEnabled?: boolean;
  systemPrompt?: string;
}

/**
 * Edge-compatible LLM streaming — supports multiple providers.
 * Priority: Z.AI (internal) → OpenAI-compatible → demo mode
 */
async function streamChatCompletion(opts: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  onDelta: (content: string) => void;
  onFinish: (reason: string | null, fullContent: string, tokens: number) => void;
  onError: (err: Error) => void;
}) {
  let hadError = false;
  let lastError: Error | null = null;
  const wrappedOnError = (err: Error) => {
    hadError = true;
    lastError = err;
  };

  // Try Z.AI first (if configured — works in sandbox, may fail on Cloudflare due to IP restrictions)
  if (process.env.ZAI_API_KEY || process.env.ZAI_TOKEN) {
    hadError = false;
    try {
      await streamZaiChatCompletion({ ...opts, onError: wrappedOnError });
      if (!hadError) return;
      console.log("Z.AI failed, falling through to OpenAI/demo");
    } catch (e: any) {
      hadError = true;
      lastError = e;
    }
  }
  // Try OpenAI-compatible endpoint
  if (process.env.OPENAI_API_KEY) {
    hadError = false;
    try {
      await streamOpenAiChatCompletion({ ...opts, onError: wrappedOnError });
      if (!hadError) return;
    } catch (e: any) {
      hadError = true;
      lastError = e;
    }
  }
  // Demo mode — generate a canned response so the UI is still usable
  const demoContent = generateDemoResponse(opts.messages);
  for (const chunk of demoContent.split(" ")) {
    opts.onDelta(chunk + " ");
    await new Promise((r) => setTimeout(r, 20));
  }
  opts.onFinish("stop", demoContent, demoContent.split("").length);
}

async function streamOpenAiChatCompletion(opts: any) {
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      stream: true,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI API ${res.status}: ${txt.slice(0, 200)}`);
  }
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let finishReason: string | null = null;
  let tokens = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const ev of events) {
      const lines = ev.split("\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const dataStr = line.slice(5).trim();
          if (dataStr === "[DONE]") continue;
          try {
            const chunk = JSON.parse(dataStr);
            const delta = chunk?.choices?.[0]?.delta;
            if (delta?.content) {
              fullContent += delta.content;
              tokens += 1;
              opts.onDelta(delta.content);
            }
            if (chunk?.choices?.[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
            }
          } catch {}
        }
      }
    }
  }
  opts.onFinish(finishReason, fullContent, tokens);
}

function generateDemoResponse(messages: any[]): string {
  const last = messages[messages.length - 1];
  const content = last?.content || "";
  return `I received your message: "${content.slice(0, 100)}".

**Note**: This is demo mode — no LLM provider is configured for production. To enable real AI responses:

1. **Z.AI (sandbox)**: Set \`ZAI_API_KEY\`, \`ZAI_TOKEN\`, \`ZAI_CHAT_ID\`, \`ZAI_USER_ID\`, \`ZAI_BASE_URL\` as Cloudflare Pages secrets. (Note: Z.AI internal API may have IP restrictions outside the sandbox.)

2. **OpenAI-compatible**: Set \`OPENAI_API_KEY\` (and optionally \`OPENAI_BASE_URL\`, \`OPENAI_MODEL\`) for OpenAI, Azure OpenAI, Together AI, Groq, Ollama, LM Studio, etc.

\`\`\`artifact:markdown
# Setup Instructions

## Option 1: OpenAI (recommended for production)

\`\`\`bash
# Set these as Cloudflare Pages secrets
wrangler pages secret put OPENAI_API_KEY --project-name nova-chat
# Optional:
wrangler pages secret put OPENAI_BASE_URL --project-name nova-chat  # default: https://api.openai.com/v1
wrangler pages secret put OPENAI_MODEL --project-name nova-chat      # default: gpt-4o-mini
\`\`\`

## Option 2: OpenAI-compatible providers

- Together AI: \`OPENAI_BASE_URL=https://api.together.xyz/v1\`, \`OPENAI_MODEL=meta-llama/Llama-3-70B\`
- Groq: \`OPENAI_BASE_URL=https://api.groq.com/openai/v1\`, \`OPENAI_MODEL=llama-3.1-70b-versatile\`
- Ollama (local): \`OPENAI_BASE_URL=http://localhost:11434/v1\`, \`OPENAI_MODEL=llama3\`
\`\`\`

The artifact system still works — ask me to generate code, JSON, CSV, SVG, HTML, or markdown and you'll get a real, downloadable file persisted to Cloudflare KV.`;
}

/**
 * Z.AI direct fetch (bypasses SDK which uses Node's fs/os — works on edge runtime).
 */
async function streamZaiChatCompletion(opts: any) {
  const baseUrl = process.env.ZAI_BASE_URL || "https://internal-api.z.ai/v1";
  const apiKey = process.env.ZAI_API_KEY || process.env.ZAI_TOKEN || "Z.ai";
  const token = process.env.ZAI_TOKEN;
  const chatId = process.env.ZAI_CHAT_ID;
  const userId = process.env.ZAI_USER_ID;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "X-Z-AI-From": "Z",
  };
  if (token) headers["X-Token"] = token;
  if (chatId) headers["X-Chat-Id"] = chatId;
  if (userId) headers["X-User-Id"] = userId;

  let fullContent = "";
  let finishReason: string | null = null;
  let tokens = 0;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        stream: true,
        thinking: { type: "disabled" },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Z.AI API ${res.status}: ${txt.slice(0, 200)}`);
    }
    if (!res.body) throw new Error("No response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const ev of events) {
        const lines = ev.split("\n").filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const chunk = JSON.parse(dataStr);
              const delta = chunk?.choices?.[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                tokens += 1;
                opts.onDelta(delta.content);
              }
              if (chunk?.choices?.[0]?.finish_reason) {
                finishReason = chunk.choices[0].finish_reason;
              }
              if (chunk?.usage?.completion_tokens) {
                tokens = chunk.usage.completion_tokens;
              }
            } catch {
              // skip non-JSON
            }
          }
        }
      }
    }
    opts.onFinish(finishReason, fullContent, tokens);
  } catch (e: any) {
    opts.onError(e);
  }
}

/**
 * Streaming chat endpoint — SSE format.
 * 1. Load chat + recent messages from persistent storage.
 * 2. Insert user message.
 * 3. Stream assistant response tokens via SSE.
 * 4. Parse artifact blocks; persist artifacts; attach IDs to the assistant message.
 * 5. Optionally invoke tools and stream tool output too.
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(ev: string, data: any) {
        const payload = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }
      try {
        const body = (await req.json()) as ChatRequestBody;
        if (!body.chatId || !body.message) {
          sendEvent("error", { error: "chatId and message are required" });
          controller.close();
          return;
        }
        // Try to load the chat — if not found (e.g. cross-worker memory), create it
        let chat = await getChat(body.chatId);
        if (!chat) {
          // Create on-the-fly so this worker has the chat
          chat = await createChat({
            title: body.message.slice(0, 60) || "New chat",
            model: body.model || "glm-4.6",
            systemPrompt: body.systemPrompt,
          });
          // Use the new chat ID for the rest of this request
          body.chatId = chat.id;
        }
        // 1. Persist user message
        const userMsg = await createMessage({
          chatId: body.chatId,
          role: "user",
          content: body.message,
          status: "complete",
        });
        sendEvent("user-message", { id: userMsg.id, content: body.message });

        // 2. Load recent context (last 30 turns)
        const recent = await getRecentMessagesForPrompt(body.chatId, 30);

        const settings = await getSettings().catch(() => null);
        const model = body.model || chat.model || settings?.defaultModel || "glm-4.6";
        const temperature = body.temperature ?? chat.temperature ?? settings?.defaultTemperature ?? 0.7;
        const maxTokens = body.maxTokens ?? chat.maxTokens ?? settings?.defaultMaxTokens ?? 4096;

        // 3. Build prompt messages
        const systemPrompt =
          body.systemPrompt ||
          chat.systemPrompt ||
          `You are Nova, an advanced AI assistant with real-time capabilities. You can:
- Generate real, downloadable artifacts (markdown docs, code, JSON, CSV, SVG, HTML, etc.) by wrapping them in fenced code blocks tagged with \`artifact:<type>\` (and optional language, like \`artifact:code:typescript\`).
- Invoke backend tools (web search, calculator, image generation, UUID, hashing, etc.) — they run server-side and the output appears in the conversation.
- Maintain memory across messages and chats.

When the user asks for a document, code file, or any kind of artifact, produce it inside an artifact block so it is saved as a real file the user can download.

Examples:
\`\`\`artifact:code:typescript
export const add = (a: number, b: number) => a + b;
\`\`\`

\`\`\`artifact:markdown
# Hello World
This is a markdown artifact.
\`\`\`

Be concise, friendly, and proactive.`;

        const promptMessages: any[] = [
          { role: "system", content: systemPrompt },
          ...recent.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          { role: "user", content: body.message },
        ];

        // 4. Create placeholder assistant message
        const assistantMsg = await createMessage({
          chatId: body.chatId,
          role: "assistant",
          content: "",
          status: "streaming",
          model,
        });
        sendEvent("assistant-start", { id: assistantMsg.id, model });

        // 5. Stream completion via best-available LLM provider
        let fullContent = "";
        let tokensOut = 0;
        let finishReason: string | null = null;
        await streamChatCompletion({
          model,
          messages: promptMessages,
          temperature,
          maxTokens: maxTokens,
          onDelta: (delta) => {
            fullContent += delta;
            tokensOut += 1;
            sendEvent("delta", { id: assistantMsg.id, content: delta });
          },
          onFinish: (reason, _content, tokens) => {
            finishReason = reason;
            tokensOut = tokens || tokensOut;
          },
          onError: (err) => {
            sendEvent("error", { error: `LLM error: ${err.message}`, id: assistantMsg.id });
          },
        });

        // 6. Parse artifacts out of the response and persist them
        const parsed = parseArtifactsFromMarkdown(fullContent);
        const artifactIds: string[] = [];
        for (const p of parsed) {
          try {
            const aid = await saveArtifact(body.chatId, assistantMsg.id, {
              title: inferTitle(p.content, p.type),
              type: p.type as any,
              language: p.language,
              content: p.content,
              tags: [p.type, p.language].filter(Boolean),
            });
            artifactIds.push(aid);
            sendEvent("artifact", {
              id: aid,
              messageId: assistantMsg.id,
              type: p.type,
              language: p.language,
              title: inferTitle(p.content, p.type),
            });
          } catch (e: any) {
            sendEvent("error", { error: `Failed to save artifact: ${e.message}` });
          }
        }

        // 7. Update assistant message final content
        await updateMessage(assistantMsg.id, {
          content: fullContent,
          status: "complete",
          tokensOut,
          finishReason,
          artifactIds,
        });

        sendEvent("assistant-end", {
          id: assistantMsg.id,
          content: fullContent,
          tokensOut,
          finishReason,
          artifactIds,
        });

        // 8. Auto-title the chat if it's still "New chat"
        if (chat.title === "New chat" && fullContent) {
          const newTitle = body.message.slice(0, 60);
          await updateChatTitle(body.chatId, newTitle);
        }

        controller.close();
      } catch (err: any) {
        try {
          sendEvent("error", { error: err.message });
        } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function getRecentMessagesForPrompt(chatId: string, limit: number) {
  const { listMessages } = await import("@/lib/storage");
  const msgs = await listMessages(chatId, limit * 2);
  return msgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-limit);
}

async function updateChatTitle(chatId: string, title: string) {
  const { updateChat } = await import("@/lib/storage");
  await updateChat(chatId, { title });
}
