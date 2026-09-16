/**
 * Storage Adapter — abstracts over Supabase (production) and in-memory (dev fallback).
 * The frontend never touches localStorage; it always goes through /api/* routes.
 *
 * - Production: Supabase Postgres (RLS-enabled, see src/lib/supabase/schema.sql)
 * - Dev:       In-memory storage (resets on restart — for local preview only)
 *
 * This module is edge-runtime compatible (no Prisma / fs / Node-only APIs).
 */

import type {
  ChatRow, MessageRow, MessageRole, ArtifactRow,
  SettingsRow, ToolRunRow,
} from "@/lib/types";
export type {
  ChatRow, MessageRow, MessageRole, ArtifactRow,
  SettingsRow, ToolRunRow,
};
export { DEFAULT_SETTINGS } from "@/lib/types";

import { isSupabaseServerConfigured, getSupabaseAdmin } from "@/lib/supabase/server";
import { v4 as uuid } from "uuid";

function makeId(): string {
  try {
    if (typeof globalThis !== "undefined" && (globalThis as any).crypto?.randomUUID) {
      return (globalThis as any).crypto.randomUUID();
    }
  } catch {}
  return uuid();
}

async function defaultUserId(): Promise<string> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin();
    if (admin) {
      const { data } = await admin.rpc("get_or_create_default_user");
      if (data) return data as string;
    }
  }
  return "00000000-0000-4000-8000-000000000001";
}

// ============ In-memory fallback ============
// Used when Supabase isn't configured (dev). Resets on restart.
interface MemChat extends ChatRow { systemPrompt?: string | null; }
type MemMessage = MessageRow;
type MemArtifact = ArtifactRow;

const mem = {
  chats: new Map<string, MemChat>(),
  messages: new Map<string, MemMessage>(),
  artifacts: new Map<string, MemArtifact>(),
  settings: null as SettingsRow | null,
  toolRuns: new Map<string, ToolRunRow>(),
};

// ============ Chat ============

export async function listChats(limit = 50): Promise<ChatRow[]> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user");
    const { data, error } = await admin!
      .from("chats")
      .select("*, messages:messages(count)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      model: c.model,
      systemPrompt: c.system_prompt,
      temperature: c.temperature ?? 0.7,
      maxTokens: c.max_tokens ?? 4096,
      toolsEnabled: c.tools_enabled ?? true,
      pinned: c.pinned ?? false,
      archived: c.archived ?? false,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      messageCount: c.messages?.[0]?.count ?? 0,
    }));
  }
  return Array.from(mem.chats.values())
    .filter((c) => !c.archived)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export async function getChat(id: string): Promise<ChatRow | null> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data, error } = await admin!.from("chats").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      title: data.title,
      model: data.model,
      systemPrompt: data.system_prompt,
      temperature: data.temperature ?? 0.7,
      maxTokens: data.max_tokens ?? 4096,
      toolsEnabled: data.tools_enabled ?? true,
      pinned: data.pinned ?? false,
      archived: data.archived ?? false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
  return mem.chats.get(id) || null;
}

export async function createChat(input: { title?: string; model?: string; systemPrompt?: string; }): Promise<ChatRow> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user");
    const { data, error } = await admin!
      .from("chats")
      .insert({
        user_id: userId,
        title: input.title || "New chat",
        model: input.model || "glm-4.6",
        system_prompt: input.systemPrompt,
      })
      .select("*")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      title: data.title,
      model: data.model,
      systemPrompt: data.system_prompt,
      temperature: data.temperature,
      maxTokens: data.max_tokens,
      toolsEnabled: data.tools_enabled,
      pinned: data.pinned,
      archived: data.archived,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
  const now = new Date().toISOString();
  const id = makeId();
  const chat: MemChat = {
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
  mem.chats.set(id, chat);
  return chat;
}

export async function updateChat(id: string, patch: Partial<ChatRow>): Promise<void> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const update: any = {};
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.model !== undefined) update.model = patch.model;
    if (patch.systemPrompt !== undefined) update.system_prompt = patch.systemPrompt;
    if (patch.temperature !== undefined) update.temperature = patch.temperature;
    if (patch.maxTokens !== undefined) update.max_tokens = patch.maxTokens;
    if (patch.toolsEnabled !== undefined) update.tools_enabled = patch.toolsEnabled;
    if (patch.pinned !== undefined) update.pinned = patch.pinned;
    if (patch.archived !== undefined) update.archived = patch.archived;
    const { error } = await admin!.from("chats").update(update).eq("id", id);
    if (error) throw error;
    return;
  }
  const c = mem.chats.get(id);
  if (!c) return;
  const updated = { ...c, ...patch, updatedAt: new Date().toISOString() };
  mem.chats.set(id, updated);
}

export async function deleteChat(id: string): Promise<void> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { error } = await admin!.from("chats").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  mem.chats.delete(id);
  for (const [mid, m] of mem.messages.entries()) {
    if (m.chatId === id) mem.messages.delete(mid);
  }
  for (const [aid, a] of mem.artifacts.entries()) {
    if (a.chatId === id) mem.artifacts.delete(aid);
  }
}

// ============ Messages ============

export async function listMessages(chatId: string, limit = 100): Promise<MessageRow[]> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data, error } = await admin!
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((m: any) => ({
      id: m.id,
      chatId: m.chat_id,
      role: m.role,
      content: m.content || "",
      status: m.status,
      model: m.model,
      toolName: m.tool_name,
      toolInput: m.tool_input,
      toolOutput: m.tool_output,
      tokensIn: m.tokens_in,
      tokensOut: m.tokens_out,
      finishReason: m.finish_reason,
      artifactIds: m.artifact_ids || [],
      createdAt: m.created_at,
    }));
  }
  return Array.from(mem.messages.values())
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
  const id = makeId();
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data, error } = await admin!
      .from("messages")
      .insert({
        id,
        chat_id: input.chatId,
        role: input.role,
        content: input.content || "",
        status: input.status || "complete",
        model: input.model,
        tool_name: input.toolName,
        tool_input: input.toolInput ?? null,
        tool_output: input.toolOutput,
        artifact_ids: input.artifactIds || [],
      })
      .select("*")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      chatId: data.chat_id,
      role: data.role,
      content: data.content || "",
      status: data.status,
      model: data.model,
      toolName: data.tool_name,
      toolInput: data.tool_input,
      toolOutput: data.tool_output,
      tokensIn: data.tokens_in,
      tokensOut: data.tokens_out,
      finishReason: data.finish_reason,
      artifactIds: data.artifact_ids || [],
      createdAt: data.created_at,
    };
  }
  const msg: MemMessage = {
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
  mem.messages.set(id, msg);
  // Touch chat
  const chat = mem.chats.get(input.chatId);
  if (chat) {
    chat.updatedAt = new Date().toISOString();
    mem.chats.set(input.chatId, chat);
  }
  return msg;
}

export async function updateMessage(id: string, patch: Partial<MessageRow>): Promise<void> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const update: any = {};
    if (patch.content !== undefined) update.content = patch.content;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.tokensIn !== undefined) update.tokens_in = patch.tokensIn;
    if (patch.tokensOut !== undefined) update.tokens_out = patch.tokensOut;
    if (patch.finishReason !== undefined) update.finish_reason = patch.finishReason;
    if (patch.toolOutput !== undefined) update.tool_output = patch.toolOutput;
    if (patch.artifactIds !== undefined) update.artifact_ids = patch.artifactIds;
    const { error } = await admin!.from("messages").update(update).eq("id", id);
    if (error) throw error;
    return;
  }
  const m = mem.messages.get(id);
  if (!m) return;
  const updated = { ...m, ...patch };
  mem.messages.set(id, updated);
}

// ============ Artifacts ============

export async function listArtifacts(chatId?: string, limit = 50): Promise<ArtifactRow[]> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    let q = admin!.from("artifacts").select("*").order("updated_at", { ascending: false }).limit(limit);
    if (chatId) q = q.eq("chat_id", chatId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((a: any) => ({
      id: a.id,
      chatId: a.chat_id,
      messageId: a.message_id,
      title: a.title,
      type: a.type,
      language: a.language,
      content: a.content || "",
      mimeType: a.mime_type,
      bytes: a.bytes,
      version: a.version,
      tags: a.tags || [],
      isPublic: a.is_public,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));
  }
  return Array.from(mem.artifacts.values())
    .filter((a) => !chatId || a.chatId === chatId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export async function getArtifact(id: string): Promise<ArtifactRow | null> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data, error } = await admin!.from("artifacts").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      chatId: data.chat_id,
      messageId: data.message_id,
      title: data.title,
      type: data.type,
      language: data.language,
      content: data.content || "",
      mimeType: data.mime_type,
      bytes: data.bytes,
      version: data.version,
      tags: data.tags || [],
      isPublic: data.is_public,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
  return mem.artifacts.get(id) || null;
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
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user").maybeSingle();
    const { data, error } = await admin!
      .from("artifacts")
      .insert({
        id,
        user_id: userId,
        chat_id: input.chatId || null,
        message_id: input.messageId || null,
        title: input.title,
        type: input.type,
        language: input.language,
        content: input.content,
        mime_type: input.mimeType,
        bytes: input.bytes ?? input.content.length,
        tags: input.tags || [],
      })
      .select("*")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      chatId: data.chat_id,
      messageId: data.message_id,
      title: data.title,
      type: data.type,
      language: data.language,
      content: data.content,
      mimeType: data.mime_type,
      bytes: data.bytes,
      version: data.version,
      tags: data.tags || [],
      isPublic: data.is_public,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
  const now = new Date().toISOString();
  const row: MemArtifact = {
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
  mem.artifacts.set(id, row);
  return row;
}

export async function updateArtifact(id: string, patch: Partial<ArtifactRow>): Promise<void> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const update: any = {};
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.content !== undefined) {
      update.content = patch.content;
      update.bytes = patch.content.length;
    }
    if (patch.tags !== undefined) update.tags = patch.tags;
    if (patch.isPublic !== undefined) update.is_public = patch.isPublic;
    update.version = { increment: 1 } as any;
    const { error } = await admin!.from("artifacts").update(update).eq("id", id);
    if (error) throw error;
    return;
  }
  const a = mem.artifacts.get(id);
  if (!a) return;
  const updated: MemArtifact = {
    ...a,
    ...patch,
    version: (a.version || 1) + 1,
    updatedAt: new Date().toISOString(),
  };
  if (patch.content !== undefined) updated.bytes = patch.content.length;
  mem.artifacts.set(id, updated);
}

export async function deleteArtifact(id: string): Promise<void> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { error } = await admin!.from("artifacts").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  mem.artifacts.delete(id);
}

// ============ Settings ============

import { DEFAULT_SETTINGS } from "@/lib/types";

export async function getSettings(): Promise<SettingsRow> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user");
    const { data, error } = await admin!
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: created } = await admin!
        .from("user_settings")
        .insert({ user_id: userId })
        .select("*")
        .single();
      return rowToSettings(created);
    }
    return rowToSettings(data);
  }
  if (!mem.settings) mem.settings = { ...DEFAULT_SETTINGS };
  return { ...mem.settings };
}

function rowToSettings(s: any): SettingsRow {
  return {
    theme: s.theme,
    fontSans: s.font_sans,
    fontMono: s.font_mono,
    fontDisplay: s.font_display,
    density: s.density,
    accentColor: s.accent_color,
    reduceMotion: s.reduce_motion,
    sendOnEnter: s.send_on_enter,
    showThinking: s.show_thinking,
    showTokenCount: s.show_token_count,
    streamingEnabled: s.streaming_enabled,
    defaultModel: s.default_model,
    defaultTemperature: s.default_temperature,
    defaultMaxTokens: s.default_max_tokens,
    apiKeys: s.api_keys || {},
    customSystemPrompts: s.custom_system_prompts || [],
    toolPermissions: s.tool_permissions || {},
    shortcuts: s.shortcuts || {},
  };
}

export async function updateSettings(patch: Partial<SettingsRow>): Promise<void> {
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user");
    const update: any = {};
    if (patch.theme !== undefined) update.theme = patch.theme;
    if (patch.fontSans !== undefined) update.font_sans = patch.fontSans;
    if (patch.fontMono !== undefined) update.font_mono = patch.fontMono;
    if (patch.fontDisplay !== undefined) update.font_display = patch.fontDisplay;
    if (patch.density !== undefined) update.density = patch.density;
    if (patch.accentColor !== undefined) update.accent_color = patch.accentColor;
    if (patch.reduceMotion !== undefined) update.reduce_motion = patch.reduceMotion;
    if (patch.sendOnEnter !== undefined) update.send_on_enter = patch.sendOnEnter;
    if (patch.showThinking !== undefined) update.show_thinking = patch.showThinking;
    if (patch.showTokenCount !== undefined) update.show_token_count = patch.showTokenCount;
    if (patch.streamingEnabled !== undefined) update.streaming_enabled = patch.streamingEnabled;
    if (patch.defaultModel !== undefined) update.default_model = patch.defaultModel;
    if (patch.defaultTemperature !== undefined) update.default_temperature = patch.defaultTemperature;
    if (patch.defaultMaxTokens !== undefined) update.default_max_tokens = patch.defaultMaxTokens;
    if (patch.apiKeys !== undefined) update.api_keys = patch.apiKeys;
    if (patch.customSystemPrompts !== undefined) update.custom_system_prompts = patch.customSystemPrompts;
    if (patch.toolPermissions !== undefined) update.tool_permissions = patch.toolPermissions;
    if (patch.shortcuts !== undefined) update.shortcuts = patch.shortcuts;
    const { error: upsertErr } = await admin!
      .from("user_settings")
      .upsert({ user_id: userId, ...update })
      .eq("user_id", userId);
    if (upsertErr) {
      const { error: insertErr } = await admin!
        .from("user_settings")
        .insert({ user_id: userId, ...update });
      if (insertErr) throw insertErr;
    }
    return;
  }
  if (!mem.settings) mem.settings = { ...DEFAULT_SETTINGS };
  mem.settings = { ...mem.settings, ...patch };
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
  if (isSupabaseServerConfigured()) {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user");
    const { error } = await admin!.from("tool_runs").insert({
      id,
      user_id: userId,
      chat_id: input.chatId,
      tool_name: input.toolName,
      tool_input: input.toolInput,
      tool_output: input.toolOutput,
      status: input.status || "complete",
      risk_level: input.riskLevel || "safe",
      duration_ms: input.durationMs,
      error: input.error,
    });
    if (error) throw error;
    return id;
  }
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
  mem.toolRuns.set(id, row);
  return id;
}
