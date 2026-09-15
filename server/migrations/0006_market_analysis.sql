-- Persistent storage for market-analysis runs produced by the ported
-- nexus-analysis engine (see src/lib/market and src/routes/market.ts).
CREATE TABLE IF NOT EXISTS market_analysis (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'synthetic' CHECK (source IN ('provided','synthetic')),
  overall_bias TEXT NOT NULL DEFAULT 'NEUTRAL',
  overall_confidence REAL NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_market_analysis_workspace_time ON market_analysis(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_market_analysis_workspace_symbol ON market_analysis(workspace_id, symbol, created_at);
