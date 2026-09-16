import { NextRequest, NextResponse } from "next/server";
import { listArtifacts, createArtifact } from "@/lib/storage";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const chatId = url.searchParams.get("chatId") || undefined;
  const items = await listArtifacts(chatId);
  return NextResponse.json({ artifacts: items });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const row = await createArtifact({
      chatId: body.chatId,
      messageId: body.messageId,
      title: body.title,
      type: body.type,
      language: body.language,
      content: body.content || "",
      mimeType: body.mimeType,
      bytes: body.bytes,
      tags: body.tags,
    });
    return NextResponse.json({ artifact: row });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
