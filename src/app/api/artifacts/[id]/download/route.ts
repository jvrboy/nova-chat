import { NextRequest, NextResponse } from "next/server";
import { getArtifact } from "@/lib/storage";
import { getArtifactExt, getArtifactMime } from "@/lib/artifacts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function byteLength(s: string): number {
  if (typeof Buffer !== "undefined") return Buffer.byteLength(s);
  return new TextEncoder().encode(s).length;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artifact = await getArtifact(id);
  if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ext = getArtifactExt(artifact.type, artifact.language || undefined);
  const mime = artifact.mimeType || getArtifactMime(artifact.type, artifact.language || undefined);
  const safeTitle = (artifact.title || "artifact").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase().slice(0, 80);
  const filename = `${safeTitle}.${ext}`;

  // Return as a downloadable file with proper headers
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": String(artifact.bytes || byteLength(artifact.content)),
    "Cache-Control": "private, max-age=0",
  };

  return new NextResponse(artifact.content, { status: 200, headers });
}
