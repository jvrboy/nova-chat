import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import type { AppEnv } from './lib/types'
import { logRequest } from './lib/db'
import { resolveAuth } from './lib/auth'
import { rateLimit } from './lib/ratelimit'
import { drainJobQueue } from './lib/jobqueue'
import { evaluateAlerts } from './lib/alerting'
import { runDueScheduledWorkflows } from './lib/workflowEngine'

import chatRoutes from './routes/chat'
import toolRoutes from './routes/tools'
import agentRoutes from './routes/agents'
import pipelineRoutes from './routes/pipelines'
import approvalRoutes from './routes/approvals'
import projectRoutes from './routes/projects'
import workflowRoutes from './routes/workflows'
import memoryRoutes from './routes/memory'
import connectorRoutes from './routes/connectors'
import jobRoutes from './routes/jobs'
import observabilityRoutes from './routes/observability'
import alertRoutes from './routes/alerts'
import fileRoutes from './routes/files'
import apikeyRoutes from './routes/apikeys'
import pushRoutes from './routes/push'

const app = new Hono<AppEnv>()

app.use('/api/*', cors())

// Real authentication: resolves either an API-key bearer token (looked up by
// hash, scoped to its own workspace) or falls back to the local/dev
// X-Workspace-Id header mode. See lib/auth.ts for the full contract.
app.use('/api/*', resolveAuth)

// Real per-key/per-workspace rate limiting (fixed window, backed by D1).
app.use('/api/*', rateLimit())

// Request logging middleware -> populates request_log for real observability metrics.
app.use('/api/*', async (c, next) => {
  const startedAt = Date.now()
  await next()
  const latencyMs = Date.now() - startedAt
  const workspaceId = c.get('workspaceId')
  await logRequest(c.env.DB, { workspaceId, method: c.req.method, path: c.req.path, status: c.res.status, latencyMs })
})

app.route('/api/chats', chatRoutes)
app.route('/api/tools', toolRoutes)
app.route('/api/agents', agentRoutes)
app.route('/api/pipelines', pipelineRoutes)
app.route('/api/approvals', approvalRoutes)
app.route('/api/projects', projectRoutes)
app.route('/api/workflows', workflowRoutes)
app.route('/api/memory', memoryRoutes)
app.route('/api/connectors', connectorRoutes)
app.route('/api/jobs', jobRoutes)
app.route('/api/observability', observabilityRoutes)
app.route('/api/alerts', alertRoutes)
app.route('/api/files', fileRoutes)
app.route('/api/api-keys', apikeyRoutes)
app.route('/api/push', pushRoutes)

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'nova-backend', time: new Date().toISOString() }))

app.use('/static/*', serveStatic({ root: './public' }))

app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nova Backend</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <div class="max-w-3xl mx-auto px-6 py-16">
    <h1 class="text-3xl font-bold mb-2">🪐 Nova Backend</h1>
    <p class="text-slate-400 mb-8">Real Cloudflare Workers + D1 backend for the Nova app: LLM chat with streaming and RAG, tools, multi-agent orchestration, pipelines, scheduled workflows, and push notifications.</p>
    <div class="grid gap-3">
      <a href="/api/health" class="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-sky-500 transition">
        <div class="font-semibold">GET /api/health</div>
        <div class="text-sm text-slate-400">Service health check</div>
      </a>
      <a href="/api/tools" class="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-sky-500 transition">
        <div class="font-semibold">GET /api/tools</div>
        <div class="text-sm text-slate-400">List available backend tools (41)</div>
      </a>
      <a href="/api/agents" class="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-sky-500 transition">
        <div class="font-semibold">GET /api/agents</div>
        <div class="text-sm text-slate-400">List available agents (10)</div>
      </a>
      <a href="/api/pipelines" class="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-sky-500 transition">
        <div class="font-semibold">GET /api/pipelines</div>
        <div class="text-sm text-slate-400">List built-in pipelines</div>
      </a>
      <a href="/api/observability/providers" class="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-sky-500 transition">
        <div class="font-semibold">GET /api/observability/providers</div>
        <div class="text-sm text-slate-400">Supabase / Kaggle / E2B configuration status</div>
      </a>
    </div>
    <p class="mt-10 text-xs text-slate-500">See README.md in this repo for the full API reference.</p>
  </div>
</body>
</html>`)
})

export default {
  fetch: app.fetch,
  // Cloudflare Cron Trigger handler: drains due jobs, evaluates alert rules,
  // and runs any due scheduled workflows for every known workspace, on the
  // schedule defined in wrangler.jsonc. Real background processing.
  async scheduled(_event: ScheduledEvent, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        await runDueScheduledWorkflows(env, env.DB)
        const { results: workspaces } = await env.DB.prepare('SELECT id FROM workspaces').all<{ id: string }>()
        for (const workspace of workspaces) {
          await drainJobQueue(env, workspace.id)
          await evaluateAlerts(env, workspace.id)
        }
      })()
    )
  },
}
