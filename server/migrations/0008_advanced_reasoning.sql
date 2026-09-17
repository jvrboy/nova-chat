-- Migration 0008 — Advanced reasoning + long-running tasks + continuous training
-- Adds the tables that power the advanced chat engine and long-task system:
--   reasoning_traces    — every advanced chat reply's full reasoning trace
--   long_tasks          — persistent background tasks ("never stops until done")
--   capability_history  — brain capability snapshots over time (continuous training)
--   tool_executions     — per-tool execution log for analytics & feedback loops

-- ── Reasoning traces ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reasoning_traces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  chat_id TEXT,
  message_id TEXT,
  strategy TEXT NOT NULL,
  steps_count INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  iterations INTEGER NOT NULL DEFAULT 0,
  continuations INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  final_text TEXT NOT NULL DEFAULT '',
  success INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_workspace ON reasoning_traces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_chat ON reasoning_traces(chat_id);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_strategy ON reasoning_traces(strategy);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_created ON reasoning_traces(created_at);

-- ── Long-running tasks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS long_tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | planning | working | verifying | needs_more | completed | failed | cancelled
  plan TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT '{}',
  steps TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  verified INTEGER NOT NULL DEFAULT 0,
  final_answer TEXT,
  strategy TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_long_tasks_workspace ON long_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_long_tasks_status ON long_tasks(status);
CREATE INDEX IF NOT EXISTS idx_long_tasks_updated ON long_tasks(updated_at);

-- ── Capability history (continuous training) ─────────────────────────
CREATE TABLE IF NOT EXISTS capability_history (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL,                 -- logic | math | language | planning | creative | coding | reasoning | self_awareness | learning_rate | adaptability
  value REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'chat',      -- chat | training | reflection | feedback
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_capability_history_cap ON capability_history(capability);
CREATE INDEX IF NOT EXISTS idx_capability_history_created ON capability_history(created_at);

-- ── Tool executions (for analytics & feedback) ───────────────────────
CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'chat', -- chat | agent | long_task | cron | manual
  input_summary TEXT,
  output_summary TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_exec_workspace ON tool_executions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_tool ON tool_executions(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_created ON tool_executions(created_at);

-- ── Training schedule (configurable continuous training) ─────────────
CREATE TABLE IF NOT EXISTS training_schedule (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  rounds_per_run INTEGER NOT NULL DEFAULT 2,
  difficulty_start INTEGER NOT NULL DEFAULT 1,
  difficulty_end INTEGER NOT NULL DEFAULT 5,
  categories TEXT NOT NULL DEFAULT '["logic","math","language","planning","creative","coding","reasoning"]',
  last_run_at TEXT,
  next_run_at TEXT,
  interval_minutes INTEGER NOT NULL DEFAULT 360,    -- default: every 6 hours
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed a default global schedule if none exists
INSERT OR IGNORE INTO training_schedule (id, enabled, rounds_per_run, difficulty_start, difficulty_end, interval_minutes)
VALUES ('global_default', 1, 2, 1, 5, 360);
