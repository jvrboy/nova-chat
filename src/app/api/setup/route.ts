import { NextRequest, NextResponse } from "next/server";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { isKvStorageConfigured } from "@/lib/storage-kv";
import { SCHEMA_SQL } from "@/lib/supabase/schema-constants";

export const runtime = "edge";

export async function GET() {
  const supabaseConfigured = isSupabaseServerConfigured();
  const kvConfigured = isKvStorageConfigured();
  const backend = supabaseConfigured ? "supabase" : kvConfigured ? "cloudflare-kv" : "in-memory";
  return NextResponse.json({
    supabase: supabaseConfigured ? "configured" : "not_configured",
    cloudflareKv: kvConfigured ? "configured" : "not_configured",
    storage: backend,
    message: supabaseConfigured
      ? "Connected to Supabase — all data persists in Postgres."
      : kvConfigured
      ? "Connected to Cloudflare KV — all data persists across worker instances."
      : "Using in-memory storage (local dev only — resets on restart). Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY for Supabase, or CLOUDFLARE_KV_NAMESPACE_ID + CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID for KV persistence.",
    schemaUrl: "/api/setup",
  });
}

export async function POST() {
  return NextResponse.json({ sql: SCHEMA_SQL });
}
