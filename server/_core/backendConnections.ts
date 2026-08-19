import { ENV } from "./env";

export type BackendConnectionStatus = {
  id: "cloudflare-workers" | "supabase";
  label: string;
  configured: boolean;
  endpoint: string | null;
  capabilities: string[];
};

export function listBackendConnections(): BackendConnectionStatus[] {
  return [
    { id: "cloudflare-workers", label: "Cloudflare Workers", configured: Boolean(ENV.cloudflareWorkerUrl && ENV.cloudflareWorkerToken), endpoint: ENV.cloudflareWorkerUrl || null, capabilities: ["edge backend", "scheduled jobs", "KV/R2/D1 adapters"] },
    { id: "supabase", label: "Supabase", configured: Boolean(ENV.supabaseUrl && ENV.supabaseAnonKey), endpoint: ENV.supabaseUrl || null, capabilities: ["Postgres", "auth", "storage", "realtime"] },
  ];
}

export async function probeBackendConnections() {
  const results: Array<BackendConnectionStatus & { healthy: boolean | null; status: number | null; error: string | null }> = [];
  for (const connection of listBackendConnections()) {
    if (!connection.configured || !connection.endpoint) { results.push({ ...connection, healthy: null, status: null, error: null }); continue; }
    try {
      const response = await fetch(connection.endpoint, { method: "GET", headers: connection.id === "supabase" ? { apikey: ENV.supabaseAnonKey } : undefined, signal: AbortSignal.timeout(4000) });
      results.push({ ...connection, healthy: response.ok, status: response.status, error: response.ok ? null : `HTTP ${response.status}` });
    } catch (error) {
      results.push({ ...connection, healthy: false, status: null, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
