/**
 * Cloudflare KV-backed storage — works on edge runtime, persists across worker instances.
 * Used as the fallback when Supabase isn't configured but the app is deployed on Cloudflare.
 */

import type { ChatRow, MessageRow, MessageRole, ArtifactRow, SettingsRow, ToolRunRow } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

function isKvConfigured() {
  return !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_API_TOKEN &&
    process.env.CLOUDFLARE_KV_NAMESPACE_ID
  );
}

function makeId(): string {
  try {
    if (typeof globalThis !== "undefined" && (globalThis as any).crypto?.randomUUID) {
      return (globalThis as any).crypto.randomUUID();
    }
  } catch {}
  const g = (globalThis as any).crypto;
  const bytes = new Uint8Array(16);
  if (g?.getRandomValues) g.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

const KV_BASE = "https://api.cloudflare.com/client/v4/accounts";

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const url = `${KV_BASE}/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KV GET ${res.status}`);
    return await res.json() as T;
  } catch (e) {
    return null;
  }
}

async function kvSet<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
  try {
    const url = `${KV_BASE}/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}${ttlSeconds ? `?expiration_ttl=${ttlSeconds}` : ""}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function kvDelete(key: string): Promise<boolean> {
  try {
    const url = `${KV_BASE}/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function kvList(prefix: string): Promise<string[]> {
  try {
    const url = `${KV_BASE}/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE_ID}/keys?prefix=${encodeURIComponent(prefix)}&limit=1000`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    return (data.result || []).map((k: any) => k.name);
  } catch {
    return [];
  }
}

// ============ Keys ============

const CHAT_KEY = (id: string) => `chat:${id}`;
const CHAT_IDS_KEY = "chats:ids"; // JSON array of chat IDs (sorted by updatedAt desc)
const MESSAGES_KEY = (chatId: string) => `messages:${chatId}`; // JSON array
const ARTIFACTS_KEY = (chatId: string) => `artifacts:${chatId}`; // JSON array of artifact IDs
const ARTIFACT_KEY = (id: string) => `artifact:${id}`;
const SETTINGS_KEY = "settings:default";
const TOOL_RUN_KEY = (id: string) => `toolrun:${id}`;
const TOOL_RUNS_KEY = "toolruns:ids";

// ============ Chat ============

export async function listChats(limit = 50): Promise<ChatRow[]> {
  const ids = await kvGet<string[]>(CHAT_IDS_KEY) || [];
  const chats: ChatRow[] = [];
  for (const id of ids.slice(0, limit)) {
    const c = await kvGet<ChatRow & { archived?: boolean }>(CHAT_KEY(id));
    if (c && !c.archived) chats.push(c);
  }
  return chats;
}

export async function getChat(id: string): Promise<ChatRow | null> {
  return await kvGet<ChatRow>(CHAT_KEY(id));
}

export async function createChat(input: { title?: string; model?: string; systemPrompt?: string; }): Promise<ChatRow> {
  const now = new Date().toISOString();
  const id = makeId();
  const chat: ChatRow = {
    id,
    title: input.title || "New chat",
    model: input.model || "glm-4.6",
    systemPrompt: input.systemPrompt,
    temperature: 0.7,
    maxTokens: 4096,
    toolsEnabled: true,
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await kvSet(CHAT_KEY(id), chat);
  // Prepend to chat ids list (max 200 to prevent unbounded growth)
  const ids = await kvGet<string[]>(CHAT_IDS_KEY) || [];
  ids.unshift(id);
  await kvSet(CHAT_IDS_KEY, ids.slice(0, 200));
  return chat;
}

export async function updateChat(id: string, patch: Partial<ChatRow>): Promise<void> {
  const c = await kvGet<ChatRow & { updatedAt?: string }>(CHAT_KEY(id));
  if (!c) return;
  const updated = { ...c, ...patch, updatedAt: new Date().toISOString() };
  await kvSet(CHAT_KEY(id), updated);
  // Re-sort ids by moving updated to top
  const ids = await kvGet<string[]>(CHAT_IDS_KEY) || [];
  const filtered = ids.filter((x) => x !== id);
  filtered.unshift(id);
  await kvSet(CHAT_IDS_KEY, filtered.slice(0, 200));
}

export async function deleteChat(id: string): Promise<void> {
  await kvDelete(CHAT_KEY(id));
  // Remove messages
  const msgs = await kvGet<MessageRow[]>(MESSAGES_KEY(id)) || [];
  for (const m of msgs) {
    // artifact deletes handled separately if needed
  }
  await kvDelete(MESSAGES_KEY(id));
  await kvDelete(ARTIFACTS_KEY(id));
  const ids = await kvGet<string[]>(CHAT_IDS_KEY) || [];
  await kvSet(CHAT_IDS_KEY, ids.filter((x) => x !== id));
}

// ============ Messages ============

export async function listMessages(chatId: string, limit = 100): Promise<MessageRow[]> {
  const msgs = await kvGet<MessageRow[]>(MESSAGES_KEY(chatId)) || [];
  return msgs.slice(-limit);
}

export async function createMessage(input: {
  chatId: string;
  role: MessageRow["role"];
  content?: string;
  status?: MessageRow["status"];
  model?: string | null;
  toolName?: string | null;
  toolInput?: any;
  toolOutput?: string | null;
  artifactIds?: string[];
}): Promise<MessageRow> {
  const id = makeId();
  const msg: MessageRow = {
    id,
    chatId: input.chatId,
    role: input.role,
    content: input.content || "",
    status: input.status || "complete",
    model: input.model,
    toolName: input.toolName,
    toolInput: input.toolInput,
    toolOutput: input.toolOutput,
    artifactIds: input.artifactIds || [],
    createdAt: new Date().toISOString(),
  };
  const msgs = await kvGet<MessageRow[]>(MESSAGES_KEY(input.chatId)) || [];
  msgs.push(msg);
  // Cap at 500 messages per chat to prevent unbounded growth
  if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
  await kvSet(MESSAGES_KEY(input.chatId), msgs);
  // Touch chat's updatedAt
  const chat = await kvGet<ChatRow>(CHAT_KEY(input.chatId));
  if (chat) {
    const updated = { ...chat, updatedAt: new Date().toISOString() };
    await kvSet(CHAT_KEY(input.chatId), updated);
  }
  return msg;
}

export async function updateMessage(id: string, patch: Partial<MessageRow>): Promise<void> {
  // Find the message by scanning chats (since we don't have a reverse index by message ID)
  // The frontend will send the chatId implicitly via the existing artifactId pattern.
  // For our use case, the chat/route.ts always knows the chatId from the request body.
  // This is a best-effort update — it scans recent chats.
  // To keep it simple, we expect callers to know the chatId; we'll do a no-op if we can't find the message.
  // (The chat/route.ts in our codebase already has the chatId from req.body — it uses updateMessage(messageId, patch)
  //  without chatId. Let's make this work by scanning the most recent chats.)
  const chatIds = await kvGet<string[]>(CHAT_IDS_KEY) || [];
  for (const chatId of chatIds.slice(0, 50)) {
    const msgs = await kvGet<MessageRow[]>(MESSAGES_KEY(chatId)) || [];
    const idx = msgs.findIndex((m) => m.id === id);
    if (idx >= 0) {
      msgs[idx] = { ...msgs[idx], ...patch };
      await kvSet(MESSAGES_KEY(chatId), msgs);
      return;
    }
  }
}

// ============ Artifacts ============

export async function listArtifacts(chatId?: string, limit = 50): Promise<ArtifactRow[]> {
  if (chatId) {
    const ids = await kvGet<string[]>(ARTIFACTS_KEY(chatId)) || [];
    const out: ArtifactRow[] = [];
    for (const id of ids.slice(0, limit)) {
      const a = await kvGet<ArtifactRow>(ARTIFACT_KEY(id));
      if (a) out.push(a);
    }
    return out;
  }
  // List all — scan chat IDs (best-effort)
  const chatIds = await kvGet<string[]>(CHAT_IDS_KEY) || [];
  const out: ArtifactRow[] = [];
  for (const cid of chatIds.slice(0, limit)) {
    const ids = await kvGet<string[]>(ARTIFACTS_KEY(cid)) || [];
    for (const id of ids) {
      const a = await kvGet<ArtifactRow>(ARTIFACT_KEY(id));
      if (a) out.push(a);
    }
  }
  return out.slice(0, limit);
}

export async function getArtifact(id: string): Promise<ArtifactRow | null> {
  return await kvGet<ArtifactRow>(ARTIFACT_KEY(id));
}

export async function createArtifact(input: {
  chatId?: string;
  messageId?: string;
  title: string;
  type: string;
  language?: string;
  content: string;
  mimeType?: string;
  bytes?: number;
  tags?: string[];
}): Promise<ArtifactRow> {
  const id = makeId();
  const now = new Date().toISOString();
  const row: ArtifactRow = {
    id,
    chatId: input.chatId,
    messageId: input.messageId,
    title: input.title,
    type: input.type,
    language: input.language,
    content: input.content,
    mimeType: input.mimeType,
    bytes: input.bytes ?? input.content.length,
    version: 1,
    tags: input.tags || [],
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  };
  await kvSet(ARTIFACT_KEY(id), row);
  if (input.chatId) {
    const ids = await kvGet<string[]>(ARTIFACTS_KEY(input.chatId)) || [];
    ids.unshift(id);
    await kvSet(ARTIFACTS_KEY(input.chatId), ids.slice(0, 200));
  }
  return row;
}

export async function updateArtifact(id: string, patch: Partial<ArtifactRow>): Promise<void> {
  const a = await kvGet<ArtifactRow>(ARTIFACT_KEY(id));
  if (!a) return;
  const updated: ArtifactRow = {
    ...a,
    ...patch,
    version: (a.version || 1) + 1,
    updatedAt: new Date().toISOString(),
  };
  if (patch.content !== undefined) updated.bytes = patch.content.length;
  await kvSet(ARTIFACT_KEY(id), updated);
}

export async function deleteArtifact(id: string): Promise<void> {
  await kvDelete(ARTIFACT_KEY(id));
}

// ============ Settings ============

export async function getSettings(): Promise<SettingsRow> {
  const s = await kvGet<SettingsRow>(SETTINGS_KEY);
  if (s) return s;
  // Initialize with defaults
  await kvSet(SETTINGS_KEY, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

export async function updateSettings(patch: Partial<SettingsRow>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  await kvSet(SETTINGS_KEY, updated);
}

// ============ Tool Runs ============

export async function recordToolRun(input: {
  chatId?: string;
  toolName: string;
  toolInput: any;
  toolOutput?: any;
  status?: string;
  riskLevel?: string;
  durationMs?: number;
  error?: string;
}): Promise<string> {
  const id = makeId();
  const row: ToolRunRow = {
    id,
    chatId: input.chatId,
    toolName: input.toolName,
    toolInput: input.toolInput,
    toolOutput: input.toolOutput,
    status: input.status || "complete",
    riskLevel: input.riskLevel || "safe",
    durationMs: input.durationMs,
    error: input.error,
    createdAt: new Date().toISOString(),
  };
  await kvSet(TOOL_RUN_KEY(id), row);
  const ids = await kvGet<string[]>(TOOL_RUNS_KEY) || [];
  ids.unshift(id);
  await kvSet(TOOL_RUNS_KEY, ids.slice(0, 200));
  return id;
}

// ============ Check ============
export function isKvStorageConfigured() {
  return isKvConfigured();
}
