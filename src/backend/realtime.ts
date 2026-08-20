import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProjectRecord, TaskRecord } from './domain';
import { enqueueMutation, loadBackendConfig } from './client';

export type RealtimeEntity = ProjectRecord | TaskRecord;
export type RealtimeEntityType = 'project' | 'task';
export type RealtimeOperation = 'upsert' | 'delete';
export type RealtimeMessage = { type: 'hello' | 'snapshot' | 'change' | 'ack' | 'error' | 'ping' | 'pong'; workspaceId: string; clientId: string; revision: number; entityType?: RealtimeEntityType; operation?: RealtimeOperation; entity?: RealtimeEntity; entityId?: string; changes?: Partial<RealtimeEntity>; conflict?: { localRevision: number; serverRevision: number; entityId: string }; sentAt: string; messageId: string };
export type RealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error';
export type RealtimeState = { status: RealtimeStatus; revision: number; lastMessageAt?: string; pending: number; error?: string };
export type RealtimeHandlers = { onChange?: (message: RealtimeMessage) => void; onSnapshot?: (message: RealtimeMessage) => void; onStatus?: (state: RealtimeState) => void; onConflict?: (message: RealtimeMessage) => void };

const CLIENT_ID_KEY = 'nova.realtime.client-id.v1';
const REVISION_KEY = 'nova.realtime.revision.v1';
const PENDING_KEY = 'nova.realtime.pending.v1';
const parse = <T,>(value: string | null, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function getRealtimeClientId() { const current = await AsyncStorage.getItem(CLIENT_ID_KEY); if (current) return current; const created = id('realtime-client'); await AsyncStorage.setItem(CLIENT_ID_KEY, created); return created; }
export async function loadRealtimeRevision() { return Number(await AsyncStorage.getItem(REVISION_KEY) ?? 0); }
export async function loadPendingRealtimeMessages() { return parse<RealtimeMessage[]>(await AsyncStorage.getItem(PENDING_KEY), []); }
async function savePending(messages: RealtimeMessage[]) { await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(messages.slice(-500))); }

export class RealtimeSyncClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private state: RealtimeState = { status: 'disabled', revision: 0, pending: 0 };
  private readonly handlers: RealtimeHandlers;
  private config?: Awaited<ReturnType<typeof loadBackendConfig>>;
  constructor(handlers: RealtimeHandlers = {}) { this.handlers = handlers; }
  private publish(patch: Partial<RealtimeState>) { this.state = { ...this.state, ...patch }; this.handlers.onStatus?.(this.state); }
  getState() { return this.state; }
  async start() { this.config = await loadBackendConfig(); const pending = await loadPendingRealtimeMessages(); const revision = await loadRealtimeRevision(); this.publish({ revision, pending: pending.length }); if (this.config.mode !== 'remote' || !this.config.baseUrl) { this.publish({ status: 'offline' }); return; } this.stopped = false; this.connect(); }
  stop() { this.stopped = true; if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.socket?.close(); this.socket = null; this.publish({ status: 'disabled' }); }
  private connect() { if (!this.config || this.stopped) return; this.publish({ status: this.reconnectAttempt ? 'reconnecting' : 'connecting', error: undefined }); const url = this.config.baseUrl.replace(/^http/, 'ws') + `/v1/realtime?workspaceId=${encodeURIComponent(this.config.workspaceId)}`; try { this.socket = new WebSocket(url); this.socket.onopen = () => { this.reconnectAttempt = 0; this.publish({ status: 'connected' }); void this.flushPending(); this.send({ type: 'hello', workspaceId: this.config!.workspaceId, clientId: '', revision: this.state.revision, sentAt: new Date().toISOString(), messageId: id('hello') }); }; this.socket.onmessage = (event) => this.receive(String(event.data)); this.socket.onerror = () => this.publish({ status: 'error', error: 'WebSocket transport error.' }); this.socket.onclose = () => { if (!this.stopped) this.scheduleReconnect(); }; } catch (error) { this.publish({ status: 'error', error: error instanceof Error ? error.message : 'Unable to create WebSocket.' }); this.scheduleReconnect(); } }
  private scheduleReconnect() { if (this.stopped) return; this.reconnectAttempt += 1; const delay = Math.min(30_000, 1000 * 2 ** Math.min(5, this.reconnectAttempt)); this.publish({ status: 'reconnecting' }); this.reconnectTimer = setTimeout(() => this.connect(), delay); }
  private async receive(raw: string) { const message = parse<RealtimeMessage | null>(raw, null); if (!message) return; this.publish({ lastMessageAt: message.sentAt, revision: Math.max(this.state.revision, message.revision) }); await AsyncStorage.setItem(REVISION_KEY, String(this.state.revision)); if (message.type === 'change') { if (message.conflict) this.handlers.onConflict?.(message); this.handlers.onChange?.(message); } if (message.type === 'snapshot') this.handlers.onSnapshot?.(message); if (message.type === 'ping') this.send({ ...message, type: 'pong', messageId: id('pong') }); }
  private send(message: RealtimeMessage) { if (!this.socket || this.socket.readyState !== 1) return false; this.socket.send(JSON.stringify(message)); return true; }
  async publishChange(entityType: RealtimeEntityType, operation: RealtimeOperation, entity: RealtimeEntity, changes?: Partial<RealtimeEntity>) { const clientId = await getRealtimeClientId(); const message: RealtimeMessage = { type: 'change', workspaceId: this.config?.workspaceId ?? 'nova-local', clientId, revision: this.state.revision + 1, entityType, operation, entity, entityId: entity.id, changes, sentAt: new Date().toISOString(), messageId: id('change') }; if (this.send(message)) { this.publish({ revision: message.revision }); await AsyncStorage.setItem(REVISION_KEY, String(message.revision)); return true; } const pending = await loadPendingRealtimeMessages(); await savePending([...pending, message]); await enqueueMutation('event', [message], 'WebSocket unavailable; queued for reconnect.'); this.publish({ pending: pending.length + 1, status: 'offline' }); return false; }
  private async flushPending() { const pending = await loadPendingRealtimeMessages(); if (!pending.length) return; const remaining: RealtimeMessage[] = []; for (const message of pending) if (!this.send(message)) remaining.push(message); await savePending(remaining); this.publish({ pending: remaining.length }); }
}
