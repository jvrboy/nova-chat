# Nova Chat

An Expo (React Native) AI workspace app — chat, agents, tools, memory, files,
and automation — now backed by a real Cloudflare Workers API instead of a
purely on-device simulation.

## Structure

```
nova-chat/
├── app/                    Expo Router screens (file-based routing)
├── src/
│   ├── state/NovaProvider.tsx   Core app state; sendMessage() now calls the backend
│   ├── backend/                 Backend client, config, contracts, novaApi.ts
│   ├── agent/                   Local tool/agent definitions (offline fallback)
│   ├── platform/                Native capability helpers (camera, mic, notifications)
│   ├── storage/                 On-device file workspace (AsyncStorage/FileSystem)
│   └── ui/                      Theme and shared UI primitives
├── android/ , ios/          Expo-prebuilt native projects (for local/CI builds)
├── server/                  Cloudflare Workers + Hono + D1 backend (see server/README.md)
└── .github/workflows/       CI: unsigned Android APK + iOS simulator build
```

## What Changed: Real Backend Integration

The app previously simulated everything (chat replies, memory, agents) purely
in AsyncStorage with keyword-matched replies. It now has a real backend
(`/server`) and the mobile app is wired to use it:

- **`src/backend/novaApi.ts`** — new API client: `backendCreateChat`,
  `backendSendMessage`, `streamNovaMessage` (SSE), `backendRegisterPushToken`,
  `backendGetDashboard`.
- **`src/state/NovaProvider.tsx`** — `sendMessage()` now:
  1. If a backend is connected (Settings → Backend → toggle "Remote" + set a
     base URL), lazily creates a backend chat, then streams the reply via
     `POST /api/chats/:id/stream` (falls back to the single-shot
     `POST /api/chats/:id/messages` JSON endpoint if the runtime doesn't
     expose a readable stream body).
  2. If no backend is connected, falls back to the original local heuristic
     reply — **the app remains fully usable offline**, it just won't have
     real LLM intelligence, tool-calling, or memory recall.
- **Chat screen** (`app/(tabs)/chat.tsx`) shows live connection status (cloud
  icon + "Live AI backend connected" vs "Local heuristics only"), a
  streaming indicator, and inline error states per message.
- **Notifications screen** (`app/notifications.tsx`) can now register the
  device's Expo push token with the backend (`POST /api/push/register`) so
  job completions, approval decisions, and alert incidents can push a
  real notification even when the app isn't open.
- **New Usage Dashboard** (`app/usage-dashboard.tsx`, linked from Settings)
  surfaces the backend's `GET /api/observability/dashboard` (24h requests,
  errors, latency, agent runs, job status, pending approvals) directly in
  the app instead of only via API calls.

### Connecting to the backend

1. Deploy or run `/server` locally (see `server/README.md`).
2. In the app: **Settings → Backend** → toggle "Remote", set **Base URL**
   (e.g. `http://localhost:3000` in dev, or your deployed Cloudflare Pages
   URL), and optionally an API key if the backend has one configured.
3. Chat now streams real replies with tool-calling and memory recall.

The backend is **not yet deployed to Cloudflare** in this repo state — local
dev only, by design (deployment is a deliberate, separate next step).

## Local Development

```bash
pnpm install
pnpm run check     # tsc --noEmit
pnpm start         # expo start
```

## Testing

```bash
pnpm run test:e2e
```

## Dependency Updates

`pnpm update` was run to reduce known vulnerabilities in transitive
dev-tooling dependencies (Metro/Babel/PostCSS, pulled in by the Expo SDK
toolchain, not runtime app code):

- **Before**: 12 vulnerabilities (1 low, 4 moderate, 7 high)
- **After**: 8 vulnerabilities (1 low, 3 moderate, 4 high)

The remaining 8 are pinned transitively by Expo SDK 54's own toolchain
(`@expo/metro-config` → `postcss`, `@expo/cli` → `@babel/core`, etc.) and
cannot be bumped independently without breaking the Expo SDK version;
resolving them fully requires an Expo SDK major upgrade, which is out of
scope for this pass.

## Unsigned Builds via GitHub Actions

Two new workflows attempt fully unsigned builds on GitHub-hosted runners
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

Both workflows are new in this pass and have **not yet had a completed run
observed** (they trigger on push to `main`/manual dispatch) — check the
Actions tab after this push lands to confirm they succeed on GitHub's
runners.

## Status / What's Implemented vs. Outstanding

**Done this pass:**
- ✅ Real backend (`/server`) with 36 tools, 10 agents (with delegation),
  streaming chat, RAG/vector memory, scheduled workflows, push
  notifications, rate limiting, API-key auth — see `server/README.md`.
- ✅ Multi-account provider integrations: Kaggle (dataset/kernel search +
  download), E2B (real sandboxed code execution), and Supabase (generic
  table CRUD + Storage, sticky-sharded across many projects) — each
  supports pooling many accounts to spread load. See
  [server/README.md § Provider Integrations & Credential Setup](server/README.md#provider-integrations--credential-setup)
  for exactly which API keys are needed and how to get them.
- ✅ Mobile app wired to the backend (streaming chat, push registration,
  usage dashboard) with graceful offline fallback.
- ✅ UI improvements: connection status indicator, streaming cursor, error
  states, usage dashboard screen.
- ✅ `pnpm update` run (12 → 8 vulnerabilities; remainder pinned by Expo SDK).
- ✅ GitHub Actions workflows added for unsigned Android + iOS builds.

**Outstanding / next steps:**
- ⬜ Confirm the two new GitHub Actions workflows actually succeed on a real
  run (not yet observed to complete).
- ⬜ Backend not yet deployed to Cloudflare (deliberately deferred).
- ⬜ Per-user auth (Clerk/Auth0) not implemented — only workspace-level API
  keys / header auth.
- ⬜ Voice input/output for the chat screen not implemented (`expo-audio`
  is already a dependency but unused for this).
- ⬜ `requireScope()` exists on the backend but isn't enforced on any route
  yet.
- ⬜ No automated backend test suite; no backend CI pipeline.
- ⬜ No Slack/email alert channel wired up.
- ⬜ Real (non-placeholder) D1 database id / R2 bucket — created at deploy
  time, not before.
