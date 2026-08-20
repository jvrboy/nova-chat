import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteFile, ensureWorkspaceDirectory, getFileInfo, pickFiles, readFileText, shareFile, writeFileText } from '../platform/capabilities';

export type NovaFileKind = 'document' | 'image' | 'audio' | 'video' | 'other';
export type NovaFile = { id: string; name: string; uri: string; mimeType: string; size: number; kind: NovaFileKind; tags: string[]; createdAt: string; updatedAt: string; source: 'import' | 'capture' | 'generated' | 'manual' };
export type StorageSettings = { autoIndex: boolean; maxFileSizeMb: number; preferredExport: 'json' | 'text'; keepCache: boolean };

const INDEX_KEY = 'nova.workspace.index.v1';
const SETTINGS_KEY = 'nova.workspace.settings.v1';
const BACKUP_KEY = 'nova.workspace.index.backup.v1';
export const defaultStorageSettings: StorageSettings = { autoIndex: true, maxFileSizeMb: 50, preferredExport: 'json', keepCache: false };

const parse = <T,>(value: string | null, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const kindFor = (mimeType: string, name: string): NovaFileKind => { const value = `${mimeType} ${name}`.toLowerCase(); if (value.includes('image')) return 'image'; if (value.includes('audio')) return 'audio'; if (value.includes('video')) return 'video'; if (value.includes('pdf') || value.includes('text') || value.includes('document')) return 'document'; return 'other'; };
const safeName = (name: string) => name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || `nova-file-${Date.now()}`;

export async function loadWorkspace() { const [index, settings] = await Promise.all([AsyncStorage.getItem(INDEX_KEY), AsyncStorage.getItem(SETTINGS_KEY)]); return { files: parse<NovaFile[]>(index, []), settings: { ...defaultStorageSettings, ...parse<Partial<StorageSettings>>(settings, {}) } }; }
export async function saveWorkspace(files: NovaFile[], settings: StorageSettings) { const payload = JSON.stringify(files); await AsyncStorage.multiSet([[BACKUP_KEY, payload], [INDEX_KEY, payload], [SETTINGS_KEY, JSON.stringify(settings)]]); }
export async function recoverWorkspace() { const backup = await AsyncStorage.getItem(BACKUP_KEY); const files = parse<NovaFile[]>(backup, []); if (backup) await AsyncStorage.setItem(INDEX_KEY, backup); return files; }
export async function updateStorageSettings(settings: StorageSettings) { await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

export async function importPickedFiles(existing: NovaFile[], settings: StorageSettings) {
  const result = await pickFiles(true);
  if (result.canceled || !result.assets?.length) return existing;
  const root = await ensureWorkspaceDirectory();
  const imported: NovaFile[] = [];
  for (const asset of result.assets) {
    const name = safeName(asset.name ?? 'imported-file');
    const target = `${root}${Date.now()}-${name}`;
    const info = await getFileInfo(asset.uri);
    const size = Number('size' in info && info.size ? info.size : asset.size ?? 0);
    if (size > settings.maxFileSizeMb * 1024 * 1024) continue;
    if (asset.uri !== target) await (await import('expo-file-system/legacy')).copyAsync({ from: asset.uri, to: target });
    const now = new Date().toISOString();
    imported.push({ id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, uri: target, mimeType: asset.mimeType ?? 'application/octet-stream', size, kind: kindFor(asset.mimeType ?? '', name), tags: [], createdAt: now, updatedAt: now, source: 'import' });
  }
  return [...imported, ...existing];
}

export async function createTextFile(existing: NovaFile[], name: string, contents: string, source: NovaFile['source'] = 'manual') {
  const root = await ensureWorkspaceDirectory(); const clean = safeName(name); const uri = `${root}${Date.now()}-${clean}`; await writeFileText(uri, contents); const now = new Date().toISOString();
  const created: NovaFile = { id: `file-${Date.now()}`, name: clean, uri, mimeType: 'text/plain', size: contents.length, kind: 'document', tags: [], createdAt: now, updatedAt: now, source }; return [created, ...existing];
}
export async function removeWorkspaceFile(files: NovaFile[], id: string) { const file = files.find((item) => item.id === id); if (file) await deleteFile(file.uri); return files.filter((item) => item.id !== id); }
export async function exportWorkspace(files: NovaFile[], settings: StorageSettings) { const payload = settings.preferredExport === 'text' ? files.map((file) => `${file.name}\t${file.kind}\t${file.size} bytes`).join('\n') : JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), files }, null, 2); const created = await createTextFile([], `nova-workspace.${settings.preferredExport === 'text' ? 'txt' : 'json'}`, payload, 'generated'); await shareFile(created[0].uri, settings.preferredExport === 'text' ? 'text/plain' : 'application/json'); return payload; }
export async function inspectWorkspaceFile(file: NovaFile) { try { return await readFileText(file.uri); } catch { return `Unable to read ${file.name}. The original may have been removed or permission may have been revoked.`; } }
