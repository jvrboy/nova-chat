import AsyncStorage from '@react-native-async-storage/async-storage';
import { BackendEvent } from './contracts';
const KEY = 'nova.backend.telemetry.v1';
const REDACT_KEYS = new Set(['token', 'apiToken', 'authorization', 'email', 'password', 'secret']);
const redact = (value: unknown): unknown => { if (Array.isArray(value)) return value.map(redact); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, REDACT_KEYS.has(key) ? '[redacted]' : redact(item)])); return value; };
const parse = <T,>(value: string | null, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
export async function recordTelemetry(type: string, payload: Record<string, unknown>, sampleRate = 1) { if (Math.random() > sampleRate) return null; const event: BackendEvent = { id: `telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, payload: redact(payload) as Record<string, unknown>, createdAt: new Date().toISOString() }; const events = parse<BackendEvent[]>(await AsyncStorage.getItem(KEY), []); await AsyncStorage.setItem(KEY, JSON.stringify([event, ...events].slice(0, 500))); return event; }
export async function loadTelemetry() { return parse<BackendEvent[]>(await AsyncStorage.getItem(KEY), []); }
export async function clearTelemetry() { await AsyncStorage.removeItem(KEY); }
export async function exportTelemetry() { return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), events: await loadTelemetry() }, null, 2); }
