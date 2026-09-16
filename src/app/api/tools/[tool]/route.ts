import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/tools";

export const runtime = "edge";

export async function POST(req: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await executeTool(tool, body.args || body, {
      chatId: body.chatId,
      userId: body.userId,
    });
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  return NextResponse.json({ tool, message: `POST args to invoke: ${tool}` });
}
