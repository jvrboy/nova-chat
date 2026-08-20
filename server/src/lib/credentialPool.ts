// Generic multi-account credential pooling.
//
// The user has multiple accounts for several third-party services (e.g. 10
// Supabase projects, 10 Kaggle accounts, 5 E2B accounts). Rather than hard-code
// "account #1", each service's credentials are supplied as a single JSON-array
// secret (e.g. KAGGLE_ACCOUNTS_JSON), and this module round-robins across the
// array on every call using a durable counter in D1. This spreads request
// volume (and therefore rate limits/quotas) evenly across all configured
// accounts instead of hammering just one.
//
// Each secret is a JSON array of flat string-keyed objects, e.g.:
//   KAGGLE_ACCOUNTS_JSON = '[{"username":"acct1","key":"..."},{"username":"acct2","key":"..."}]'
//   E2B_ACCOUNTS_JSON    = '[{"apiKey":"e2b_..."},{"apiKey":"e2b_..."}]'
//   SUPABASE_ACCOUNTS_JSON = '[{"url":"https://xxx.supabase.co","serviceKey":"..."}]'
//
// A pool with zero or one entries still works (round-robin degenerates to
// "always use the only entry" or "not configured").

export type PoolEntry = Record<string, string>

export function parsePool(json: string | undefined): PoolEntry[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e) => e && typeof e === 'object')
  } catch {
    return []
  }
}

/** Picks the next entry from a pool using a durable round-robin cursor stored
 * in D1, so successive calls across separate Worker invocations still rotate
 * fairly rather than each one picking randomly or always index 0. Best-effort:
 * if the D1 write fails for any reason, falls back to a random pick so a
 * transient DB hiccup never blocks the underlying integration from working. */
export async function pickPoolEntry(
  db: D1Database | undefined,
  poolName: string,
  entries: PoolEntry[]
): Promise<{ entry: PoolEntry; index: number; poolSize: number } | undefined> {
  if (!entries.length) return undefined
  if (entries.length === 1) return { entry: entries[0], index: 0, poolSize: 1 }

  if (db) {
    try {
      const row = await db
        .prepare('SELECT cursor FROM credential_rotation WHERE pool_name = ?')
        .bind(poolName)
        .first<{ cursor: number }>()
      const current = row?.cursor ?? 0
      const next = (current + 1) % entries.length
      await db
        .prepare(
          'INSERT INTO credential_rotation (pool_name, cursor) VALUES (?, ?) ON CONFLICT(pool_name) DO UPDATE SET cursor = excluded.cursor'
        )
        .bind(poolName, next)
        .run()
      return { entry: entries[current % entries.length], index: current % entries.length, poolSize: entries.length }
    } catch {
      // fall through to random pick below
    }
  }
  const index = Math.floor(Math.random() * entries.length)
  return { entry: entries[index], index, poolSize: entries.length }
}

/** Read-only introspection used by the `provider-status` tool: reports pool
 * sizes and (non-secret) labels without ever returning key material. */
export function poolSummary(entries: PoolEntry[], labelKey = 'label') {
  return {
    configured: entries.length > 0,
    accountCount: entries.length,
    labels: entries.map((e, i) => (typeof e[labelKey] === 'string' && e[labelKey] ? e[labelKey] : `account-${i + 1}`)),
  }
}
