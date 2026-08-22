import type { Context, Next } from 'hono'
import type { AppEnv } from './types'

const DEFAULT_LIMIT_PER_MINUTE = 120

/**
 * Fixed-window rate limiter backed by D1. The counter is incremented with a
 * single atomic UPSERT (…ON CONFLICT DO UPDATE … RETURNING), so concurrent
 * requests can no longer race past the limit via read-modify-write. Still
 * keyed by API key when present, otherwise by workspace, so the
 * single-workspace dev/header mode gets *some* protection instead of being
 * fully exempt. Swap for Durable Objects if you need strict global ordering
 * at very high volume — for counting, this statement is atomic.
 */
export function rateLimit(perMinute?: number) {
  return async (c: Context<AppEnv>, next: Next) => {
    const limit = perMinute ?? (Number(c.env.RATE_LIMIT_PER_MINUTE) || DEFAULT_LIMIT_PER_MINUTE)
    const bucketKey = c.get('apiKeyId') ? `key:${c.get('apiKeyId')}` : `ws:${c.get('workspaceId')}`
    const windowStart = Math.floor(Date.now() / 60_000) * 60_000

    try {
      const result = await c.env.DB.prepare(
        `INSERT INTO rate_limits (bucket_key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = count + 1
         RETURNING count`
      )
        .bind(bucketKey, windowStart)
        .first<{ count: number }>()

      const count = result?.count ?? 1
      if (count > limit) {
        c.header('Retry-After', String(Math.ceil((windowStart + 60_000 - Date.now()) / 1000)))
        return c.json({ error: 'Rate limit exceeded. Slow down and try again shortly.', limitPerMinute: limit }, 429)
      }

      // Opportunistically clear old windows so the table doesn't grow forever.
      if (count === 1) {
        c.env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(windowStart - 10 * 60_000).run().catch(() => {})
      }
    } catch {
      // Rate limiting must never be the reason a request fails outright.
    }

    await next()
  }
}
