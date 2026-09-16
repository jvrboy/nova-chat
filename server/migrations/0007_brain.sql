-- Brain engine persistence (ported from the brain-project repo's Prisma/SQLite
-- schema to D1). Powers the /api/brain cognitive endpoints: a self-improving
-- reasoning engine with memory, a learning skill store, knowledge base,
-- reflections, training runs, and capability metrics.
CREATE TABLE IF NOT EXISTS brain_cognition (
  id TEXT PRIMARY KEY,
  cycle INTEGER NOT NULL,
  type TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.5,
  reasoning TEXT NOT NULL DEFAULT '',
  task_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brain_cognition_cycle ON brain_cognition(cycle);
CREATE INDEX IF NOT EXISTS idx_brain_cognition_task ON brain_cognition(task_id);

CREATE TABLE IF NOT EXISTS brain_memory (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT,
  importance REAL NOT NULL DEFAULT 0.5,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_access TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT,
  tags TEXT,
  related_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brain_memory_kind ON brain_memory(kind);
CREATE INDEX IF NOT EXISTS idx_brain_memory_importance ON brain_memory(importance);

CREATE TABLE IF NOT EXISTS brain_task (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1,
  input TEXT NOT NULL DEFAULT '',
  expected TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  actual TEXT,
  score REAL,
  mistakes TEXT,
  lessons TEXT,
  strategy TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brain_task_status ON brain_task(status);
CREATE INDEX IF NOT EXISTS idx_brain_task_category ON brain_task(category);

CREATE TABLE IF NOT EXISTS brain_skill (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pattern TEXT NOT NULL DEFAULT '{}',
  success_rate REAL NOT NULL DEFAULT 0,
  uses INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  mastery REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brain_reflection (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  scope TEXT NOT NULL,
  findings TEXT NOT NULL DEFAULT '[]',
  weaknesses TEXT,
  improvements TEXT,
  applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brain_training_run (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  task_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  avg_score REAL NOT NULL DEFAULT 0,
  capabilities TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS brain_knowledge (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brain_knowledge_subject ON brain_knowledge(subject);
CREATE INDEX IF NOT EXISTS idx_brain_knowledge_predicate ON brain_knowledge(predicate);

CREATE TABLE IF NOT EXISTS brain_metric (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value REAL NOT NULL,
  cycle INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brain_metric_key ON brain_metric(key);
