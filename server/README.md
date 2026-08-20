# Nova Backend (Cloudflare Workers + Hono + D1)

Real, persistent backend for the Nova Chat mobile app. Replaces the previous
on-device AsyncStorage simulation with a proper edge API: chat with a live
LLM, tool-calling, multi-agent orchestration with delegation, vector
memory/RAG, scheduled workflows, push notifications, rate limiting, and API
key auth — all running on Cloudflare's edge (D1 for SQL, R2 for files,
Workers AI for embeddings).

## Status

- **Local dev**: fully working (build ✅, `tsc --noEmit` ✅, migrations
  applied ✅, server verified with curl ✅).
- **Not yet deployed to Cloudflare** (per explicit instruction — this repo
  ships the code, deployment is a separate, deliberate next step).
- The LLM API key available in this sandbox during development
  (`OPENAI_API_KEY` / `.dev.vars`) was returning `401 Invalid or expired
  token` for the whole session, so LLM-backed code paths (chat replies,
  streaming, agents, delegation, most tools) are implemented and type-checked
  but **not live-verified** end-to-end. Replace the key before relying on
  those flows.

## Feature Overview

| Area | What's implemented |
|---|---|
| Chat | `POST /api/chats/:id/messages` (single JSON reply) and `POST /api/chats/:id/stream` (Server-Sent Events, real token-by-token streaming) |
| RAG / memory | `src/lib/embeddings.ts` — Workers AI (`@cf/baai/bge-base-en-v1.5`) embeddings with a local pseudo-embedding fallback, D1-backed vector store, optional Supabase pgvector backend (BYOK) |
| Tools | 26 tools in `src/lib/tools.ts` (calculator, redact, summarize, translate, sentiment, web-fetch, risk-score, PDF extract, image OCR, semantic recall, entity extraction, classification, diff, regex extract, unit convert, CSV↔JSON, schedule parsing, code generation, web-search summary, and more) |
| Agents | 8 agents in `src/lib/agents.ts` (planner, research, coder, ops, writer, analyst, support, guardian) with multi-agent **delegation**: the planner can hand off sub-tasks to research/coder/writer/analyst automatically (depth-limited to 3, audited in `agent_delegations`) |
| Pipelines | 4 multi-step pipelines in `src/lib/pipelines.ts` (file-to-task, research-brief, content-review, incident-triage) combining tools, agents, approval gates, and notifications |
| Workflows | User-defined, and now **schedulable**: `PATCH /api/workflows/:id/schedule` sets a recurring interval; the Cron Trigger (`*/5 * * * *`) calls `runDueScheduledWorkflows()` |
| Push notifications | `src/lib/push.ts` — Expo push API; fired on job completion/failure, approval decisions, and alert triggers. Register a device with `POST /api/push/register` |
| Auth | `src/lib/auth.ts` — `Authorization: Bearer nv_xxx` API keys (SHA-256 hashed, scoped) OR `X-Workspace-Id`/`X-Actor-Id` header mode for local/dev use |
| Rate limiting | `src/lib/ratelimit.ts` — fixed-window limiter backed by D1, default 120 req/min per key or workspace |
| Observability | `GET /api/observability/dashboard` — aggregated 24h request/error/latency stats, agent run counts, job status, pending approvals, chat/memory counts (built for the in-app usage dashboard) |

## API Routes

All routes are namespaced under `/api/*` and require either an
`Authorization: Bearer nv_xxx` header or `X-Workspace-Id` + `X-Actor-Id`
headers (dev/local mode).

```
GET    /api/health
GET    /api/chats                         list chats
POST   /api/chats                         create chat
GET    /api/chats/:id/messages            message history
POST   /api/chats/:id/messages            send message, get full JSON reply
POST   /api/chats/:id/stream              send message, get SSE stream
DELETE /api/chats/:id

GET    /api/tools                         list tool registry
POST   /api/tools/:id/run                 run a single tool directly

GET    /api/agents                        list agent registry
POST   /api/agents/:key/run               run an agent (may delegate)
GET    /api/agents/delegations/:runId     delegation audit trail

GET    /api/pipelines                     list pipelines
POST   /api/pipelines/:id/run             run a pipeline
GET    /api/pipelines/runs                list pipeline runs
GET    /api/pipelines/runs/:id            pipeline run detail

GET    /api/workflows                     list workflows
POST   /api/workflows                     create workflow
POST   /api/workflows/:id/run             run workflow now
PATCH  /api/workflows/:id/schedule        set/clear recurring schedule

GET    /api/memory                        list memories (keyword search: ?q=)
GET    /api/memory/search                 semantic/vector search (?q=&limit=)
POST   /api/memory                        create memory (auto-embedded)

GET    /api/approvals                     list approvals
POST   /api/approvals/:id/decision        approve/reject (fires push notification)

GET    /api/jobs                          job queue status
GET    /api/alerts                        alert rules
POST   /api/alerts                        create alert rule

GET    /api/files                         list files
POST   /api/files                         upload file (stored in R2)

POST   /api/push/register                 register an Expo push token
DELETE /api/push/register                 unregister a token
POST   /api/push/test                     send a test notification

GET    /api/api-keys                      list API keys
POST   /api/api-keys                      create API key (returns raw key once)

GET    /api/observability                 basic metrics
GET    /api/observability/dashboard       aggregated dashboard payload
GET    /api/projects                      projects
GET    /api/connectors                    connector status
```

## Data Model (D1 / SQLite)

Core tables: `chats`, `messages`, `memories`, `tools_runs`, `agent_runs`,
`agent_delegations`, `workflows`, `workflow_runs`, `approvals`, `jobs`,
`alerts`, `alert_incidents`, `files`, `api_keys`, `request_log`,
`rate_limits`, `embeddings`, `push_tokens`, `audit_log`, `projects`,
`connectors`.

Migrations live in `migrations/*.sql` and are applied with:

```bash
npx wrangler d1 migrations apply webapp-production --local   # local dev
npx wrangler d1 migrations apply webapp-production           # production (after deploy)
```

## Local Development

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs
curl http://localhost:3000/api/health
```

Environment variables for local dev live in `.dev.vars` (never committed —
see `.gitignore`):

```
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://www.genspark.ai/api/llm_proxy/v1
LLM_MODEL=gpt-5-mini
LLM_AGENT_MODEL=gpt-5-mini
```

### Workers AI binding note

The `AI` binding (used for real embeddings) is **commented out** in
`wrangler.jsonc` for local dev. `wrangler pages dev` has no offline
emulation for Workers AI — it always tries to proxy to Cloudflare and
requires a `CLOUDFLARE_API_TOKEN` in this non-interactive environment, which
breaks local startup. `src/lib/embeddings.ts` automatically falls back to a
deterministic local pseudo-embedding (character-trigram hashing) whenever
`env.AI` is unavailable, so RAG features still work locally (with reduced
embedding quality). **Re-enable `"ai": { "binding": "AI" }` before deploying
to production** to get real neural embeddings.

## What's Implemented vs. Outstanding

**Implemented this phase:**
- ✅ Streaming chat responses (SSE)
- ✅ Vector memory/RAG (Workers AI + D1 fallback + optional Supabase)
- ✅ Multi-agent delegation (planner → research/coder/writer/analyst)
- ✅ Scheduled/recurring workflows (cron-driven)
- ✅ Push notifications (job/approval/alert events)
- ✅ Rate limiting (fixed-window, D1-backed)
- ✅ API-key bearer auth with scoped keys
- ✅ PDF extraction + image OCR tools

**Known gaps / next steps:**
- ⬜ Scopes are defined on API keys but `requireScope()` is not yet applied
  as a guard on any route — enforcement is incomplete.
- ⬜ No real per-user auth (Clerk/Auth0) — only workspace-level API keys /
  header auth exists. Not equivalent to individual user login.
- ⬜ `pdf-extract` tool exists but the `file-to-task` pipeline doesn't yet
  call it automatically from a `fileId` (still expects raw text input).
- ⬜ Agent runs are not streamed yet — only chat has an SSE endpoint.
- ⬜ No automated test suite for the backend (manual curl checks only).
- ⬜ No CI/CD pipeline for the backend itself.
- ⬜ No Slack/email alert channel configured (webhook delivery + push exist,
  but no real chat-ops integration).
- ⬜ `wrangler.jsonc` still has placeholder `database_id`
  (`REPLACE_WITH_D1_DATABASE_ID`) — real IDs are created at deploy time.
- ⬜ Not deployed to Cloudflare yet.

## Deployment (when ready)

This project is *not* deployed yet by design. When ready:

1. `npx wrangler d1 create webapp-production` → copy the real `database_id`
   into `wrangler.jsonc`.
2. `npx wrangler r2 bucket create webapp-files`.
3. Re-enable the `ai` binding in `wrangler.jsonc`.
4. Set production secrets (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`,
   `LLM_AGENT_MODEL`, and optionally `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`,
   `EXPO_ACCESS_TOKEN`) via `wrangler secret put <NAME>`.
5. `npx wrangler d1 migrations apply webapp-production`.
6. `npm run build && npx wrangler pages deploy dist --project-name <name>`.

## Tech Stack

Hono, TypeScript, Cloudflare Workers/Pages, D1 (SQLite), R2, Workers AI,
Cron Triggers, `unpdf` (PDF text extraction), Expo push API.
