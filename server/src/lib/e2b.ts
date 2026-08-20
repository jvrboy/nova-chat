// E2B (e2b.dev) client: creates ephemeral cloud sandboxes and executes real
// code inside them over plain HTTPS (no SDK dependency — we talk to the
// documented REST surface directly, which is all fetch()-friendly and works
// fine from a Cloudflare Worker).
//
// Two HTTP surfaces are involved:
//   1. Control plane (api.e2b.app): create/get/list/kill sandboxes.
//      Auth: header `X-API-Key: <key>`.
//   2. Sandbox plane (the sandbox's own envd, reached through
//      https://{port}-{sandboxId}.e2b.app): code execution. The
//      code-interpreter template exposes a small Jupyter-like HTTP server on
//      port 49999 with POST /execute (streams NDJSON: stdout/stderr/result/
//      error/number_of_executions lines) and POST /contexts (create an
//      execution context to run in a specific language / persist state).
//
// Requires an E2B_API_KEY (from https://e2b.dev/dashboard -> your team -> API
// Keys). Supports pooling across multiple E2B accounts via E2B_ACCOUNTS_JSON
// so concurrent executions spread across accounts instead of hitting one
// account's concurrent-sandbox cap.
import type { Bindings } from './types'
import { parsePool, pickPoolEntry, poolSummary } from './credentialPool'

const CONTROL_PLANE = 'https://api.e2b.app'
const JUPYTER_PORT = 49999
const DEFAULT_TEMPLATE = 'code-interpreter-v1' // official E2B template with Python/JS/R/Java/Bash execution + Jupyter kernel
const DEFAULT_SANDBOX_TIMEOUT_SECONDS = 120

export type E2bAccount = { apiKey: string; label?: string }

function poolFromEnv(env: Bindings): E2bAccount[] {
  const pooled = parsePool(env.E2B_ACCOUNTS_JSON).filter((e) => e.apiKey) as unknown as E2bAccount[]
  if (pooled.length) return pooled
  if (env.E2B_API_KEY) return [{ apiKey: env.E2B_API_KEY }]
  return []
}

export function e2bStatus(env: Bindings) {
  return poolSummary(poolFromEnv(env) as unknown as Record<string, string>[], 'label')
}

async function pickAccount(env: Bindings, db?: D1Database): Promise<E2bAccount> {
  const accounts = poolFromEnv(env)
  if (!accounts.length) {
    throw new Error(
      'E2B is not configured. Set E2B_API_KEY (single account) or E2B_ACCOUNTS_JSON (multi-account pool) as Worker secrets. Get an API key at https://e2b.dev/dashboard -> API Keys.'
    )
  }
  const picked = await pickPoolEntry(db, 'e2b', accounts as unknown as Record<string, string>[])
  return (picked?.entry ?? accounts[0]) as unknown as E2bAccount
}

export type E2bSandboxHandle = { sandboxId: string; apiKey: string }

export async function e2bCreateSandbox(
  env: Bindings,
  db: D1Database | undefined,
  opts: { template?: string; timeoutSeconds?: number } = {}
): Promise<E2bSandboxHandle> {
  const account = await pickAccount(env, db)
  const response = await fetch(`${CONTROL_PLANE}/sandboxes`, {
    method: 'POST',
    headers: { 'X-API-Key': account.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateID: opts.template ?? DEFAULT_TEMPLATE,
      timeout: opts.timeoutSeconds ?? DEFAULT_SANDBOX_TIMEOUT_SECONDS,
    }),
  })
  if (!response.ok) throw new Error(`E2B sandbox create failed: ${response.status} ${await response.text().catch(() => '')}`)
  const data = (await response.json()) as { sandboxID: string }
  return { sandboxId: data.sandboxID, apiKey: account.apiKey }
}

export async function e2bKillSandbox(handle: E2bSandboxHandle): Promise<void> {
  await fetch(`${CONTROL_PLANE}/sandboxes/${handle.sandboxId}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': handle.apiKey },
  }).catch(() => {}) // best-effort teardown; the sandbox will also auto-expire via its timeout
}

export type E2bExecutionResult = {
  stdout: string
  stderr: string
  results: Array<Record<string, unknown>>
  error?: { name: string; value: string; traceback: string }
  executionCount?: number
}

/** Runs a single snippet of code inside a fresh sandbox (create -> execute ->
 * kill), returning its stdout/stderr/results/error. This is the real
 * "generate AND run" primitive backing the `code-execute` tool. */
export async function e2bRunCode(
  env: Bindings,
  db: D1Database | undefined,
  code: string,
  opts: { language?: 'python' | 'javascript' | 'typescript' | 'r' | 'bash'; timeoutMs?: number } = {}
): Promise<E2bExecutionResult> {
  const handle = await e2bCreateSandbox(env, db)
  try {
    return await e2bExecuteInSandbox(handle, code, opts)
  } finally {
    await e2bKillSandbox(handle)
  }
}

/** Executes code inside an already-running sandbox (for callers that want to
 * run multiple snippets against the same warm sandbox/state — e.g. a
 * multi-step data-analysis agent loop). Caller is responsible for eventually
 * calling e2bKillSandbox. */
export async function e2bExecuteInSandbox(
  handle: E2bSandboxHandle,
  code: string,
  opts: { language?: 'python' | 'javascript' | 'typescript' | 'r' | 'bash'; timeoutMs?: number } = {}
): Promise<E2bExecutionResult> {
  const sandboxUrl = `https://${JUPYTER_PORT}-${handle.sandboxId}.e2b.app`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000)
  try {
    const response = await fetch(`${sandboxUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'E2b-Sandbox-Id': handle.sandboxId,
        'E2b-Sandbox-Port': String(JUPYTER_PORT),
      },
      body: JSON.stringify({ code, language: opts.language ?? 'python' }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`E2B code execution failed: ${response.status} ${await response.text().catch(() => '')}`)
    if (!response.body) throw new Error('E2B code execution returned no response body.')

    // The endpoint streams newline-delimited JSON events; accumulate them into
    // one structured result rather than exposing the raw stream to callers.
    const result: E2bExecutionResult = { stdout: '', stderr: '', results: [] }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) continue
        applyExecutionEvent(result, line)
      }
    }
    if (buffer.trim()) applyExecutionEvent(result, buffer.trim())
    return result
  } finally {
    clearTimeout(timeout)
  }
}

function applyExecutionEvent(result: E2bExecutionResult, line: string) {
  let msg: Record<string, unknown>
  try { msg = JSON.parse(line) } catch { return }
  switch (msg.type) {
    case 'stdout':
      result.stdout += String(msg.text ?? '')
      break
    case 'stderr':
      result.stderr += String(msg.text ?? '')
      break
    case 'result': {
      const { type, is_main_result, ...rest } = msg
      result.results.push(rest)
      break
    }
    case 'error':
      result.error = { name: String(msg.name ?? 'Error'), value: String(msg.value ?? ''), traceback: String(msg.traceback ?? '') }
      break
    case 'number_of_executions':
      result.executionCount = Number(msg.execution_count ?? 0)
      break
    default:
      break
  }
}
