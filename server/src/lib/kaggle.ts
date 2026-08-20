// Kaggle Public API client (REST, no SDK dependency — Kaggle's official client
// is a Python CLI, so we talk to the documented HTTPS endpoints directly).
//
// Auth: HTTP Basic, base64("username:key"). Get a token at
// https://www.kaggle.com/settings -> API -> "Create New Token", which downloads
// a kaggle.json file shaped { "username": "...", "key": "..." }.
//
// Supports pooling across multiple Kaggle accounts (see credentialPool.ts) so
// dataset-heavy workloads spread across up to N accounts' rate limits instead
// of exhausting a single one.
import type { Bindings } from './types'
import { parsePool, pickPoolEntry, poolSummary } from './credentialPool'

const KAGGLE_BASE = 'https://www.kaggle.com/api/v1'

export type KaggleAccount = { username: string; key: string; label?: string }

function poolFromEnv(env: Bindings): KaggleAccount[] {
  const pooled = parsePool(env.KAGGLE_ACCOUNTS_JSON).filter((e) => e.username && e.key) as unknown as KaggleAccount[]
  if (pooled.length) return pooled
  // Single-account fallback via plain KAGGLE_USERNAME / KAGGLE_KEY secrets.
  if (env.KAGGLE_USERNAME && env.KAGGLE_KEY) return [{ username: env.KAGGLE_USERNAME, key: env.KAGGLE_KEY }]
  return []
}

export function kaggleStatus(env: Bindings) {
  return poolSummary(poolFromEnv(env) as unknown as Record<string, string>[], 'username')
}

async function pickAccount(env: Bindings, db?: D1Database): Promise<KaggleAccount> {
  const accounts = poolFromEnv(env)
  if (!accounts.length) {
    throw new Error(
      'Kaggle is not configured. Set KAGGLE_USERNAME + KAGGLE_KEY (single account) or KAGGLE_ACCOUNTS_JSON (multi-account pool) as Worker secrets. Get credentials at https://www.kaggle.com/settings -> API -> "Create New Token".'
    )
  }
  const picked = await pickPoolEntry(db, 'kaggle', accounts as unknown as Record<string, string>[])
  return (picked?.entry ?? accounts[0]) as unknown as KaggleAccount
}

function authHeader(account: KaggleAccount): string {
  const creds = btoa(`${account.username}:${account.key}`)
  return `Basic ${creds}`
}

export type KaggleDataset = {
  ref: string
  title: string
  subtitle?: string
  ownerName?: string
  url?: string
  totalBytes?: number
  lastUpdated?: string
  downloadCount?: number
  voteCount?: number
  usabilityRating?: number
  licenseName?: string
}

function normalizeDataset(raw: Record<string, unknown>): KaggleDataset {
  return {
    ref: String(raw.ref ?? ''),
    title: String(raw.title ?? raw.titleNullable ?? ''),
    subtitle: (raw.subtitle as string) || undefined,
    ownerName: (raw.ownerName as string) || undefined,
    url: (raw.url as string) || (raw.ref ? `https://www.kaggle.com/datasets/${raw.ref}` : undefined),
    totalBytes: (raw.totalBytes as number) ?? undefined,
    lastUpdated: (raw.lastUpdated as string) || undefined,
    downloadCount: (raw.downloadCount as number) ?? undefined,
    voteCount: (raw.voteCount as number) ?? undefined,
    usabilityRating: (raw.usabilityRating as number) ?? undefined,
    licenseName: (raw.licenseName as string) || undefined,
  }
}

/** Search public Kaggle datasets by keyword. */
export async function kaggleSearchDatasets(
  env: Bindings,
  db: D1Database | undefined,
  query: string,
  opts: { page?: number; sortBy?: string; maxResults?: number } = {}
): Promise<KaggleDataset[]> {
  const account = await pickAccount(env, db)
  const params = new URLSearchParams({
    search: query,
    page: String(opts.page ?? 1),
    sortBy: opts.sortBy ?? 'hottest',
  })
  const response = await fetch(`${KAGGLE_BASE}/datasets/list?${params.toString()}`, {
    headers: { Authorization: authHeader(account), Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Kaggle dataset search failed: ${response.status} ${await response.text().catch(() => '')}`)
  const rows = (await response.json()) as Array<Record<string, unknown>>
  const max = Math.min(Math.max(opts.maxResults ?? 10, 1), 50)
  return rows.slice(0, max).map(normalizeDataset)
}

/** Fetch metadata (description, size, license, etc.) for a single dataset. */
export async function kaggleGetDatasetInfo(
  env: Bindings,
  db: D1Database | undefined,
  ownerSlug: string,
  datasetSlug: string
): Promise<KaggleDataset & { description?: string }> {
  const account = await pickAccount(env, db)
  const response = await fetch(`${KAGGLE_BASE}/datasets/view/${ownerSlug}/${datasetSlug}`, {
    headers: { Authorization: authHeader(account), Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Kaggle dataset lookup failed: ${response.status} ${await response.text().catch(() => '')}`)
  const raw = (await response.json()) as Record<string, unknown>
  return { ...normalizeDataset(raw), description: (raw.description as string) || undefined }
}

/** Downloads a dataset (as a zip, Kaggle always zips dataset downloads) and
 * returns the raw bytes plus metadata. Caller decides what to do with the zip
 * (e.g. store in R2, or hand a single extracted CSV member to csv-to-json). */
export async function kaggleDownloadDataset(
  env: Bindings,
  db: D1Database | undefined,
  ownerSlug: string,
  datasetSlug: string,
  opts: { datasetVersionNumber?: number } = {}
): Promise<{ bytes: ArrayBuffer; contentType: string; sizeBytes: number }> {
  const account = await pickAccount(env, db)
  const params = opts.datasetVersionNumber ? `?datasetVersionNumber=${opts.datasetVersionNumber}` : ''
  const response = await fetch(`${KAGGLE_BASE}/datasets/download/${ownerSlug}/${datasetSlug}${params}`, {
    headers: { Authorization: authHeader(account) },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`Kaggle dataset download failed: ${response.status} ${await response.text().catch(() => '')}`)
  const bytes = await response.arrayBuffer()
  return { bytes, contentType: response.headers.get('content-type') ?? 'application/zip', sizeBytes: bytes.byteLength }
}

/** List a user's own or public kernels (notebooks) — useful for the analyst
 * agent to discover reference notebooks for a dataset/topic. */
export async function kaggleSearchKernels(
  env: Bindings,
  db: D1Database | undefined,
  query: string,
  opts: { page?: number; maxResults?: number } = {}
): Promise<Array<{ ref: string; title: string; author?: string; url?: string; totalVotes?: number }>> {
  const account = await pickAccount(env, db)
  const params = new URLSearchParams({ search: query, page: String(opts.page ?? 1) })
  const response = await fetch(`${KAGGLE_BASE}/kernels/list?${params.toString()}`, {
    headers: { Authorization: authHeader(account), Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Kaggle kernel search failed: ${response.status} ${await response.text().catch(() => '')}`)
  const rows = (await response.json()) as Array<Record<string, unknown>>
  const max = Math.min(Math.max(opts.maxResults ?? 10, 1), 50)
  return rows.slice(0, max).map((r) => ({
    ref: String(r.ref ?? ''),
    title: String(r.title ?? ''),
    author: (r.author as string) || undefined,
    url: r.ref ? `https://www.kaggle.com/code/${r.ref}` : undefined,
    totalVotes: (r.totalVotes as number) ?? undefined,
  }))
}
