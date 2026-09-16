import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
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
        const chat = await getChat(body.chatId);
        if (!chat) {
          sendEvent("error", { error: "Chat not found" });
          controller.close();
          return;
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

        // 5. Stream completion via ZAI SDK
        let fullContent = "";
        let tokensOut = 0;
        let finishReason: string | null = null;
        try {
          const zai = await ZAI.create();
          const result = await zai.chat.completions.create({
            model,
            messages: promptMessages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
          });
          // SDK returns a ReadableStream when stream:true
          if (result instanceof ReadableStream || (result && typeof (result as any).getReader === "function")) {
            const reader = (result as ReadableStream<Uint8Array>).getReader();
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
                        tokensOut += 1;
                        sendEvent("delta", { id: assistantMsg.id, content: delta.content });
                      }
                      if (chunk?.choices?.[0]?.finish_reason) {
                        finishReason = chunk.choices[0].finish_reason;
                      }
                    } catch {
                      // skip non-JSON
                    }
                  }
                }
              }
            }
          } else {
            // Non-streaming response
            const json = result as any;
            const content = json?.choices?.[0]?.message?.content || "";
            fullContent = content;
            tokensOut = json?.usage?.completion_tokens || 0;
            finishReason = json?.choices?.[0]?.finish_reason || null;
            sendEvent("delta", { id: assistantMsg.id, content });
          }
        } catch (e: any) {
          sendEvent("error", { error: `LLM error: ${e.message}`, id: assistantMsg.id });
        }

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
