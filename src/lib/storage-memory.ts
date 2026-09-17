/**
 * In-memory storage fallback for edge runtime / local dev when Supabase isn't configured.
 * Data does NOT persist across restarts — this is for local preview only.
 * Production uses Supabase for real persistence.
 */

import type {
  ChatRow, MessageRow, MessageRole, ArtifactRow, SettingsRow, ToolRunRow,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

const UUID = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const inMemoryDb = {
  chats: new Map<string, ChatRow & { systemPrompt?: string | null; _pinned?: boolean }>(),
  messages: new Map<string, MessageRow & { _chatId?: string }>(),
  artifacts: new Map<string, ArtifactRow>(),
  settings: { ...DEFAULT_SETTINGS } as SettingsRow,
  toolRuns: new Map<string, ToolRunRow>(),
};

const userId = "00000000-0000-4000-8000-000000000001";

export async function listChats(limit = 50): Promise<ChatRow[]> {
  return Array.from(inMemoryDb.chats.values())
    .filter((c) => !c.archived)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export async function getChat(id: string): Promise<ChatRow | null> {
  return inMemoryDb.chats.get(id) || null;
}

export async function createChat(input: { title?: string; model?: string; systemPrompt?: string; }): Promise<ChatRow> {
  const now = new Date().toISOString();
  const id = UUID();
  const chat: any = {
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
  inMemoryDb.chats.set(id, chat);
  return chat;
}

export async function updateChat(id: string, patch: Partial<ChatRow>): Promise<void> {
  const c = inMemoryDb.chats.get(id);
  if (!c) return;
  const updated = { ...c, ...patch, updatedAt: new Date().toISOString() };
  inMemoryDb.chats.set(id, updated);
}

export async function deleteChat(id: string): Promise<void> {
  inMemoryDb.chats.delete(id);
  // Also delete messages & artifacts belonging to this chat
  for (const [mid, m] of inMemoryDb.messages.entries()) {
    if (m.chatId === id) inMemoryDb.messages.delete(mid);
  }
  for (const [aid, a] of inMemoryDb.artifacts.entries()) {
    if (a.chatId === id) inMemoryDb.artifacts.delete(aid);
  }
}

export async function listMessages(chatId: string, limit = 100): Promise<MessageRow[]> {
  return Array.from(inMemoryDb.messages.values())
    .filter((m) => m.chatId === chatId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, limit);
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
  const id = UUID();
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
  inMemoryDb.messages.set(id, msg);
  // Touch chat
  const chat = inMemoryDb.chats.get(input.chatId);
  if (chat) {
    chat.updatedAt = new Date().toISOString();
    inMemoryDb.chats.set(input.chatId, chat);
  }
  return msg;
}

export async function updateMessage(id: string, patch: Partial<MessageRow>): Promise<void> {
  const m = inMemoryDb.messages.get(id);
  if (!m) return;
  const updated = { ...m, ...patch };
  inMemoryDb.messages.set(id, updated);
}

export async function listArtifacts(chatId?: string, limit = 50): Promise<ArtifactRow[]> {
  return Array.from(inMemoryDb.artifacts.values())
    .filter((a) => !chatId || a.chatId === chatId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export async function getArtifact(id: string): Promise<ArtifactRow | null> {
  return inMemoryDb.artifacts.get(id) || null;
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
  const id = UUID();
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
    bytes: input.bytes ?? (input.content?.length || 0),
    version: 1,
    tags: input.tags || [],
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  };
  inMemoryDb.artifacts.set(id, row);
  return row;
}

export async function updateArtifact(id: string, patch: Partial<ArtifactRow>): Promise<void> {
  const a = inMemoryDb.artifacts.get(id);
  if (!a) return;
  const updated: ArtifactRow = {
    ...a,
    ...patch,
    version: (a.version || 1) + 1,
    updatedAt: new Date().toISOString(),
  };
  if (patch.content !== undefined) updated.bytes = patch.content.length;
  inMemoryDb.artifacts.set(id, updated);
}

export async function deleteArtifact(id: string): Promise<void> {
  inMemoryDb.artifacts.delete(id);
}

export async function getSettings(): Promise<SettingsRow> {
  return { ...inMemoryDb.settings };
}

export async function updateSettings(patch: Partial<SettingsRow>): Promise<void> {
  inMemoryDb.settings = { ...inMemoryDb.settings, ...patch };
}

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
  const id = UUID();
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
  inMemoryDb.toolRuns.set(id, row);
  return id;
}

export { DEFAULT_SETTINGS } from "@/lib/types";
export type { ChatRow, MessageRow, MessageRole, ArtifactRow, SettingsRow, ToolRunRow } from "@/lib/types";
