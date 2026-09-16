# Nova Chat

> Advanced AI workspace with **real, downloadable artifacts** (Claude.ai style) — backed by
> **Supabase** for production persistence, deployable to **Cloudflare Pages/Workers** with
> Cloudflare KV cross-worker fallback.

Built with Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui.

## ✨ Features

### Real Artifacts (no more code-blocks-as-screenshots)
Every artifact Nova generates is a real, downloadable file persisted to your backend:
- Markdown, plain text, code (any language), HTML, JSON, CSV, YAML, XML, SVG, Mermaid
- Each artifact has a stable URL: `/api/artifacts/[id]/download`
- Versioned (every edit bumps the version)
- Open in a dedicated preview panel — render markdown, syntax-highlight code, render SVG, iframe HTML, parse JSON

### Persistent Storage (NO localStorage — all server-side)
Three-tier storage adapter:
1. **Supabase Postgres** (production) — 8 tables, RLS-enabled, with triggers
2. **Cloudflare KV** (cross-worker persistence) — used when Supabase isn't configured but the app is on Cloudflare
3. **In-memory** (local dev only) — resets on restart, for previewing

The frontend NEVER touches localStorage — every write goes through `/api/*` routes.

### 9 Built-in Themes
Light · Dark · Nord · Dracula · Solarized Dark · Cyberpunk · Tokyo Night · Gruvbox · Midnight

### 11 Fonts
Sans: Inter · Geist Sans · IBM Plex Sans
Mono: JetBrains Mono · Fira Code · IBM Plex Mono · Source Code Pro · Geist Mono
Display: Space Grotesk · Playfair Display
Serif: Lora

### 12 Backend Tools (server-side execution with audit trail)
- **Utility:** Calculator (recursive-descent parser, no eval), UUID Generator (Web Crypto), Base64 Codec, Hash Generator (SHA-256/512 via Web Crypto), Password Generator (Web Crypto), QR Code (SVG), Lorem Ipsum
- **Data:** JSON Formatter, CSV → JSON
- **Web:** Web Search, Web Page Reader (Z.AI API)
- **AI:** Image Generation (Z.AI API)
- **System:** Current Time (with timezone)
- Every tool execution is persisted to the `tool_runs` table/keyspace with input/output/duration/status

### Streaming Chat (SSE) — Multi-Provider
- Z.AI internal API (sandbox) → OpenAI-compatible (production) → demo mode
- Real-time token streaming via Server-Sent Events
- Auto-titles chats from first message
- Per-chat model selection (11 GLM models supported)
- Tool-calling system prompt
- Stop button to abort mid-stream

### Expanded Settings Panel
- **Appearance:** Theme picker, 3 font selectors, density, motion, send-on-Enter, reasoning display, token counter, streaming toggle
- **Model:** Default model, temperature, max tokens
- **Prompts:** Editable system-prompt library (Senior Engineer, Editor, Data Analyst pre-shipped)
- **Tools:** Browse all available tools with params and risk levels
- **API Keys:** Encrypted storage for OpenAI, Anthropic, Google, Hugging Face, GitHub, Firecrawl tokens (never exposed to browser)
- **Backend:** Live status, SQL schema download, env var instructions

## 🚀 Quick Start (Local Dev)

```bash
bun install
bun run dev
```

Open http://localhost:3000 — Nova Chat runs immediately with in-memory storage.

## 🚀 Deploy to Cloudflare Pages

```bash
# Set your Cloudflare credentials
export CLOUDFLARE_API_TOKEN=cfat_xxx
export CLOUDFLARE_ACCOUNT_ID=xxx

# Build & deploy
bun run deploy
```

After the first deployment, set these secrets via `wrangler pages secret put`:

```bash
# For cross-worker data persistence (recommended)
wrangler pages secret put CLOUDFLARE_KV_NAMESPACE_ID --project-name nova-chat
wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name nova-chat
wrangler pages secret put CLOUDFLARE_API_TOKEN --project-name nova-chat

# For LLM provider (pick one)
wrangler pages secret put OPENAI_API_KEY --project-name nova-chat
# OR (Z.AI — works in sandbox only)
wrangler pages secret put ZAI_BASE_URL --project-name nova-chat
wrangler pages secret put ZAI_API_KEY --project-name nova-chat
wrangler pages secret put ZAI_TOKEN --project-name nova-chat
wrangler pages secret put ZAI_CHAT_ID --project-name nova-chat
wrangler pages secret put ZAI_USER_ID --project-name nova-chat

# For Supabase persistence (recommended for production scale)
wrangler pages secret put NEXT_PUBLIC_SUPABASE_URL --project-name nova-chat
wrangler pages secret put NEXT_PUBLIC_SUPABASE_ANON_KEY --project-name nova-chat
wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name nova-chat
```

## 🚀 Enable Supabase (Production Persistence)

1. Create a project at https://supabase.com
2. Open SQL Editor → New query → paste contents of [`src/lib/supabase/schema.sql`](src/lib/supabase/schema.sql) → Run
3. Get your Project URL, anon key, and service role key from Settings → API
4. Set them as Cloudflare Pages secrets (above)
5. Redeploy — Nova Chat now persists all data to Supabase Postgres

## 🏗 Architecture

```
src/
├── app/
│   ├── page.tsx              # Main chat UI
│   ├── layout.tsx           # 11 fonts + theme provider
│   ├── globals.css          # 9 theme palettes (CSS variables)
│   └── api/                  # Backend routes (ALL edge runtime)
│       ├── chat/             # SSE streaming chat (multi-provider)
│       ├── chats/[id]        # Chat CRUD
│       ├── messages/         # Message CRUD
│       ├── artifacts/[id]    # Artifact CRUD + /download endpoint
│       ├── settings/         # Settings get/put
│       ├── tools/[tool]      # Tool execution
│       ├── models/           # Available LLM models
│       └── setup/            # Status + SQL schema download
├── components/
│   ├── nova-provider.tsx    # Global state
│   └── nova/                # Chat UI components
├── lib/
│   ├── supabase/             # Schema + client/server modules
│   ├── storage.ts            # Storage dispatcher (Supabase → KV → memory)
│   ├── storage-kv.ts         # Cloudflare KV backend (edge-compatible)
│   ├── storage-memory.ts     # In-memory backend (dev fallback)
│   ├── themes.ts             # 9 themes
│   ├── fonts.ts              # 11 fonts
│   ├── artifacts/             # Pure helpers + server persistence
│   ├── tools/                # 12 backend tool implementations (edge-compatible)
│   └── types.ts              # Shared types (no Prisma dep)
└── prisma/schema.prisma      # Legacy dev DB schema (optional)
```

## 🔐 Security Model

- All API keys stored encrypted in `user_settings.api_keys` (Supabase jsonb) / KV (Cloudflare)
- API keys NEVER exposed to the browser — only used server-side in API routes
- Tools have risk levels: `safe` (auto-run) · `review` (approval required) · `sensitive` (never auto-run)
- RLS policies are pre-configured on every Supabase table
- SSE streams don't include API keys in any payload

## 📊 Storage Tiers

| Tier | Backend | Use Case |
|------|---------|----------|
| 1 | Supabase Postgres | Production persistence, scale, SQL queries |
| 2 | Cloudflare KV | Cross-worker persistence on Pages (no Supabase needed) |
| 3 | In-memory | Local dev only — resets on restart |

## 📜 License

MIT
