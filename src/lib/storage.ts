/**
 * Storage Adapter — picks the best available backend:
 *   1. Supabase Postgres (production persistence)
 *   2. Cloudflare KV (cross-worker persistence on Cloudflare Pages)
 *   3. In-memory (local dev only — resets on restart)
 *
 * The frontend never touches localStorage; it always goes through /api/* routes.
 *
 * This module is edge-runtime compatible.
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
import * as kv from "@/lib/storage-kv";
import * as mem from "@/lib/storage-memory";

export function getStorageBackend(): "supabase" | "kv" | "memory" {
  if (isSupabaseServerConfigured()) return "supabase";
  if (kv.isKvStorageConfigured()) return "kv";
  return "memory";
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

// ============ Dispatchers ============

export async function listChats(limit = 50): Promise<ChatRow[]> {
  if (isSupabaseServerConfigured()) return supabase.listChats(limit);
  if (kv.isKvStorageConfigured()) return kv.listChats(limit);
  return mem.listChats(limit);
}

export async function getChat(id: string): Promise<ChatRow | null> {
  if (isSupabaseServerConfigured()) return supabase.getChat(id);
  if (kv.isKvStorageConfigured()) return kv.getChat(id);
  return mem.getChat(id);
}

export async function createChat(input: { title?: string; model?: string; systemPrompt?: string; }): Promise<ChatRow> {
  if (isSupabaseServerConfigured()) return supabase.createChat(input);
  if (kv.isKvStorageConfigured()) return kv.createChat(input);
  return mem.createChat(input);
}

export async function updateChat(id: string, patch: Partial<ChatRow>): Promise<void> {
  if (isSupabaseServerConfigured()) return supabase.updateChat(id, patch);
  if (kv.isKvStorageConfigured()) return kv.updateChat(id, patch);
  return mem.updateChat(id, patch);
}

export async function deleteChat(id: string): Promise<void> {
  if (isSupabaseServerConfigured()) return supabase.deleteChat(id);
  if (kv.isKvStorageConfigured()) return kv.deleteChat(id);
  return mem.deleteChat(id);
}

export async function listMessages(chatId: string, limit = 100): Promise<MessageRow[]> {
  if (isSupabaseServerConfigured()) return supabase.listMessages(chatId, limit);
  if (kv.isKvStorageConfigured()) return kv.listMessages(chatId, limit);
  return mem.listMessages(chatId, limit);
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
  if (isSupabaseServerConfigured()) return supabase.createMessage(input);
  if (kv.isKvStorageConfigured()) return kv.createMessage(input);
  return mem.createMessage(input);
}

export async function updateMessage(id: string, patch: Partial<MessageRow>): Promise<void> {
  if (isSupabaseServerConfigured()) return supabase.updateMessage(id, patch);
  if (kv.isKvStorageConfigured()) return kv.updateMessage(id, patch);
  return mem.updateMessage(id, patch);
}

export async function listArtifacts(chatId?: string, limit = 50): Promise<ArtifactRow[]> {
  if (isSupabaseServerConfigured()) return supabase.listArtifacts(chatId, limit);
  if (kv.isKvStorageConfigured()) return kv.listArtifacts(chatId, limit);
  return mem.listArtifacts(chatId, limit);
}

export async function getArtifact(id: string): Promise<ArtifactRow | null> {
  if (isSupabaseServerConfigured()) return supabase.getArtifact(id);
  if (kv.isKvStorageConfigured()) return kv.getArtifact(id);
  return mem.getArtifact(id);
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
  if (isSupabaseServerConfigured()) return supabase.createArtifact(input);
  if (kv.isKvStorageConfigured()) return kv.createArtifact(input);
  return mem.createArtifact(input);
}

export async function updateArtifact(id: string, patch: Partial<ArtifactRow>): Promise<void> {
  if (isSupabaseServerConfigured()) return supabase.updateArtifact(id, patch);
  if (kv.isKvStorageConfigured()) return kv.updateArtifact(id, patch);
  return mem.updateArtifact(id, patch);
}

export async function deleteArtifact(id: string): Promise<void> {
  if (isSupabaseServerConfigured()) return supabase.deleteArtifact(id);
  if (kv.isKvStorageConfigured()) return kv.deleteArtifact(id);
  return mem.deleteArtifact(id);
}

export async function getSettings(): Promise<SettingsRow> {
  if (isSupabaseServerConfigured()) return supabase.getSettings();
  if (kv.isKvStorageConfigured()) return kv.getSettings();
  return mem.getSettings();
}

export async function updateSettings(patch: Partial<SettingsRow>): Promise<void> {
  if (isSupabaseServerConfigured()) return supabase.updateSettings(patch);
  if (kv.isKvStorageConfigured()) return kv.updateSettings(patch);
  return mem.updateSettings(patch);
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
  if (isSupabaseServerConfigured()) return supabase.recordToolRun(input);
  if (kv.isKvStorageConfigured()) return kv.recordToolRun(input);
  return mem.recordToolRun(input);
}

// ============ Supabase backend (inline, used only when configured) ============
// Extracted from earlier; same behavior, but only invoked when Supabase env vars are set.

import { DEFAULT_SETTINGS } from "@/lib/types";

const supabase = {
  async listChats(limit: number): Promise<ChatRow[]> {
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
  },
  async getChat(id: string): Promise<ChatRow | null> {
    const admin = await getSupabaseAdmin()!;
    const { data, error } = await admin!.from("chats").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id, title: data.title, model: data.model, systemPrompt: data.system_prompt,
      temperature: data.temperature ?? 0.7, maxTokens: data.max_tokens ?? 4096,
      toolsEnabled: data.tools_enabled ?? true, pinned: data.pinned ?? false,
      archived: data.archived ?? false, createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },
  async createChat(input: { title?: string; model?: string; systemPrompt?: string; }): Promise<ChatRow> {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user");
    const { data, error } = await admin!.from("chats").insert({
      user_id: userId, title: input.title || "New chat",
      model: input.model || "glm-4.6", system_prompt: input.systemPrompt,
    }).select("*").single();
    if (error) throw error;
    return {
      id: data.id, title: data.title, model: data.model, systemPrompt: data.system_prompt,
      temperature: data.temperature, maxTokens: data.max_tokens,
      toolsEnabled: data.tools_enabled, pinned: data.pinned,
      archived: data.archived, createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },
  async updateChat(id: string, patch: Partial<ChatRow>): Promise<void> {
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
  },
  async deleteChat(id: string): Promise<void> {
    const admin = await getSupabaseAdmin()!;
    const { error } = await admin!.from("chats").delete().eq("id", id);
    if (error) throw error;
  },
  async listMessages(chatId: string, limit: number): Promise<MessageRow[]> {
    const admin = await getSupabaseAdmin()!;
    const { data, error } = await admin!.from("messages").select("*")
      .eq("chat_id", chatId).order("created_at", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data || []).map((m: any) => ({
      id: m.id, chatId: m.chat_id, role: m.role, content: m.content || "",
      status: m.status, model: m.model, toolName: m.tool_name, toolInput: m.tool_input,
      toolOutput: m.tool_output, tokensIn: m.tokens_in, tokensOut: m.tokens_out,
      finishReason: m.finish_reason, artifactIds: m.artifact_ids || [],
      createdAt: m.created_at,
    }));
  },
  async createMessage(input: any): Promise<MessageRow> {
    const admin = await getSupabaseAdmin()!;
    const id = makeId();
    const { data, error } = await admin!.from("messages").insert({
      id, chat_id: input.chatId, role: input.role,
      content: input.content || "", status: input.status || "complete",
      model: input.model, tool_name: input.toolName,
      tool_input: input.toolInput ?? null, tool_output: input.toolOutput,
      artifact_ids: input.artifactIds || [],
    }).select("*").single();
    if (error) throw error;
    return {
      id: data.id, chatId: data.chat_id, role: data.role, content: data.content || "",
      status: data.status, model: data.model, toolName: data.tool_name,
      toolInput: data.tool_input, toolOutput: data.tool_output,
      tokensIn: data.tokens_in, tokensOut: data.tokens_out,
      finishReason: data.finish_reason, artifactIds: data.artifact_ids || [],
      createdAt: data.created_at,
    };
  },
  async updateMessage(id: string, patch: Partial<MessageRow>): Promise<void> {
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
  },
  async listArtifacts(chatId: string | undefined, limit: number): Promise<ArtifactRow[]> {
    const admin = await getSupabaseAdmin()!;
    let q = admin!.from("artifacts").select("*").order("updated_at", { ascending: false }).limit(limit);
    if (chatId) q = q.eq("chat_id", chatId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((a: any) => ({
      id: a.id, chatId: a.chat_id, messageId: a.message_id, title: a.title,
      type: a.type, language: a.language, content: a.content || "",
      mimeType: a.mime_type, bytes: a.bytes, version: a.version,
      tags: a.tags || [], isPublic: a.is_public,
      createdAt: a.created_at, updatedAt: a.updated_at,
    }));
  },
  async getArtifact(id: string): Promise<ArtifactRow | null> {
    const admin = await getSupabaseAdmin()!;
    const { data, error } = await admin!.from("artifacts").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id, chatId: data.chat_id, messageId: data.message_id,
      title: data.title, type: data.type, language: data.language,
      content: data.content || "", mimeType: data.mime_type, bytes: data.bytes,
      version: data.version, tags: data.tags || [], isPublic: data.is_public,
      createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },
  async createArtifact(input: any): Promise<ArtifactRow> {
    const admin = await getSupabaseAdmin()!;
    const id = makeId();
    const { data: userId } = await admin!.rpc("get_or_create_default_user").maybeSingle();
    const { data, error } = await admin!.from("artifacts").insert({
      id, user_id: userId, chat_id: input.chatId || null,
      message_id: input.messageId || null, title: input.title,
      type: input.type, language: input.language, content: input.content,
      mime_type: input.mimeType, bytes: input.bytes ?? input.content.length,
      tags: input.tags || [],
    }).select("*").single();
    if (error) throw error;
    return {
      id: data.id, chatId: data.chat_id, messageId: data.message_id,
      title: data.title, type: data.type, language: data.language,
      content: data.content, mimeType: data.mime_type, bytes: data.bytes,
      version: data.version, tags: data.tags || [], isPublic: data.is_public,
      createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },
  async updateArtifact(id: string, patch: Partial<ArtifactRow>): Promise<void> {
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
  },
  async deleteArtifact(id: string): Promise<void> {
    const admin = await getSupabaseAdmin()!;
    const { error } = await admin!.from("artifacts").delete().eq("id", id);
    if (error) throw error;
  },
  async getSettings(): Promise<SettingsRow> {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user");
    const { data, error } = await admin!.from("user_settings").select("*")
      .eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: created } = await admin!.from("user_settings").insert({
        user_id: userId,
      }).select("*").single();
      return rowToSettings(created);
    }
    return rowToSettings(data);
  },
  async updateSettings(patch: Partial<SettingsRow>): Promise<void> {
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
    const { error: upsertErr } = await admin!.from("user_settings")
      .upsert({ user_id: userId, ...update }).eq("user_id", userId);
    if (upsertErr) {
      const { error: insertErr } = await admin!.from("user_settings")
        .insert({ user_id: userId, ...update });
      if (insertErr) throw insertErr;
    }
  },
  async recordToolRun(input: any): Promise<string> {
    const admin = await getSupabaseAdmin()!;
    const { data: userId } = await admin!.rpc("get_or_create_default_user");
    const id = makeId();
    const { error } = await admin!.from("tool_runs").insert({
      id, user_id: userId, chat_id: input.chatId,
      tool_name: input.toolName, tool_input: input.toolInput,
      tool_output: input.toolOutput, status: input.status || "complete",
      risk_level: input.riskLevel || "safe", duration_ms: input.durationMs,
      error: input.error,
    });
    if (error) throw error;
    return id;
  },
};

function rowToSettings(s: any): SettingsRow {
  return {
    theme: s.theme, fontSans: s.font_sans, fontMono: s.font_mono,
    fontDisplay: s.font_display, density: s.density,
    accentColor: s.accent_color, reduceMotion: s.reduce_motion,
    sendOnEnter: s.send_on_enter, showThinking: s.show_thinking,
    showTokenCount: s.show_token_count, streamingEnabled: s.streaming_enabled,
    defaultModel: s.default_model, defaultTemperature: s.default_temperature,
    defaultMaxTokens: s.default_max_tokens,
    apiKeys: s.api_keys || {}, customSystemPrompts: s.custom_system_prompts || [],
    toolPermissions: s.tool_permissions || {}, shortcuts: s.shortcuts || {},
  };
}

export { defaultUserId, makeId };
