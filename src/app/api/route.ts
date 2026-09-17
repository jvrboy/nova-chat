import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    name: "Nova Chat API",
    version: "1.0.0",
    endpoints: [
      "/api/chats",
      "/api/chats/:id",
      "/api/chat (POST - streaming)",
      "/api/messages",
      "/api/messages/:id",
      "/api/artifacts",
      "/api/artifacts/:id",
      "/api/artifacts/:id/download",
      "/api/settings",
      "/api/tools",
      "/api/tools/:tool",
      "/api/models",
      "/api/setup",
      "/api/setup/env",
    ],
  });
}
