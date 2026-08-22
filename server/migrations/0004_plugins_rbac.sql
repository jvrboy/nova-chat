-- User-defined HTTP plugins and workspace-scoped role-based tool access.
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roles_workspace ON roles(workspace_id);

CREATE TABLE IF NOT EXISTS role_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, actor_id)
);
CREATE INDEX IF NOT EXISTS idx_role_members_role ON role_members(role_id);

CREATE TABLE IF NOT EXISTS role_tool_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id),
  tool_id TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (role_id, tool_id)
);

CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST' CHECK (method IN ('GET','POST')),
  auth_env_key TEXT,
  parameters TEXT NOT NULL DEFAULT '{}',
  risk TEXT NOT NULL DEFAULT 'review' CHECK (risk IN ('safe','review','sensitive')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plugins_workspace ON plugins(workspace_id, enabled);
