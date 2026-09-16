import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  // Public env (safe to expose)
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "configured" : "",
    appName: "Nova Chat",
    version: "1.0.0",
    cloudflare: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ? "configured" : "",
    },
  });
}
