import { NextRequest, NextResponse } from "next/server";
import { createMessage, updateMessage } from "@/lib/storage";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const msg = await createMessage({
      chatId: body.chatId,
      role: body.role || "user",
      content: body.content || "",
      status: body.status,
      model: body.model,
      toolName: body.toolName,
      toolInput: body.toolInput,
      toolOutput: body.toolOutput,
      artifactIds: body.artifactIds,
    });
    return NextResponse.json({ message: msg });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
