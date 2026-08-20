export type Bindings = {
  DB: D1Database
  BUCKET?: R2Bucket
  AI?: Ai
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  LLM_MODEL?: string
  LLM_AGENT_MODEL?: string
  // Optional Supabase pgvector backend for RAG (BYOK deploys only). When unset,
  // embeddings fall back to the D1 `embeddings` table with in-memory cosine search.
  SUPABASE_URL?: string
  SUPABASE_SERVICE_KEY?: string
  // Optional: JSON array of { url, serviceKey, label } to pool multiple Supabase
  // projects/accounts (see lib/supabase.ts and lib/credentialPool.ts). Takes
  // priority over the single SUPABASE_URL/SUPABASE_SERVICE_KEY pair above.
  SUPABASE_ACCOUNTS_JSON?: string
  // Optional single-account Kaggle credentials (username + API key from
  // kaggle.com/settings -> API -> "Create New Token", which downloads a
  // kaggle.json file). See lib/kaggle.ts.
  KAGGLE_USERNAME?: string
  KAGGLE_KEY?: string
  // Optional: JSON array of { username, key, label } to pool multiple Kaggle
  // accounts. Takes priority over the single KAGGLE_USERNAME/KAGGLE_KEY pair.
  KAGGLE_ACCOUNTS_JSON?: string
  // Optional single-account E2B API key (from e2b.dev/dashboard -> API Keys).
  // See lib/e2b.ts.
  E2B_API_KEY?: string
  // Optional: JSON array of { apiKey, label } to pool multiple E2B accounts.
  // Takes priority over the single E2B_API_KEY above.
  E2B_ACCOUNTS_JSON?: string
  // Optional: raises the default per-key rate limit ceiling (see lib/ratelimit.ts).
  RATE_LIMIT_PER_MINUTE?: string
  // Optional: enables Expo push delivery (lib/push.ts falls back to a no-op log without it).
  EXPO_ACCESS_TOKEN?: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: {
    workspaceId: string
    actorId: string
    apiKeyId?: string
    apiKeyScopes?: string[]
    authMode: 'header' | 'apikey'
  }
}

export type Risk = 'safe' | 'review' | 'sensitive'

export type ToolCapability = 'text' | 'files' | 'media' | 'network' | 'llm'

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'
