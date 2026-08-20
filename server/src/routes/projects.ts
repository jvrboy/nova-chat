import { Hono } from 'hono'
import type { AppEnv } from '../lib/types'
import { newId, nowIso } from '../lib/ids'
import { appendAudit } from '../lib/db'

const projects = new Hono<AppEnv>()

projects.get('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const { results } = await c.env.DB.prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC').bind(workspaceId).all()
  return c.json({ projects: results })
})

projects.post('/', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const body = await c.req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'Field "name" is required.' }, 400)

  const id = newId('proj')
  const at = nowIso()
  await c.env.DB.prepare('INSERT INTO projects (id, workspace_id, owner_id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, workspaceId, actorId, name, body?.description ?? '', body?.color ?? '#55d6ff', at, at)
    .run()

  // Bootstrap a standard first task set — a real, small opinionated default rather than a canned message.
  const defaultTasks = ['Define outcome', 'Map milestones', 'Identify risks', 'Choose first action']
  for (const [index, title] of defaultTasks.entries()) {
    await c.env.DB.prepare('INSERT INTO tasks (id, project_id, workspace_id, title, description, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('task'), id, workspaceId, title, `${title} for ${name}`, index === 0 ? 'high' : 'medium', at, at)
      .run()
  }

  await appendAudit(c.env.DB, { workspaceId, actorId, action: 'project.created_with_plan', resource: 'project', resourceId: id, metadata: { taskCount: defaultTasks.length } })
  return c.json({ id, name }, 201)
})

projects.get('/:id/tasks', async (c) => {
  const workspaceId = c.get('workspaceId')
  const projectId = c.req.param('id')
  const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND workspace_id = ?').bind(projectId, workspaceId).first()
  if (!project) return c.json({ error: 'Project not found in workspace.' }, 404)
  const { results } = await c.env.DB.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY updated_at DESC').bind(projectId).all()
  return c.json({ tasks: results })
})

const VALID_STATUSES = ['backlog', 'todo', 'in_progress', 'blocked', 'done']

projects.patch('/tasks/:taskId', async (c) => {
  const workspaceId = c.get('workspaceId')
  const actorId = c.get('actorId')
  const taskId = c.req.param('taskId')
  const body = await c.req.json().catch(() => ({}))

  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').bind(taskId, workspaceId).first<any>()
  if (!task) return c.json({ error: 'Task not found in workspace.' }, 404)

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return c.json({ error: `Invalid status. Must be one of ${VALID_STATUSES.join(', ')}` }, 400)
    await c.env.DB.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').bind(body.status, nowIso(), taskId).run()
    await appendAudit(c.env.DB, { workspaceId, actorId, action: 'task.triaged', resource: 'task', resourceId: taskId, risk: body.status === 'blocked' ? 'medium' : 'low', metadata: { decision: body.status } })
  }
  if (typeof body.title === 'string') await c.env.DB.prepare('UPDATE tasks SET title = ?, updated_at = ? WHERE id = ?').bind(body.title, nowIso(), taskId).run()
  if (typeof body.description === 'string') await c.env.DB.prepare('UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?').bind(body.description, nowIso(), taskId).run()

  const updated = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first()
  return c.json(updated)
})

export default projects
