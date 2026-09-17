"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;
let checked = false;

export function getSupabaseBrowser() {
  if (checked) return client;
  checked = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url === "" || anonKey === "") {
    client = null;
    return null;
  }
  try {
    client = createBrowserClient<Database>(url, anonKey);
  } catch {
    client = null;
  }
  return client;
}

export function isSupabaseConfigured() {
  return !!getSupabaseBrowser();
}
