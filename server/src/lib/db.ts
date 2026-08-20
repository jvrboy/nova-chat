import type { D1Database } from '@cloudflare/workers-types'
import { newId, nowIso } from './ids'

export async function ensureWorkspace(db: D1Database, workspaceId: string, ownerId = 'local-user') {
  const existing = await db.prepare('SELECT id FROM workspaces WHERE id = ?').bind(workspaceId).first()
  if (!existing) {
    await db
      .prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(workspaceId, workspaceId, ownerId, nowIso())
      .run()
  }
}

export async function appendAudit(
  db: D1Database,
  entry: { workspaceId: string; actorId: string; action: string; resource: string; resourceId?: string; risk?: 'low' | 'medium' | 'high'; metadata?: Record<string, unknown> }
) {
  const id = newId('audit')
  await db
    .prepare(
      'INSERT INTO audit_log (id, workspace_id, actor_id, action, resource, resource_id, risk, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      id,
      entry.workspaceId,
      entry.actorId,
      entry.action,
      entry.resource,
      entry.resourceId ?? null,
      entry.risk ?? 'low',
      JSON.stringify(entry.metadata ?? {}),
      nowIso()
    )
    .run()
  return id
}

export async function logRequest(db: D1Database, entry: { workspaceId?: string; method: string; path: string; status: number; latencyMs: number }) {
  try {
    await db
      .prepare('INSERT INTO request_log (id, workspace_id, method, path, status, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('req'), entry.workspaceId ?? null, entry.method, entry.path, entry.status, entry.latencyMs, nowIso())
      .run()
  } catch {
    // best-effort logging; never fail the request because of it
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
