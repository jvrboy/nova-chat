-- Advanced features: RAG embeddings, push notifications, scheduled workflows,
-- per-key auth tracking, rate limiting support.

-- Generic embeddings store (D1 fallback vector store; Supabase pgvector is used
-- instead when SUPABASE_URL + SUPABASE_SERVICE_KEY are configured).
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('memory','message')),
  owner_id TEXT NOT NULL,
  content TEXT NOT NULL,
  vector TEXT NOT NULL, -- JSON array of floats
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_embeddings_workspace ON embeddings(workspace_id, owner_type);

-- Expo push notification tokens registered by the mobile app.
CREATE TABLE IF NOT EXISTS push_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, token)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_workspace ON push_tokens(workspace_id);

-- Scheduled (cron-lite) execution support for user-defined workflows.
ALTER TABLE workflows ADD COLUMN schedule_minutes INTEGER;
ALTER TABLE workflows ADD COLUMN next_run_at TEXT;

-- Per-key usage tracking for auth + rate limiting.
ALTER TABLE api_keys ADD COLUMN last_used_at TEXT;
ALTER TABLE request_log ADD COLUMN api_key_id TEXT;
CREATE INDEX IF NOT EXISTS idx_request_log_apikey ON request_log(api_key_id, created_at);

-- Fixed-window rate limiting counters (per API key or per workspace).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- Multi-agent handoff tracing: records when one agent run delegates to another.
CREATE TABLE IF NOT EXISTS agent_delegations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  parent_run_id TEXT NOT NULL,
  child_run_id TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_delegations_parent ON agent_delegations(parent_run_id);
