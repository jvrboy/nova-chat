// Expanded Supabase integration: generic PostgREST access (read/write on
// tables the user creates in their own Supabase project) plus multi-project
// pooling so up to 10 Supabase accounts/projects can be spread across for
// throughput/redundancy, not just the single BYOK vector-store slot that
// embeddings.ts already had.
//
// Auth: every request needs both headers:
//   apikey:        <service_role_key>   (identifies the Supabase project)
//   Authorization: Bearer <service_role_key>
// Get these from https://app.supabase.com -> your project -> Project Settings
// -> API: "Project URL" and the "service_role" secret key (NOT the public
// anon key — the service role key is required for server-side writes that
// bypass Row Level Security, since this Worker is a trusted backend).
//
// Multi-project pooling: set SUPABASE_ACCOUNTS_JSON to a JSON array of
// { "url": "...", "serviceKey": "...", "label": "..." } — used for both the
// existing vector-RAG store (embeddings.ts) and the new generic KV/table
// tools below. When only a single project is needed, SUPABASE_URL +
// SUPABASE_SERVICE_KEY (already documented in wrangler.jsonc) keep working
// unchanged.
import type { Bindings } from './types'
import { parsePool, pickPoolEntry, poolSummary } from './credentialPool'

export type SupabaseAccount = { url: string; serviceKey: string; label?: string }

export function supabasePoolFromEnv(env: Bindings): SupabaseAccount[] {
  const pooled = parsePool(env.SUPABASE_ACCOUNTS_JSON)
    .filter((e) => e.url && e.serviceKey)
    .map((e) => ({ url: e.url, serviceKey: e.serviceKey, label: e.label })) as SupabaseAccount[]
  if (pooled.length) return pooled
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) return [{ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY }]
  return []
}

export function supabaseStatus(env: Bindings) {
  return poolSummary(supabasePoolFromEnv(env) as unknown as Record<string, string>[], 'label')
}

/** Picks one configured Supabase project. `sticky` (e.g. a workspaceId) makes
 * the same project always chosen for that key — useful for embeddings, where
 * a given workspace's vectors must land in one project consistently rather
 * than being scattered round-robin (which would break retrieval). Omit
 * `sticky` for pure load-spreading (e.g. read-heavy generic queries). */
export async function pickSupabaseProject(
  env: Bindings,
  db: D1Database | undefined,
  opts: { sticky?: string } = {}
): Promise<SupabaseAccount> {
  const accounts = supabasePoolFromEnv(env)
  if (!accounts.length) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL + SUPABASE_SERVICE_KEY (single project) or SUPABASE_ACCOUNTS_JSON (multi-project pool) as Worker secrets. Get these from app.supabase.com -> Project Settings -> API.'
    )
  }
  if (accounts.length === 1) return accounts[0]
  if (opts.sticky) {
    // Deterministic hash-based pin so the same workspace always lands on the
    // same project (stable sharding), independent of the round-robin cursor.
    let hash = 0
    for (let i = 0; i < opts.sticky.length; i++) hash = (hash * 31 + opts.sticky.charCodeAt(i)) >>> 0
    return accounts[hash % accounts.length]
  }
  const picked = await pickPoolEntry(db, 'supabase', accounts as unknown as Record<string, string>[])
  return (picked?.entry as unknown as SupabaseAccount) ?? accounts[0]
}

function headers(account: SupabaseAccount, extra: Record<string, string> = {}) {
  return {
    apikey: account.serviceKey,
    Authorization: `Bearer ${account.serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

/** Generic read against any PostgREST table the user has created in their
 * Supabase project (e.g. `nova_kv`, or their own app tables). Supports basic
 * PostgREST filter syntax passed straight through as query params, e.g.
 * { id: 'eq.123' } -> ?id=eq.123. This intentionally does NOT allow arbitrary
 * SQL — only whatever the project's PostgREST/RLS policy already exposes. */
export async function supabaseSelect(
  env: Bindings,
  db: D1Database | undefined,
  table: string,
  opts: { filters?: Record<string, string>; select?: string; limit?: number; order?: string; sticky?: string } = {}
): Promise<Record<string, unknown>[]> {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error('Invalid table name.')
  const account = await pickSupabaseProject(env, db, { sticky: opts.sticky })
  const params = new URLSearchParams(opts.filters ?? {})
  if (opts.select) params.set('select', opts.select)
  if (opts.limit) params.set('limit', String(Math.min(Math.max(opts.limit, 1), 200)))
  if (opts.order) params.set('order', opts.order)
  const response = await fetch(`${account.url}/rest/v1/${table}?${params.toString()}`, { headers: headers(account) })
  if (!response.ok) throw new Error(`Supabase select failed: ${response.status} ${await response.text().catch(() => '')}`)
  return (await response.json()) as Record<string, unknown>[]
}

/** Generic upsert (insert or merge-on-conflict) against a PostgREST table. */
export async function supabaseUpsert(
  env: Bindings,
  db: D1Database | undefined,
  table: string,
  rows: Record<string, unknown>[],
  opts: { onConflict?: string; sticky?: string } = {}
): Promise<Record<string, unknown>[]> {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error('Invalid table name.')
  const account = await pickSupabaseProject(env, db, { sticky: opts.sticky })
  const params = new URLSearchParams()
  if (opts.onConflict) params.set('on_conflict', opts.onConflict)
  const response = await fetch(`${account.url}/rest/v1/${table}?${params.toString()}`, {
    method: 'POST',
    headers: headers(account, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(rows),
  })
  if (!response.ok) throw new Error(`Supabase upsert failed: ${response.status} ${await response.text().catch(() => '')}`)
  return (await response.json()) as Record<string, unknown>[]
}

/** Generic delete against a PostgREST table, scoped by filters (required —
 * refuses to run an unfiltered delete that would wipe the whole table). */
export async function supabaseDelete(
  env: Bindings,
  db: D1Database | undefined,
  table: string,
  filters: Record<string, string>,
  opts: { sticky?: string } = {}
): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error('Invalid table name.')
  if (!Object.keys(filters).length) throw new Error('Refusing to delete without at least one filter.')
  const account = await pickSupabaseProject(env, db, { sticky: opts.sticky })
  const params = new URLSearchParams(filters)
  const response = await fetch(`${account.url}/rest/v1/${table}?${params.toString()}`, {
    method: 'DELETE',
    headers: headers(account),
  })
  if (!response.ok) throw new Error(`Supabase delete failed: ${response.status} ${await response.text().catch(() => '')}`)
}

/** Uploads a file to Supabase Storage (an alternative/supplement to R2, useful
 * if the user wants files replicated to Supabase too, or R2 isn't bound). */
export async function supabaseStorageUpload(
  env: Bindings,
  db: D1Database | undefined,
  bucket: string,
  path: string,
  body: ArrayBuffer,
  contentType: string,
  opts: { sticky?: string } = {}
): Promise<{ path: string; publicUrl: string }> {
  const account = await pickSupabaseProject(env, db, { sticky: opts.sticky })
  const response = await fetch(`${account.url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: account.serviceKey, Authorization: `Bearer ${account.serviceKey}`, 'Content-Type': contentType },
    body,
  })
  if (!response.ok) throw new Error(`Supabase storage upload failed: ${response.status} ${await response.text().catch(() => '')}`)
  return { path, publicUrl: `${account.url}/storage/v1/object/public/${bucket}/${path}` }
}
