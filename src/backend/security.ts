import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiKeyRecord } from './domain';
export type Session = { userId: string; workspaceId: string; role: 'owner' | 'member' | 'viewer'; expiresAt: string; scopes: string[] };
const SESSION_KEY = 'nova.backend.session.v1';
const KEY_META = 'nova.backend.api-key-meta.v1';
export const defaultSession: Session = { userId: 'local-user', workspaceId: 'nova-local', role: 'owner', expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(), scopes: ['workspace:read', 'workspace:write', 'jobs:run', 'connectors:manage'] };
export async function loadSession() { const raw = await AsyncStorage.getItem(SESSION_KEY); try { return raw ? JSON.parse(raw) as Session : defaultSession; } catch { return defaultSession; } }
export async function saveSession(session: Session) { await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)); return session; }
export function can(session: Session, scope: string) { return session.scopes.includes(scope) || session.role === 'owner'; }
export async function createApiKeyMetadata(name: string, scopes: string[]): Promise<ApiKeyRecord> { const list = await loadApiKeyMetadata(); const record: ApiKeyRecord = { id: `key-${Date.now()}`, workspaceId: 'nova-local', name, prefix: `nv_${Math.random().toString(36).slice(2, 8)}`, scopes, createdAt: new Date().toISOString() }; await AsyncStorage.setItem(KEY_META, JSON.stringify([record, ...list])); return record; }
export async function loadApiKeyMetadata() { try { return JSON.parse(await AsyncStorage.getItem(KEY_META) ?? '[]') as ApiKeyRecord[]; } catch { return []; } }
export async function revokeApiKey(id: string) { const list = await loadApiKeyMetadata(); const next = list.map((item) => item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item); await AsyncStorage.setItem(KEY_META, JSON.stringify(next)); return next; }
export function createWebhookSignature(payload: string, secret: string) { let hash = 0; const value = `${secret}:${payload}`; for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0; return `nova-${Math.abs(hash).toString(16)}`; }
