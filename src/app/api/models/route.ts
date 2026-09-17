import { NextResponse } from "next/server";

export const runtime = "edge";

// Available models — matches z-ai-web-dev-sdk
const MODELS = [
  { id: "glm-4.6", name: "GLM-4.6", context: "128K", description: "Most capable, general purpose", tier: "flagship" },
  { id: "glm-4.5-air", name: "GLM-4.5 Air", context: "128K", description: "Fast and efficient", tier: "fast" },
  { id: "glm-4.5", name: "GLM-4.5", context: "128K", description: "Balanced quality and speed", tier: "balanced" },
  { id: "glm-4-plus", name: "GLM-4 Plus", context: "128K", description: "Long-context flagship", tier: "long" },
  { id: "glm-4-air", name: "GLM-4 Air", context: "128K", description: "Lightweight and quick", tier: "fast" },
  { id: "glm-4-airx", name: "GLM-4 AirX", context: "8K", description: "Ultra-fast inference", tier: "fast" },
  { id: "glm-4-flash", name: "GLM-4 Flash", context: "128K", description: "Free tier, fast responses", tier: "free" },
  { id: "glm-4-flashx", name: "GLM-4 FlashX", context: "128K", description: "Free tier, faster", tier: "free" },
  { id: "glm-4-long", name: "GLM-4 Long", context: "1M", description: "Massive 1M token context", tier: "long" },
  { id: "glm-4v", name: "GLM-4V", context: "32K", description: "Vision-capable model", tier: "vision" },
  { id: "glm-4v-flash", name: "GLM-4V Flash", context: "32K", description: "Fast vision", tier: "vision" },
  { id: "glm-4v-plus", name: "GLM-4V Plus", context: "32K", description: "Best vision quality", tier: "vision" },
];

export async function GET() {
  return NextResponse.json({ models: MODELS });
}
