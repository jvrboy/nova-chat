import { NextRequest, NextResponse } from "next/server";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";
import { SCHEMA_SQL } from "@/lib/supabase/schema-constants";

export const runtime = "edge";

export async function GET() {
  // Status of the deployment — what backends are configured
  const supabaseConfigured = isSupabaseServerConfigured();
  return NextResponse.json({
    supabase: supabaseConfigured ? "configured" : "not_configured",
    storage: supabaseConfigured ? "supabase" : "in-memory",
    message: supabaseConfigured
      ? "Connected to Supabase — all data is persisted remotely."
      : "Supabase not configured — using in-memory storage for preview (resets on restart). Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY to enable Supabase persistence.",
    schemaUrl: "/api/setup",
  });
}

export async function POST() {
  // Return the SQL schema for the user to run in Supabase SQL editor
  return NextResponse.json({ sql: SCHEMA_SQL });
}
