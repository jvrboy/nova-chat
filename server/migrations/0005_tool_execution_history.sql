-- Durable tool execution telemetry for usage analytics and performance monitoring.
CREATE TABLE IF NOT EXISTS tool_execution_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  risk TEXT NOT NULL DEFAULT 'safe' CHECK (risk IN ('safe','review','sensitive')),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  input_chars INTEGER NOT NULL DEFAULT 0,
  output_chars INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_history_workspace_time ON tool_execution_history(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_history_workspace_tool ON tool_execution_history(workspace_id, tool_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_history_workspace_actor ON tool_execution_history(workspace_id, actor_id, created_at);
