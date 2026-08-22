import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { appendAudit } from '../lib/db'

const files = new Hono<AppEnv>()

/**
 * Sanitizes a client-supplied filename before it is used in an R2 key or a
 * Content-Disposition header: strips path separators, control/CRLF characters,
 * and quotes, and caps the length.
 */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || 'upload.bin'
}

files.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT * FROM files WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200').bind(workspaceId).all()
  return c.json({ files: results })
})

files.post('/upload', async (c) => {
  if (!c.env.BUCKET) return c.json({ error: 'R2 bucket is not configured for this deployment.' }, 501)
  const workspaceId = c.get('workspaceId')
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return c.json({ error: 'Multipart field "file" is required.' }, 400)
  if (file.size > 25 * 1024 * 1024) return c.json({ error: 'File exceeds 25MB limit.' }, 413)

  const id = newId('file')
  const displayName = safeFileName(file.name)
  const r2Key = `${workspaceId}/${id}-${displayName}`
  await c.env.BUCKET.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } })
  await c.env.DB.prepare('INSERT INTO files (id, workspace_id, name, r2_key, size, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, workspaceId, displayName, r2Key, file.size, file.type || 'application/octet-stream', nowIso())
    .run()
  await appendAudit(c.env.DB, { workspaceId, actorId: c.get('actorId'), action: 'file.uploaded', resource: 'file', resourceId: id, metadata: { size: file.size } })
  return c.json({ id, name: displayName, size: file.size }, 201)
})

files.get('/:id/download', async (c) => {
  if (!c.env.BUCKET) return c.json({ error: 'R2 bucket is not configured for this deployment.' }, 501)
  const workspaceId = c.get('workspaceId')
  const row = await c.env.DB.prepare('SELECT * FROM files WHERE id = ? AND workspace_id = ?').bind(c.req.param('id'), workspaceId).first<any>()
  if (!row) return c.json({ error: 'File not found in workspace.' }, 404)
  const object = await c.env.BUCKET.get(row.r2_key)
  if (!object) return c.json({ error: 'File missing from storage.' }, 404)
  return new Response(object.body, { headers: { 'Content-Type': row.mime_type, 'Content-Disposition': `attachment; filename="${safeFileName(row.name)}"; filename*=UTF-8''${encodeURIComponent(safeFileName(row.name))}` } })
})

files.delete('/:id', async (c) => {
  const workspaceId = c.get('workspaceId')
  const row = await c.env.DB.prepare('SELECT * FROM files WHERE id = ? AND workspace_id = ?').bind(c.req.param('id'), workspaceId).first<any>()
  if (!row) return c.json({ error: 'File not found in workspace.' }, 404)
  if (c.env.BUCKET) await c.env.BUCKET.delete(row.r2_key).catch(() => {})
  await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(row.id).run()
  return c.json({ deleted: true })
})

export default files
