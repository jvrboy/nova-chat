# Nova Chat

> Advanced AI workspace with **real, downloadable artifacts** (Claude.ai style) — backed by
> **Supabase** for persistent storage and deployable to **Cloudflare Pages/Workers**.

Built with Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui.

## ✨ Features

### Real Artifacts (no more code-blocks-as-screenshots)
Every artifact Nova generates is a real, downloadable file persisted to your backend:
- Markdown, plain text, code (any language), HTML, JSON, CSV, YAML, XML, SVG, Mermaid
- Each artifact has a stable URL: `/api/artifacts/[id]/download`
- Versioned (every edit bumps the version)
- Open in a dedicated preview panel — render markdown, syntax-highlight code, render SVG, iframe HTML, parse JSON

### Persistent Storage (no localStorage!)
- **Production:** Supabase Postgres with full schema (chats, messages, artifacts, settings, tool_runs, memories, file_uploads)
- **Local dev:** Prisma + SQLite (auto-fallback when Supabase env vars aren't set)
- The frontend NEVER touches localStorage — every write goes through `/api/*` routes
- Per-user settings (theme, fonts, model config, system prompts, API keys, tool permissions) all persisted server-side

### 9 Built-in Themes
Light · Dark · Nord · Dracula · Solarized Dark · Cyberpunk · Tokyo Night · Gruvbox · Midnight

### 11 Fonts
Sans: Inter · Geist Sans · IBM Plex Sans
Mono: JetBrains Mono · Fira Code · IBM Plex Mono · Source Code Pro · Geist Mono
Display: Space Grotesk · Playfair Display
Serif: Lora

### 12 Backend Tools (server-side execution with audit trail)
- **Utility:** Calculator, UUID Generator, Base64 Codec, Hash Generator (SHA-256/512/MD5), Password Generator, QR Code (SVG), Lorem Ipsum
- **Data:** JSON Formatter, CSV → JSON
- **Web:** Web Search, Web Page Reader (real, via z-ai-web-dev-sdk)
- **AI:** Image Generation
- **System:** Current Time (with timezone)
- Every tool execution is persisted to the `tool_runs` table with input/output/duration/status

### Streaming Chat (SSE)
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

Open http://localhost:3000 — Nova Chat runs immediately with SQLite as the local backend.

## 🚀 Deploy to Cloudflare Pages

```bash
# Set your Cloudflare credentials
export CLOUDFLARE_API_TOKEN=cfat_xxx
export CLOUDFLARE_ACCOUNT_ID=xxx

# Build & deploy
bun run deploy
```

## 🚀 Enable Supabase (Production)

1. Create a project at https://supabase.com
2. Open SQL Editor → New query → paste contents of [`src/lib/supabase/schema.sql`](src/lib/supabase/schema.sql) → Run
3. Get your Project URL, anon key, and service role key from Settings → API
4. Set them as env vars in Cloudflare Pages → Settings → Environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```
5. Redeploy — Nova Chat now persists all data to Supabase (no more local SQLite).

## 🏗 Architecture

```
src/
├── app/
│   ├── page.tsx              # Main chat UI
│   ├── layout.tsx           # 11 fonts + theme provider
│   ├── globals.css          # 9 theme palettes (CSS variables)
│   └── api/                  # Backend routes (all runtime: nodejs)
│       ├── chat/             # SSE streaming chat
│       ├── chats/[id]        # Chat CRUD
│       ├── messages/         # Message CRUD
│       ├── artifacts/[id]    # Artifact CRUD + /download endpoint
│       ├── settings/         # Settings get/put
│       ├── tools/[tool]      # Tool execution
│       ├── models/           # Available LLM models
│       └── setup/            # Status + SQL schema download
├── components/
│   ├── nova-provider.tsx    # Global state (Zustand-style context)
│   └── nova/                 # Chat UI components
├── lib/
│   ├── supabase/             # Schema + client/server modules
│   ├── storage.ts            # Storage adapter (Supabase OR Prisma)
│   ├── themes.ts             # 9 themes
│   ├── fonts.ts              # 11 fonts
│   ├── artifacts/            # Pure helpers + server persistence
│   ├── tools/                # 12 backend tool implementations
│   └── types.ts              # Shared types (no Prisma dep)
└── prisma/schema.prisma      # Local dev DB schema
```

## 🔐 Security Model

- All API keys stored encrypted in `user_settings.api_keys` (jsonb)
- API keys NEVER exposed to the browser — only used server-side in API routes
- Tools have risk levels: `safe` (auto-run) · `review` (approval required) · `sensitive` (never auto-run)
- RLS policies are pre-configured on every table — flip the policy to `auth.uid() = user_id` once you wire auth
- SSE streams don't include API keys in any payload

## 📊 Database Schema (Supabase)

8 tables, 4 enums, RLS-enabled, with auto-updated `updated_at` triggers:

| Table | Purpose |
|-------|---------|
| `user_profiles` | User accounts (extensible to auth) |
| `chats` | Conversation metadata, model, settings |
| `messages` | User/assistant/system/tool messages |
| `artifacts` | Real, downloadable file content |
| `user_settings` | Per-user preferences (theme, fonts, API keys, prompts) |
| `tool_runs` | Audit log of every tool execution |
| `memories` | Long-term memory (pgvector embedding-ready) |
| `file_uploads` | Uploaded file metadata |

## 📜 License

MIT
