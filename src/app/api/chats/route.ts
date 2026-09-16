import { NextRequest, NextResponse } from "next/server";
import { listChats, createChat } from "@/lib/storage";

export const runtime = "edge";

export async function GET() {
  try {
    const chats = await listChats();
    return NextResponse.json({ chats });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const chat = await createChat({
      title: body.title,
      model: body.model,
      systemPrompt: body.systemPrompt,
    });
    return NextResponse.json({ chat });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
