import { NextRequest, NextResponse } from "next/server";
import { TOOLS, executeTool } from "@/lib/tools";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    tools: TOOLS.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      risk: t.risk,
      icon: t.icon,
      params: t.params,
    })),
  });
}

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
