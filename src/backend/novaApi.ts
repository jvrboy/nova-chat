// Real client for the Nova Cloudflare Workers backend (see /server).
// Talks to /api/chats, /api/push, /api/observability/dashboard using the
// existing BackendConfig (base URL, workspace id, optional API token) that
// was already built for the remote/offline toggle in src/backend/contracts.ts.
//
// Design: this client is intentionally dumb (no local caching) — NovaProvider
// decides when to call it and how to fall back to on-device behavior if the
// backend is unreachable or disabled, so the app keeps working offline.

import { loadBackendConfig } from './client';
import type { BackendConfig } from './contracts';

export type NovaChatMessage = { id: string; role: 'user' | 'assistant'; text: string; tool?: string; createdAt?: string };

function headersFor(config: BackendConfig): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
  if (config.apiToken) headers.set('Authorization', `Bearer ${config.apiToken}`);
  else {
    // Dev/local fallback auth mode understood by the backend when no API key is set.
    headers.set('X-Workspace-Id', config.workspaceId || 'nova-local');
    headers.set('X-Actor-Id', 'nova-mobile');
  }
  return headers;
}

export class NovaApiError extends Error {}

async function request<T>(config: BackendConfig, path: string, init: RequestInit = {}): Promise<T> {
  if (!config.baseUrl) throw new NovaApiError('Backend base URL is not configured.');
  const url = `${config.baseUrl.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, { ...init, headers: headersFor(config) });
  const bodyText = await response.text();
  let parsed: unknown = undefined;
  try { parsed = bodyText ? JSON.parse(bodyText) : undefined; } catch { parsed = bodyText; }
  if (!response.ok) {
    const message = parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)
      ? String((parsed as Record<string, unknown>).error)
      : `Backend request failed (${response.status})`;
    throw new NovaApiError(message);
  }
  return parsed as T;
}

export async function getActiveBackendConfig(): Promise<BackendConfig> {
  return loadBackendConfig();
}

export function isRemoteBackendEnabled(config: BackendConfig): boolean {
  return config.mode === 'remote' && Boolean(config.baseUrl);
}

export async function backendCreateChat(config: BackendConfig, title = 'New conversation'): Promise<{ id: string; title: string }> {
  return request(config, '/api/chats', { method: 'POST', body: JSON.stringify({ title }) });
}

export async function backendGetMessages(config: BackendConfig, chatId: string): Promise<{ messages: NovaChatMessage[] }> {
  return request(config, `/api/chats/${chatId}/messages`);
}

/**
 * Sends a message and returns the full assistant reply as one JSON response.
 * Used as the default (most compatible) path; see `streamNovaMessage` for the
 * token-by-token variant.
 */
export async function backendSendMessage(config: BackendConfig, chatId: string, text: string): Promise<{
  userMessage: NovaChatMessage;
  assistantMessage: NovaChatMessage;
}> {
  return request(config, `/api/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
}

export type BackendToolRun = { ok?: boolean; result?: unknown; error?: string; requiresConfirmation?: boolean; approvalId?: string; message?: string; tool?: string; durationMs?: number };
export type ToolAnalyticsRow = { tool_id: string; executions: number; successes: number; failures: number; avg_duration_ms: number; p95_duration_ms: number };
export type ToolExecutionRecord = { id: string; actor_id: string; tool_id: string; status: 'success' | 'error'; risk: string; duration_ms: number; error_message?: string | null; created_at: string };

/** Invoke one of the backend's registered production tools directly from the tool drawer. */
export async function backendRunTool(config: BackendConfig, toolId: string, input: Record<string, unknown>, confirm = false): Promise<BackendToolRun> {
  return request(config, `/api/tools/${encodeURIComponent(toolId)}/run`, { method: 'POST', body: JSON.stringify({ input, confirm }) });
}

export async function backendAccessRequest<T>(config: BackendConfig, path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(config, `/api/access${path}`, init);
}

export async function backendDecideApproval(config: BackendConfig, approvalId: string, approved: boolean): Promise<{ id: string; status: string }> {
  return request(config, `/api/approvals/${encodeURIComponent(approvalId)}/decision`, { method: 'POST', body: JSON.stringify({ approved }) });
}

export type UsageDashboard = {
  windowHours: number;
  requests: { requests: number; server_errors?: number; avg_latency_ms?: number };
  agentRuns: Array<{ agent_key: string; count: number }>;
  jobStats: Array<{ status: string; count: number }>;
  toolStats: ToolAnalyticsRow[];
  recentToolExecutions: ToolExecutionRecord[];
  pendingApprovals: number;
  chatCount: number;
  memoryCount: number;
};

export async function backendGetDashboard(config: BackendConfig): Promise<UsageDashboard> {
  return request(config, '/api/observability/dashboard');
}

export type StreamEventHandlers = {
  onUserMessage?: (message: NovaChatMessage) => void;
  onDelta?: (text: string) => void;
  onToolCall?: (tool: string, args: Record<string, unknown>) => void;
  onToolResult?: (result: unknown) => void;
  onDone?: (assistantMessage: NovaChatMessage) => void;
  onError?: (error: Error) => void;
};

/**
 * Streams a chat reply via the backend's SSE endpoint (`POST /:id/stream`).
 * React Native's fetch does not universally expose a readable stream body,
 * so this parses the raw response text incrementally where supported and
 * falls back to a single flush when streaming isn't available in the runtime
 * (Hermes / older RN fetch) — the caller still gets delta + done callbacks,
 * just possibly with the full text delivered as one "delta" in that case.
 */
export async function streamNovaMessage(config: BackendConfig, chatId: string, text: string, handlers: StreamEventHandlers): Promise<void> {
  if (!config.baseUrl) { handlers.onError?.(new NovaApiError('Backend base URL is not configured.')); return; }
  const url = `${config.baseUrl.replace(/\/$/, '')}/api/chats/${chatId}/stream`;

  try {
    const response = await fetch(url, { method: 'POST', headers: headersFor(config), body: JSON.stringify({ text }) });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new NovaApiError(errText || `Stream request failed (${response.status})`);
    }

    const processBlock = (block: string) => {
      const lines = block.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) return;
      try {
        const payload = JSON.parse(data);
        if (event === 'user_message') handlers.onUserMessage?.(payload);
        else if (event === 'delta') handlers.onDelta?.(payload.text ?? '');
        else if (event === 'tool_call') handlers.onToolCall?.(payload.tool, payload.args ?? {});
        else if (event === 'tool_result') handlers.onToolResult?.(payload);
        else if (event === 'done') handlers.onDone?.(payload.assistantMessage);
      } catch { /* ignore malformed SSE block */ }
    };

    // Preferred path: real streaming body (works with Hermes' fetch + expo's
    // polyfill in recent Expo SDKs, and always on web).
    const body = response.body as unknown as ReadableStream<Uint8Array> | undefined;
    if (body && typeof (body as any).getReader === 'function') {
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sepIndex: number;
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          processBlock(block);
        }
      }
      if (buffer.trim()) processBlock(buffer);
      return;
    }

    // Fallback: no streaming body available in this runtime — read the whole
    // response as text and parse all SSE blocks at once. UI still gets
    // incremental-looking updates via onDelta calls, just not truly live.
    const fullText = await response.text();
    for (const block of fullText.split('\n\n')) processBlock(block);
  } catch (error) {
    handlers.onError?.(error instanceof Error ? error : new NovaApiError('Streaming failed.'));
  }
}

export async function backendRegisterPushToken(config: BackendConfig, token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
  await request(config, '/api/push/register', { method: 'POST', body: JSON.stringify({ token, platform }) });
}
