// Firecrawl (firecrawl.dev) client: turns any URL into clean markdown, runs
// full-text web search with content extraction, and maps a site's full URL
// tree — all via plain HTTPS POSTs (no SDK dependency).
//
// Auth: `Authorization: Bearer fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (get a key
// at https://www.firecrawl.dev/app/api-keys). Verified empirically: v2 API,
// POST /v2/scrape, POST /v2/search, POST /v2/map. Supports pooling across
// multiple Firecrawl accounts (see credentialPool.ts) to spread request
// volume/credit usage across all configured accounts.
import type { Bindings } from './types'
import { parsePool, pickPoolEntry, poolSummary } from './credentialPool'

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2'

export type FirecrawlAccount = { apiKey: string; label?: string }

function poolFromEnv(env: Bindings): FirecrawlAccount[] {
  const pooled = parsePool(env.FIRECRAWL_ACCOUNTS_JSON).filter((e) => e.apiKey) as unknown as FirecrawlAccount[]
  if (pooled.length) return pooled
  if (env.FIRECRAWL_API_KEY) return [{ apiKey: env.FIRECRAWL_API_KEY }]
  return []
}

export function firecrawlStatus(env: Bindings) {
  return poolSummary(poolFromEnv(env) as unknown as Record<string, string>[], 'label')
}

async function pickAccount(env: Bindings, db?: D1Database): Promise<FirecrawlAccount> {
  const accounts = poolFromEnv(env)
  if (!accounts.length) {
    throw new Error(
      'Firecrawl is not configured. Set FIRECRAWL_API_KEY (single account) or FIRECRAWL_ACCOUNTS_JSON (multi-account pool) ' +
        'as Worker secrets. Get an API key at https://www.firecrawl.dev/app/api-keys.'
    )
  }
  const picked = await pickPoolEntry(db, 'firecrawl', accounts as unknown as Record<string, string>[])
  return (picked?.entry ?? accounts[0]) as unknown as FirecrawlAccount
}

async function fcPost(account: FirecrawlAccount, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || json.success === false) {
    throw new Error(`Firecrawl request to ${path} failed: ${response.status} ${(json.error as string) || JSON.stringify(json)}`)
  }
  return json
}

export type FirecrawlScrapeResult = {
  url: string
  title?: string
  description?: string
  markdown: string
  links?: string[]
  statusCode?: number
  creditsUsed?: number
}

/** Scrapes a single URL and returns clean markdown + metadata. This is the
 * "read one page well" primitive — prefer this over web-fetch when you need
 * the page's real rendered content (JS-rendered pages, paywalled-by-bot-
 * detection pages, etc.), not just a raw HTML dump. */
export async function firecrawlScrape(
  env: Bindings,
  db: D1Database | undefined,
  url: string,
  opts: { onlyMainContent?: boolean } = {}
): Promise<FirecrawlScrapeResult> {
  const account = await pickAccount(env, db)
  const json = await fcPost(account, '/scrape', {
    url,
    formats: ['markdown'],
    onlyMainContent: opts.onlyMainContent ?? true,
  })
  const data = (json.data ?? {}) as Record<string, unknown>
  const metadata = (data.metadata ?? {}) as Record<string, unknown>
  return {
    url: (metadata.url as string) || (metadata.sourceURL as string) || url,
    title: (metadata.title as string) || undefined,
    description: (metadata.description as string) || undefined,
    markdown: (data.markdown as string) || '',
    links: (data.links as string[]) || undefined,
    statusCode: (metadata.statusCode as number) || undefined,
    creditsUsed: (metadata.creditsUsed as number) || undefined,
  }
}

export type FirecrawlSearchHit = {
  url: string
  title?: string
  description?: string
  markdown?: string
}

/** Full-text web search with optional content extraction per hit (richer
 * than the existing `web-search-summary` tool, which only summarizes
 * snippets — this can pull full markdown content per result too). */
export async function firecrawlSearch(
  env: Bindings,
  db: D1Database | undefined,
  query: string,
  opts: { limit?: number; scrapeContent?: boolean } = {}
): Promise<FirecrawlSearchHit[]> {
  const account = await pickAccount(env, db)
  const body: Record<string, unknown> = { query, limit: Math.min(Math.max(opts.limit ?? 5, 1), 20) }
  if (opts.scrapeContent) body.scrapeOptions = { formats: ['markdown'] }
  const json = await fcPost(account, '/search', body)
  const data = (json.data ?? {}) as Record<string, unknown>
  const web = (data.web ?? []) as Array<Record<string, unknown>>
  return web.map((r) => ({
    url: String(r.url ?? ''),
    title: (r.title as string) || undefined,
    description: (r.description as string) || undefined,
    markdown: (r.markdown as string) || undefined,
  }))
}

export type FirecrawlMapResult = { urls: Array<{ url: string; title?: string }> }

/** Maps a site's full URL tree (fast link discovery, no content fetch) —
 * useful for the research agent to decide which pages of a site are worth
 * scraping individually before spending Firecrawl credits on each one. */
export async function firecrawlMap(
  env: Bindings,
  db: D1Database | undefined,
  url: string,
  opts: { search?: string; limit?: number } = {}
): Promise<FirecrawlMapResult> {
  const account = await pickAccount(env, db)
  const body: Record<string, unknown> = { url, limit: Math.min(Math.max(opts.limit ?? 100, 1), 5000) }
  if (opts.search) body.search = opts.search
  const json = await fcPost(account, '/map', body)
  const links = (json.links ?? []) as Array<{ url: string; title?: string } | string>
  return {
    urls: Array.isArray(links)
      ? links.map((l) => (typeof l === 'string' ? { url: l } : { url: l.url, title: l.title }))
      : [],
  }
}
