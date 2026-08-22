# Nova Chat

An Expo (React Native) AI workspace app — chat, agents, tools, memory, files,
and automation — backed by a Cloudflare Workers API with a full offline
fallback.

## Structure

```
nova-chat/
├── app/                    Expo Router screens (file-based routing)
├── src/
│   ├── state/NovaProvider.tsx   Core app state; sendMessage() calls the backend,
│   │                            local tool execution engine, approval workflow
│   ├── backend/                 Backend client, config, contracts, novaApi.ts
│   ├── agent/                   Local tool/agent definitions (offline capable)
│   │   └── utilityTools.ts      14 pure on-device utilities (calculator, codecs…)
│   ├── platform/                Native capability helpers (camera, mic, notifications)
│   ├── storage/                 On-device file workspace (AsyncStorage/FileSystem)
│   └── ui/theme.ts              Design tokens (colors incl. danger/warning, radii)
├── android/ , ios/          Expo-prebuilt native projects (for local/CI builds)
├── server/                  Cloudflare Workers + Hono + D1 backend (see server/README.md)
└── .github/workflows/       CI: unsigned Android APK + iOS simulator build
```

## What's New

### Mobile app
- **Real local tool execution** — selecting a safe tool (from Chat's tool
  drawer, the Tools Center, or the new Toolbox) now actually executes it
  on-device, records a durable Run/Job/Event trail, and posts the output into
  the conversation. Review-risk tools pause in **Operations → Approvals**, and
  approving one now executes it for real instead of leaving jobs queued forever.
- **New Toolbox screen** (`/toolbox`, linked from Settings) — instant access to
  14 on-device utilities: calculator, text metrics, case converter, slugify,
  Base64 codec, URL codec/parser, UUID generator, password generator, JSON
  formatter, regex tester, timestamp converter, number-base converter, color
  converter, and lorem-ipsum generator. Everything runs offline; nothing leaves
  the phone.
- **Slash commands in chat** — type `/help` to see `/calc`, `/wc`, `/uuid`,
  `/b64e`, `/b64d`, `/case`, `/slug`, `/pass`, `/json`, `/color`, `/ts`,
  `/base`, `/regex`, `/url`, `/lorem`. They execute instantly on-device even
  while offline.
- **Conversation export** — new header action shares the full transcript;
  approval prompts now render Approve/Reject for *any* pending backend
  approval, not just web research.
- **Memory Vault is real** — every assistant reply has a bookmark action that
  saves it to the on-device Memory Vault (tagged by tool), where it feeds
  Global Search and backend memory recall.
- **Agent data management** — Diagnostics now shows a Memories metric and
  offers one-tap JSON export (share sheet), restore-from-backup, or a
  confirmed reset of all runs, jobs, approvals, memories, and events stored
  on-device.
- **Read aloud** — every assistant reply has a speaker action that reads it
  out with on-device text-to-speech (`expo-speech`); sending a new message or
  tapping again stops playback.
- **Atomic rate limiter** — the D1 fixed-window counter now uses a single
  `INSERT … ON CONFLICT DO UPDATE … RETURNING` statement, eliminating the
  read-modify-write race that let concurrent requests exceed the limit.
- **Backend CI** — new `.github/workflows/backend-tests.yml` runs the server
  typecheck + Vitest suite on pushes/PRs touching `server/**`.
- Fixed: duplicate tool IDs causing React key collisions, the Tools tab hiding
  ~25 tools behind a stale category filter, double-send of messages when the
  SSE stream ended without parseable events (retries now happen only on true
  network failures), unreachable Audio screen, unvalidated push-notification
  deep links (now whitelisted), duplicated Settings rows, and scattered
  hardcoded colors (consolidated into `src/ui/theme.ts`).

### Backend (`server/`)
- **55 registered tools** (was 41), adding: `base64-codec`, `url-codec`,
  `jwt-decode`, `timestamp-convert`, `number-base-convert`, `case-convert`,
  `color-convert`, `slugify`, `password-generate`, `lorem-ipsum`,
  `cron-describe`, `keyword-extract`, `readability-score`, `html-strip`.
- Security hardening:
  - API-key minting/revocation now requires `workspace:admin` scope (a
    read-only key can no longer escalate itself), and requested scopes are
    validated against a known-scope allowlist.
  - The chat tool-calling loop enforces the same risk policy as
    `/api/tools/:id/run` — a prompt-injected completion can no longer invoke
    review/sensitive tools inside open chat.
  - SSRF guard (`assertPublicHttpsUrl`) blocks private/loopback/link-local/
    cloud-metadata hosts in `web-fetch`, `web-search-summary`, URL parsing,
    **and webhook connector endpoints** (validated at create time and again at
    test-fire, plus a 15 s delivery timeout).
- Robustness fixes:
  - Chat history now sends the model the **newest** 30 turns (previously the
    oldest 30 once a chat grew past that).
  - `regex-extract` no longer crashes when `flags` is omitted.
  - `csv-to-json` is RFC-4180-aware (quoted commas, escaped quotes, multiline cells).
  - `unit-convert` falls through cleanly across categories instead of
    reporting a misleading temperature error.
  - `qr-payload` escapes reserved WiFi characters.
  - `windowMinutes` on observability endpoints is validated/clamped (no more 500s).
  - Memory keyword search escapes LIKE wildcards.
  - Uploaded filenames are sanitized before use in R2 keys and
    Content-Disposition headers.
  - All LLM provider calls carry a 60 s abort timeout so a hung provider
    cannot stall request chains.
- **First automated backend test suite** (`pnpm test` inside `server/`) covering
  the new/fixed tools, the registry, and the SSRF guard.

### Connecting to the backend

1. Deploy or run `/server` locally (see `server/README.md`).
2. In the app: **Settings → Backend** → toggle "Remote", set **Base URL**
   (e.g. `http://localhost:3000` in dev, or your deployed Cloudflare Pages
   URL), and optionally an API key if the backend has one configured.
3. Chat now streams real replies with tool-calling and memory recall — and the
   app stays fully usable offline thanks to the local tool runtime.

## Local Development

```bash
pnpm install
pnpm run check     # tsc --noEmit (app)
pnpm start         # expo start
```

## Testing

```bash
pnpm run test:e2e        # app-side suite (41 tests across workflows + utilities)
cd server && pnpm test   # server-side suite (tool registry, fixes, SSRF guard)
```

## Unsigned Builds via GitHub Actions

Two workflows attempt fully unsigned builds on GitHub-hosted runners
(the direct-in-sandbox attempt on this Linux sandbox previously failed on
Gradle plugin resolution — see `UNSIGNED_BUILD_REPORT.md`):

- **`.github/workflows/android-unsigned.yml`** — `expo prebuild` + Gradle
  `assembleRelease` on `ubuntu-latest`, uploads the unsigned `.apk` as a
  workflow artifact. Runs on push to `main` (app/src/android changes) or
  manually via `workflow_dispatch`.
- **`.github/workflows/ios-unsigned.yml`** — `expo prebuild` + `xcodebuild`
  for the **iOS Simulator** (code signing disabled) on `macos-14`, uploads a
  zipped `.app` bundle. A real device `.ipa` is not possible without an
  Apple Developer signing identity/provisioning profile, which this project
  intentionally does not have — the simulator build is the closest usable
  unsigned artifact and can be installed with `xcrun simctl install`.

## Status / What's Implemented vs. Outstanding

**Done:**
- ✅ Real backend (`/server`) with 55 tools, 10 agents (with delegation),
  streaming chat, RAG/vector memory, scheduled workflows, push notifications,
  rate limiting, API-key auth — see `server/README.md`.
- ✅ Multi-account provider integrations: Kaggle, E2B, Firecrawl, Hugging Face,
  Supabase — each supports pooling many accounts to spread load.
- ✅ Mobile app wired to the backend (streaming chat, push registration,
  usage dashboard) with graceful offline fallback **and** real local tool
  execution (Toolbox + slash commands).
- ✅ Security pass: scope-gated key management, chat-loop risk enforcement,
  SSRF guards (web tools + webhook connectors), deep-link whitelist, filename
  sanitization, LLM timeouts, atomic rate limiting.
- ✅ Automated tests on both sides (app e2e + server tool suite) with a
  dedicated backend CI workflow.
- ✅ Voice output for assistant replies via on-device text-to-speech.
- ✅ GitHub Actions workflows verified green on real runs: Android unsigned
  APK, iOS simulator build, and backend tests all pass (fixes applied along
  the way: Node 22 for pnpm 11, `macos-15` for Xcode 16, removal of a
  sandbox-specific pnpm `storeDir` override).

**Outstanding / next steps:**
- ⬜ Backend not yet deployed to Cloudflare (deliberately deferred).
- ⬜ Per-user auth (Clerk/Auth0) not implemented — only workspace-level API
  keys / header auth. The header fallback remains intentional for local dev;
  production deployments should provision API keys.
- ⬜ Voice *input* (speech-to-text) not implemented — would require a backend
  STT provider; `expo-audio` is available for recording.
- ⬜ No Slack/email alert channel wired up.
- ⬜ Real (non-placeholder) D1 database id / R2 bucket — created at deploy
  time, not before.
