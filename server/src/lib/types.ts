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
