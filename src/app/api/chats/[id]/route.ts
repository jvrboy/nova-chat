import { NextRequest, NextResponse } from "next/server";
import { getChat, updateChat, deleteChat, listMessages } from "@/lib/storage";

export const runtime = "edge";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = await getChat(id);
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const messages = await listMessages(id);
  return NextResponse.json({ chat, messages });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await updateChat(id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteChat(id);
  return NextResponse.json({ ok: true });
}
