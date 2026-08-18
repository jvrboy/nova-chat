import { Router } from "express";
import { invokeLLM } from "./llm";
import { getAuthenticatedUser } from "./context";
import { ENV } from "./env";

export const streamRouter = Router();

streamRouter.post("/api/ai/stream", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { model, system, messages } = req.body as { model?: string; system?: string; messages: Array<{ role: string; content: string }> };
    if (!messages?.length) {
      res.status(400).json({ error: "Messages are required" });
      return;
    }
    const apiUrl = ENV.forgeApiUrl?.replace(/\/$/, "") ?? "https://forge.manus.im";
    const response = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify({
        model: model || "nova-2",
        stream: true,
        messages: [
          { role: "system", content: system ?? "You are Nova, a thoughtful and concise AI assistant. Use markdown when it improves clarity." },
          ...messages,
        ],
      }),
    });
    if (!response.ok || !response.body) {
      res.status(502).json({ error: "Upstream LLM error" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch {
      // Client disconnected
    }
    res.end();
  } catch (error) {
    console.error("[Stream] Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Stream failed" });
    }
  }
});
