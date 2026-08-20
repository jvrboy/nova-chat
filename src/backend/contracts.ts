export type BackendMode = 'offline' | 'remote';
export type BackendHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'offline' | 'error';
export type BackendConfig = { mode: BackendMode; baseUrl: string; workspaceId: string; apiToken?: string; syncIntervalMinutes: number; allowRemoteTools: boolean; telemetryEnabled: boolean };
export type BackendHealth = { status: BackendHealthStatus; latencyMs?: number; version?: string; checkedAt: string; message: string };
export type BackendToolDescriptor = { id: string; name: string; description: string; version: string; risk: 'safe' | 'review' | 'sensitive'; capabilities: Array<'text' | 'files' | 'media' | 'network' | 'llm'>; enabled: boolean };
export type BackendEvent = { id: string; type: string; createdAt: string; payload: Record<string, unknown> };
export type SyncEnvelope = { clientId: string; workspaceId: string; cursor?: string; files: unknown[]; events: BackendEvent[]; sentAt: string };
export type SyncResult = { accepted: number; rejected: number; cursor?: string; conflicts: Array<{ id: string; reason: string }> };
export type BackendJob = { id: string; toolId: string; input: Record<string, unknown>; status: 'queued' | 'running' | 'completed' | 'failed'; createdAt: string; updatedAt: string; result?: unknown; error?: string };
export type BackendMutation = { id: string; kind: 'sync' | 'event' | 'job'; payload: unknown; attempts: number; nextAttemptAt: string; createdAt: string; lastError?: string };

export const defaultBackendConfig: BackendConfig = { mode: 'offline', baseUrl: '', workspaceId: 'nova-local', syncIntervalMinutes: 15, allowRemoteTools: false, telemetryEnabled: false };
