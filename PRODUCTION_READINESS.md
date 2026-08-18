# Production readiness

## User-facing model routing

The client exposes only two Nova models:

| Model | User-facing behavior |
| --- | --- |
| Nova 2 | Balanced and thoughtful responses. |
| Nova Fast | Quick everyday help. |

Provider names and API-key counts are backend concerns. Each completion omits a forced provider unless an internal caller explicitly supplies one, so the gateway applies the configured provider order and rotates keys automatically.

## Persistent resources

Projects, conversations, messages, and stars are protected by the authenticated procedures. When an unauthenticated user attempts to create a project or star a persistent chat, the client starts the OAuth login flow instead of only displaying a dead-end toast.

## Sandbox

The in-process sandbox is intended only for bounded calculations. Production limits are 10 seconds maximum execution time and 50,000 output characters. Imports, filesystem, network, process, child-process, and dynamic-evaluation capabilities are blocked. For untrusted, dependency-heavy, or long-running code, use the existing E2B connection instead.

## Optional Cloudflare and Supabase backends

Set the following Vercel environment variables when the corresponding services are available:

| Variable | Purpose |
| --- | --- |
| `CLOUDFLARE_WORKER_URL` | Health-checkable Worker endpoint for edge jobs, scheduled work, or a future D1/KV/R2 adapter. |
| `SUPABASE_URL` | Supabase project REST endpoint. |
| `SUPABASE_ANON_KEY` | Supabase public/anonymous key for health checks and future client-safe integrations. |

The protected `ai.backendConnections` query reports configured capabilities without exposing secrets. The `ai.backendHealth` mutation performs bounded health probes. The session connectors for Cloudflare and Supabase were present in configuration, but their MCP endpoints were unavailable to the current execution client, so no account resources were mutated automatically.

## Release checks

Run `pnpm check`, `pnpm test`, `pnpm build`, and `git diff --check` before deployment. After deploying, verify the production URL returns HTTP 200 and exercise the AI completion route, fallback behavior, tool-permission registry, and sandbox capability metadata with an authenticated test session.
