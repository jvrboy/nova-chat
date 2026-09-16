import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings, DEFAULT_SETTINGS } from "@/lib/storage";

export const runtime = "edge";

export async function GET() {
  try {
    const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
    return NextResponse.json({ settings });
  } catch (e: any) {
    return NextResponse.json({ settings: DEFAULT_SETTINGS, error: e.message });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    await updateSettings(body);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return PUT(req);
}
