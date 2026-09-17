import { NextRequest, NextResponse } from "next/server";
import { getArtifact, updateArtifact, deleteArtifact } from "@/lib/storage";
import { getArtifactExt } from "@/lib/artifacts";

export const runtime = "edge";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artifact = await getArtifact(id);
  if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ artifact });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await updateArtifact(id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteArtifact(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await updateArtifact(id, body);
  return NextResponse.json({ ok: true });
}

// Force dynamic to avoid caching the file response
export const dynamic = "force-dynamic";

// Helper used by download route — exported here so the file is single-source for ext lookup.
export function downloadExt(artifact: { type: string; language?: string | null }) {
  return getArtifactExt(artifact.type, artifact.language || undefined);
}
