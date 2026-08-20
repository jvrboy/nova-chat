// Kaggle Public API client (REST, no SDK dependency — Kaggle's official client
// is a Python CLI, so we talk to the documented HTTPS endpoints directly).
//
// Auth: Kaggle supports TWO credential formats, both accepted by the same
// `https://www.kaggle.com/api/v1/*` REST surface used here:
//   1. NEW-style bearer token ("KGAT_..." — Kaggle Granted Access Token,
//      created at kaggle.com/settings -> API -> "Create New Token"):
//        Authorization: Bearer KGAT_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//      This is the recommended format going forward and is a single string,
//      no username needed. Verified empirically against the live API.
//   2. LEGACY username+key pair (downloaded as kaggle.json, "Legacy API
//      Credentials" section of the same settings page):
//        Authorization: Basic base64("username:key")
//
// Supports pooling across multiple Kaggle accounts (see credentialPool.ts) so
// dataset-heavy workloads spread across up to N accounts' rate limits instead
// of exhausting a single one. A pool entry can be EITHER a bare token string
// or a { username, key } pair — see poolFromEnv below.
import type { Bindings } from './types'
import { parsePool, pickPoolEntry, poolSummary } from './credentialPool'

const KAGGLE_BASE = 'https://www.kaggle.com/api/v1'

export type KaggleAccount = { token?: string; username?: string; key?: string; label?: string }

function poolFromEnv(env: Bindings): KaggleAccount[] {
  // KAGGLE_ACCOUNTS_JSON: array of either { token, label } (new bearer tokens)
  // or { username, key, label } (legacy pair). Mixed pools are fine.
  const pooled = parsePool(env.KAGGLE_ACCOUNTS_JSON)
    .map((e) => ({ token: e.token, username: e.username, key: e.key, label: e.label }))
    .filter((e) => e.token || (e.username && e.key)) as KaggleAccount[]
  if (pooled.length) return pooled
  // Single-account fallbacks.
  if (env.KAGGLE_TOKEN) return [{ token: env.KAGGLE_TOKEN }]
  if (env.KAGGLE_USERNAME && env.KAGGLE_KEY) return [{ username: env.KAGGLE_USERNAME, key: env.KAGGLE_KEY }]
  return []
}

export function kaggleStatus(env: Bindings) {
  return poolSummary(poolFromEnv(env) as unknown as Record<string, string>[], 'label')
}

async function pickAccount(env: Bindings, db?: D1Database): Promise<KaggleAccount> {
  const accounts = poolFromEnv(env)
  if (!accounts.length) {
    throw new Error(
      'Kaggle is not configured. Set KAGGLE_TOKEN (new "KGAT_..." bearer token, recommended) or ' +
        'KAGGLE_USERNAME + KAGGLE_KEY (legacy pair), or KAGGLE_ACCOUNTS_JSON for a multi-account pool, as Worker secrets. ' +
        'Get credentials at https://www.kaggle.com/settings -> API -> "Create New Token".'
    )
  }
  const picked = await pickPoolEntry(db, 'kaggle', accounts as unknown as Record<string, string>[])
  return (picked?.entry ?? accounts[0]) as unknown as KaggleAccount
}

function authHeader(account: KaggleAccount): string {
  if (account.token) return `Bearer ${account.token}`
  return `Basic ${btoa(`${account.username}:${account.key}`)}`
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
  const derivedRef =
    raw.ref ?? (raw.ownerRefNullable && raw.titleNullable ? `${raw.ownerRefNullable}/${raw.titleNullable}` : '')
  return {
    ref: String(raw.ref ?? derivedRef ?? ''),
    title: String(raw.title ?? raw.titleNullable ?? ''),
    subtitle: (raw.subtitle as string) || (raw.subtitleNullable as string) || undefined,
    ownerName: (raw.ownerName as string) || (raw.ownerNameNullable as string) || (raw.creatorNameNullable as string) || undefined,
    url: (raw.url as string) || (raw.urlNullable as string) || (raw.ref ? `https://www.kaggle.com/datasets/${raw.ref}` : undefined),
    totalBytes: (raw.totalBytes as number) ?? (raw.totalBytesNullable as number) ?? undefined,
    lastUpdated: (raw.lastUpdated as string) || undefined,
    downloadCount: (raw.downloadCount as number) ?? undefined,
    voteCount: (raw.voteCount as number) ?? undefined,
    usabilityRating: (raw.usabilityRating as number) ?? (raw.usabilityRatingNullable as number) ?? undefined,
    licenseName: (raw.licenseName as string) || (raw.licenseNameNullable as string) || undefined,
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
  return { ...normalizeDataset(raw), description: (raw.description as string) || (raw.descriptionNullable as string) || undefined }
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
