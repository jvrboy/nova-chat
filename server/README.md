# Nova Backend (Cloudflare Workers + Hono + D1)

Real, persistent backend for the Nova Chat mobile app. Replaces the previous
on-device AsyncStorage simulation with a proper edge API: chat with a live
LLM, tool-calling, multi-agent orchestration with delegation, vector
memory/RAG, scheduled workflows, push notifications, rate limiting, and API
key auth — all running on Cloudflare's edge (D1 for SQL, R2 for files,
Workers AI for embeddings).

It also integrates three external provider ecosystems — **Supabase**
(database/vector/storage), **Kaggle** (public dataset search + download),
and **E2B** (real sandboxed code execution) — each with built-in
**multi-account pooling** so you can spread load across many free-tier
accounts instead of hitting one account's rate limit. See
[Provider Integrations & Credential Setup](#provider-integrations--credential-setup)
below for exactly what to configure.

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
| Tools | 36 tools in `src/lib/tools.ts` (calculator, redact, summarize, translate, sentiment, web-fetch, risk-score, PDF extract, image OCR, semantic recall, entity extraction, classification, diff, regex extract, unit convert, CSV↔JSON, schedule parsing, code generation, web-search summary, and more, **plus** Kaggle dataset search/info/download/kernel-search, real sandboxed `code-execute`, generic Supabase query/write/delete, and `provider-status`) |
| Agents | 10 agents in `src/lib/agents.ts` (planner, research, coder, ops, writer, analyst, support, guardian, **datasci**, **integrations**) with multi-agent **delegation**: the planner can hand off sub-tasks to research/coder/writer/analyst/datasci/integrations automatically (depth-limited to 3, audited in `agent_delegations`) |
| Provider integrations | `src/lib/kaggle.ts`, `src/lib/e2b.ts`, `src/lib/supabase.ts`, `src/lib/credentialPool.ts`, `src/lib/zip.ts` — multi-account pooled clients for Kaggle (dataset/kernel search + download + in-Worker ZIP extraction), E2B (real Python/JS/TS/R/bash execution in an isolated sandbox), and Supabase (generic table CRUD + Storage, with sticky per-workspace project sharding across many projects) |
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
GET    /api/observability/providers       Supabase / Kaggle / E2B configuration status (no secrets ever returned, just accountCount + labels)
GET    /api/projects                      projects
GET    /api/connectors                    connector status
```

### New provider-backed tools (call via `POST /api/tools/:id/run`)

| Tool id | Risk | What it does |
|---|---|---|
| `kaggle-dataset-search` | safe | Search public Kaggle datasets by keyword |
| `kaggle-dataset-info` | safe | Get metadata for a specific `owner/dataset` |
| `kaggle-dataset-download` | review | Downloads a dataset zip (via a pooled account), caches it to R2 + `kaggle_dataset_cache`, extracts the first CSV/JSON/TXT/TSV file (truncated to 50k chars) |
| `kaggle-kernel-search` | safe | Search public Kaggle notebooks/kernels |
| `code-execute` | **sensitive** | Runs real Python/JavaScript/TypeScript/R/bash code in an isolated E2B sandbox and returns stdout/stderr/results; every run is logged to `code_executions` (hash, duration, ok/error) |
| `supabase-query` | safe | Generic `SELECT`-style read from a table in the workspace's pinned Supabase project |
| `supabase-write` | **sensitive** | Generic upsert into a table in the workspace's pinned Supabase project |
| `supabase-delete` | **sensitive** | Generic delete from a table (filters required — refuses an unfiltered delete) |
| `provider-status` | safe | Reports whether Supabase/Kaggle/E2B are configured and how many accounts are pooled for each, with **zero external calls** — safe to run even with nothing configured |

`review`/`sensitive` tools go through the existing approval gate
(`POST /api/tools/:id/run` with no `confirm:true` returns
`{ requiresConfirmation: true, approvalId }`; either resubmit with
`{"confirm": true}` or `POST /api/approvals/:id/decision`).

## Data Model (D1 / SQLite)

Core tables: `chats`, `messages`, `memories`, `tools_runs`, `agent_runs`,
`agent_delegations`, `workflows`, `workflow_runs`, `approvals`, `jobs`,
`alerts`, `alert_incidents`, `files`, `api_keys`, `request_log`,
`rate_limits`, `embeddings`, `push_tokens`, `audit_log`, `projects`,
`connectors`, plus (added in `0003_provider_integrations.sql`)
`credential_rotation` (durable round-robin cursor per pooled provider),
`kaggle_dataset_cache` (workspace/owner/dataset → R2 key + size), and
`code_executions` (audit trail for every `code-execute` run: language,
code hash, ok/error, stdout/stderr sizes, duration).

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

## Provider Integrations & Credential Setup

All three integrations are **fully optional** — the backend runs fine with
none of them configured; the relevant tools just return a clear "not
configured" error (see `provider-status` / `/api/observability/providers`
to check current state at any time, without needing to read logs or code).

### Architecture: how everything connects

```
                        ┌─────────────────────────────┐
                        │   Nova Cloudflare Worker     │
                        │   (Hono, this repo)          │
                        │                              │
   Expo app  ───HTTP──▶ │  /api/chats  /api/tools      │
                        │  /api/agents /api/pipelines  │
                        │                              │
                        │  D1 (SQLite) ── all app data │
                        │  R2          ── file/zip blobs│
                        │  Workers AI  ── embeddings    │
                        └──────────────┬───────────────┘
                                       │ outbound fetch() from Worker code
                                       │ (never from the mobile app directly —
                                       │  keys never reach the client)
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
     Supabase (×10 projects)    Kaggle (×10 accounts)     E2B (×5 accounts)
     PostgREST + Storage API    api/v1 REST (Basic auth)  api.e2b.app + envd
     STICKY per-workspace pin   round-robin pool           round-robin pool
```

- The **Worker is the only thing that ever talks to these services.** The
  Expo app only ever calls this Worker's own `/api/*` routes; it never sees
  a Supabase/Kaggle/E2B key.
- **Kaggle & E2B use round-robin pooling** (`src/lib/credentialPool.ts`):
  each request picks the "next" account from whichever list you configured,
  cursor persisted in the `credential_rotation` D1 table (falls back to
  random pick if D1 write fails, so a hiccup never blocks a request).
  These calls are stateless (a dataset search or a sandbox run doesn't
  depend on which account served the previous one), so pure load-spreading
  is safe and keeps every account's free-tier quota further from its limit.
- **Supabase uses sticky sharding, not round-robin**
  (`pickSupabaseProject(env, db, { sticky: workspaceId })`): a hash of the
  *workspaceId* picks one project out of your pool, and that workspace
  **always** uses that same project again. This matters because Supabase
  holds actual persisted rows/vector embeddings — round-robining writes
  would scatter one workspace's data across 10 different databases and
  make reads fail to find it. Round-robin is fine for stateless calls;
  sharded data needs a stable, deterministic assignment.
- Every client (`kaggle.ts`, `e2b.ts`, `supabase.ts`) accepts **either** a
  single flat account (two secrets) **or** a `*_ACCOUNTS_JSON` array (your
  full pool) — set whichever matches how many accounts you're supplying.

### What you need to give me / set yourself

All of these are **Worker secrets** — never hard-coded, never committed.
Set them locally in `server/.dev.vars` (already gitignored) for dev/testing
in this sandbox, and in production with `npx wrangler pages secret put
<NAME>` (interactive prompt, value never touches shell history or git).

**1. Kaggle — you said 10 accounts.** For each account:
   1. Log in to that Kaggle account → https://www.kaggle.com/settings →
      **API** section → **"Create New Token"** → downloads a `kaggle.json`
      file shaped `{"username": "...", "key": "..."}`.
   2. Combine all 10 into **one** secret, `KAGGLE_ACCOUNTS_JSON`:
      ```json
      [
        {"username":"acct1","key":"xxxxxxxxxxxxxxxx"},
        {"username":"acct2","key":"xxxxxxxxxxxxxxxx"},
        ... (all 10)
      ]
      ```
   (If you only ever want to use 1 account, `KAGGLE_USERNAME` +
   `KAGGLE_KEY` as two plain secrets also works — no JSON needed. The pool
   JSON form is what you want for all 10.)

**2. E2B — you said 5 accounts.** For each account:
   1. Log in to that E2B account → https://e2b.dev/dashboard → **API Keys**
      → create a key (looks like `e2b_xxxxxxxxxxxxxxxxxxxxxxxx`).
   2. Combine all 5 into one secret, `E2B_ACCOUNTS_JSON`:
      ```json
      [
        {"apiKey":"e2b_xxxxxxxxxxxxxxxxxxxxxxxx","label":"acct1"},
        {"apiKey":"e2b_yyyyyyyyyyyyyyyyyyyyyyyy","label":"acct2"},
        ... (all 5)
      ]
      ```
   (Single account: `E2B_API_KEY` as one plain secret.)

**3. Supabase — you said 10 accounts/projects.** For each project (create
   one new project per Supabase account if you haven't already):
   1. https://app.supabase.com → open the project → **Project Settings** →
      **API** → copy the **Project URL** and the **`service_role` secret
      key** (NOT the `anon` public key — the service role key is required
      for trusted server-side writes that bypass Row Level Security).
   2. Combine all 10 into one secret, `SUPABASE_ACCOUNTS_JSON`:
      ```json
      [
        {"url":"https://xxxxxxxxxxxx.supabase.co","serviceKey":"eyJ...","label":"acct1"},
        {"url":"https://yyyyyyyyyyyy.supabase.co","serviceKey":"eyJ...","label":"acct2"},
        ... (all 10)
      ]
      ```
   3. If you want the vector-memory/RAG feature (`src/lib/embeddings.ts`)
      to use Supabase pgvector instead of the built-in D1 fallback store,
      run this once per project in the Supabase SQL editor (creates the
      table + RPC the code expects):
      ```sql
      create extension if not exists vector;
      create table if not exists nova_embeddings (
        id text primary key,
        workspace_id text not null,
        content text not null,
        embedding vector(768),
        created_at timestamptz default now()
      );
      create index on nova_embeddings using ivfflat (embedding vector_cosine_ops);
      create or replace function match_nova_embeddings(
        query_embedding vector(768), match_workspace_id text, match_count int
      ) returns table(id text, content text, similarity float)
      language sql stable as $$
        select id, content, 1 - (embedding <=> query_embedding) as similarity
        from nova_embeddings
        where workspace_id = match_workspace_id
        order by embedding <=> query_embedding
        limit match_count;
      $$;
      ```
   (Single project: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` as two plain
   secrets, same as before — this still works unchanged.)

**4. Cloudflare — you said 1 account (this is the deploy target, not a
   pooled integration).** No extra JSON needed. You just need:
   - A Cloudflare API token with **Pages: Edit** + **D1: Edit** + **R2: Edit**
     permissions (create at
     https://dash.cloudflare.com/profile/api-tokens → "Create Token" →
     "Edit Cloudflare Workers" template, or use the project's Deploy panel
     which handles this for you).
   - This is used for `wrangler pages deploy`, `wrangler d1 migrations
     apply`, etc. — see the Deployment section below.

### Setting the secrets

Local dev (`server/.dev.vars`, gitignored):
```
KAGGLE_ACCOUNTS_JSON=[{"username":"acct1","key":"..."}, ...]
E2B_ACCOUNTS_JSON=[{"apiKey":"e2b_...","label":"acct1"}, ...]
SUPABASE_ACCOUNTS_JSON=[{"url":"https://...supabase.co","serviceKey":"...","label":"acct1"}, ...]
```

Production (after deploy), one at a time — interactive, paste the value
when prompted, nothing is echoed or logged:
```bash
npx wrangler pages secret put KAGGLE_ACCOUNTS_JSON --project-name <name>
npx wrangler pages secret put E2B_ACCOUNTS_JSON --project-name <name>
npx wrangler pages secret put SUPABASE_ACCOUNTS_JSON --project-name <name>
```

After setting any of these, confirm with:
```bash
curl https://<your-worker>.pages.dev/api/observability/providers
```
which reports `{configured, accountCount, labels}` per provider — labels
only, **secret values are never echoed back by any endpoint.**

## What's Implemented vs. Outstanding

**Implemented this phase:**
- ✅ Streaming chat responses (SSE)
- ✅ Vector memory/RAG (Workers AI + D1 fallback + optional Supabase)
- ✅ Multi-agent delegation (planner → research/coder/writer/analyst/datasci/integrations)
- ✅ Scheduled/recurring workflows (cron-driven)
- ✅ Push notifications (job/approval/alert events)
- ✅ Rate limiting (fixed-window, D1-backed)
- ✅ API-key bearer auth with scoped keys
- ✅ PDF extraction + image OCR tools
- ✅ Kaggle dataset/kernel search + download + in-Worker ZIP extraction, with multi-account pooling
- ✅ Real sandboxed code execution via E2B (`code-execute`), with multi-account pooling and a full execution audit trail
- ✅ Generic Supabase table CRUD + Storage tools, with multi-project sticky sharding per workspace
- ✅ `datasci` agent: find-a-dataset → download → parse → actually run analysis code loop
- ✅ `integrations` agent: manage data in the user's own connected Supabase tables

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
   `LLM_AGENT_MODEL`, and optionally `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`
   or `SUPABASE_ACCOUNTS_JSON`, `KAGGLE_USERNAME`/`KAGGLE_KEY` or
   `KAGGLE_ACCOUNTS_JSON`, `E2B_API_KEY` or `E2B_ACCOUNTS_JSON`,
   `EXPO_ACCESS_TOKEN`) via `wrangler pages secret put <NAME>` — see
   [Provider Integrations & Credential Setup](#provider-integrations--credential-setup)
   above for exactly what each one should contain.
5. `npx wrangler d1 migrations apply webapp-production`.
6. `npm run build && npx wrangler pages deploy dist --project-name <name>`.

## Tech Stack

Hono, TypeScript, Cloudflare Workers/Pages, D1 (SQLite), R2, Workers AI,
Cron Triggers, `unpdf` (PDF text extraction), Expo push API.
