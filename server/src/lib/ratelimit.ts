import type { Context, Next } from 'hono'
import type { AppEnv } from './types'

const DEFAULT_LIMIT_PER_MINUTE = 120

/**
 * Fixed-window rate limiter backed by D1 (works fine at the sub-thousand
 * req/min scale this app targets; swap for Durable Objects if you need
 * strict global atomicity at higher volume). Keyed by API key when present,
 * otherwise by workspace, so the single-workspace dev/header mode still gets
 * *some* protection instead of being fully exempt.
 */
export function rateLimit(perMinute?: number) {
  return async (c: Context<AppEnv>, next: Next) => {
    const limit = perMinute ?? (Number(c.env.RATE_LIMIT_PER_MINUTE) || DEFAULT_LIMIT_PER_MINUTE)
    const bucketKey = c.get('apiKeyId') ? `key:${c.get('apiKeyId')}` : `ws:${c.get('workspaceId')}`
    const windowStart = Math.floor(Date.now() / 60_000) * 60_000

    try {
      const existing = await c.env.DB.prepare('SELECT count FROM rate_limits WHERE bucket_key = ? AND window_start = ?')
        .bind(bucketKey, windowStart)
        .first<{ count: number }>()

      const count = (existing?.count ?? 0) + 1
      if (count > limit) {
        c.header('Retry-After', String(Math.ceil((windowStart + 60_000 - Date.now()) / 1000)))
        return c.json({ error: 'Rate limit exceeded. Slow down and try again shortly.', limitPerMinute: limit }, 429)
      }

      if (existing) {
        await c.env.DB.prepare('UPDATE rate_limits SET count = ? WHERE bucket_key = ? AND window_start = ?')
          .bind(count, bucketKey, windowStart)
          .run()
      } else {
        await c.env.DB.prepare('INSERT INTO rate_limits (bucket_key, window_start, count) VALUES (?, ?, 1)')
          .bind(bucketKey, windowStart)
          .run()
        // Opportunistically clear old windows so the table doesn't grow forever.
        c.env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(windowStart - 10 * 60_000).run().catch(() => {})
      }
    } catch {
      // Rate limiting must never be the reason a request fails outright.
    }

    await next()
  }
}
