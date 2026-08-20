-- Multi-account credential pooling, Kaggle dataset cache, and E2B execution
-- audit trail, supporting the Supabase/Kaggle/E2B tool integrations.

-- Durable round-robin cursor per credential pool (e.g. "kaggle", "e2b",
-- "supabase"), so rotation across multiple accounts survives across separate
-- Worker invocations instead of resetting each time.
CREATE TABLE IF NOT EXISTS credential_rotation (
  pool_name TEXT PRIMARY KEY,
  cursor INTEGER NOT NULL DEFAULT 0
);

-- Cache of Kaggle datasets downloaded into R2, so repeated requests for the
-- same dataset (a common pattern when an agent iterates on the same data)
-- don't re-download from Kaggle every time.
CREATE TABLE IF NOT EXISTS kaggle_dataset_cache (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  owner_slug TEXT NOT NULL,
  dataset_slug TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, owner_slug, dataset_slug)
);
CREATE INDEX IF NOT EXISTS idx_kaggle_cache_workspace ON kaggle_dataset_cache(workspace_id);

-- Audit trail of E2B code-execution runs (separate from generic tool audit
-- log so execution-specific fields — exit status, stdout/stderr sizes — are
-- easy to query without parsing the audit_log's generic metadata JSON).
CREATE TABLE IF NOT EXISTS code_executions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL,
  language TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  ok INTEGER NOT NULL,
  stdout_chars INTEGER NOT NULL DEFAULT 0,
  stderr_chars INTEGER NOT NULL DEFAULT 0,
  error_name TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_code_executions_workspace ON code_executions(workspace_id, created_at);
