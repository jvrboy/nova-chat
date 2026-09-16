// Server-only artifact persistence — imports storage which uses Supabase.
// NEVER import from client components.

import "server-only";
import { createArtifact } from "@/lib/storage";
import { type ArtifactSpec, getArtifactMime } from "./index";

function byteLength(s: string): number {
  // Edge-compatible: use TextEncoder when Buffer isn't available
  if (typeof Buffer !== "undefined") return Buffer.byteLength(s);
  return new TextEncoder().encode(s).length;
}

export async function saveArtifact(
  chatId: string | undefined,
  messageId: string | undefined,
  spec: ArtifactSpec
): Promise<string> {
  const row = await createArtifact({
    chatId,
    messageId,
    title: spec.title,
    type: spec.type,
    language: spec.language,
    content: spec.content,
    mimeType: spec.mimeType || getArtifactMime(spec.type, spec.language),
    bytes: byteLength(spec.content),
    tags: spec.tags || [],
  });
  return row.id;
}
