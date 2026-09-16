import { NextRequest, NextResponse } from "next/server";
import { updateMessage } from "@/lib/storage";

export const runtime = "edge";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await updateMessage(id, body);
  return NextResponse.json({ ok: true });
}
