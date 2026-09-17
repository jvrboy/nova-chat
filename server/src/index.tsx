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
import accessRoutes from './routes/access'
import marketRoutes from './routes/market'
import insightRoutes from './routes/insights'
import brainRoutes from './routes/brain'
import orchRoutes from './routes/orchestrate'
import syncRoutes from './routes/sync'

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
app.route('/api/access', accessRoutes)
app.route('/api/market', marketRoutes)
app.route('/api/insights', insightRoutes)
app.route('/api/brain', brainRoutes)
app.route('/api/orchestrate', orchRoutes)
app.route('/api/sync', syncRoutes)

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'nova-backend', time: new Date().toISOString() }))

app.use('/static/*', serveStatic({ root: './public' }))

// Nova web app — built from web/ and shipped in dist/app/. It is the product at
// the ROOT of the site (https://<host>/), so users land directly in the app.
// Hashed assets under /app/assets/* are excluded from the Worker in _routes.json
// (scripts/fix-routes.mjs) and served straight from Pages storage; the index.html
// document is served here via the Pages ASSETS binding so / and every client-side
// path resolve to the SPA. The old admin landing page was removed per request.
async function serveSpaIndex(c: any) {
  try {
    const res = await (c.env.ASSETS as Fetcher).fetch(new Request(new URL('/app/index.html', c.req.url)))
    if (res.ok) return new Response(res.body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } })
  } catch { /* fall through */ }
  return c.text('Nova web app not found. Build web/ and redeploy.', 404)
}
app.get('/', serveSpaIndex)
app.get('/app', serveSpaIndex) // back-compat: /app still works
app.get('/app/', serveSpaIndex)
app.get('/app/*', serveSpaIndex)

// Client-side routing catch-all: /projects, /chat, /settings, etc. all serve
// the SPA so deep links and refreshes land on the right view. API misses still
// return JSON 404s.
app.get('*', (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404)
  return serveSpaIndex(c)
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
