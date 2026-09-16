"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { THEMES, applyTheme, type ThemeId } from "@/lib/themes";
import { applyFonts } from "@/lib/fonts";
import {
  type ChatRow,
  type MessageRow,
  type ArtifactRow,
  type SettingsRow,
  DEFAULT_SETTINGS,
} from "@/lib/types";
import { toast } from "sonner";

// ============ Types ============

export interface StreamingState {
  messageId: string | null;
  content: string;
  isStreaming: boolean;
}

export interface NovaState {
  chats: ChatRow[];
  currentChatId: string | null;
  currentChat: ChatRow | null;
  messages: MessageRow[];
  artifacts: ArtifactRow[];
  settings: SettingsRow;
  streaming: StreamingState;
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  isArtifactPanelOpen: boolean;
  currentArtifactId: string | null;
  loading: {
    chats: boolean;
    messages: boolean;
    settings: boolean;
  };
  // actions
  loadChats: () => Promise<void>;
  selectChat: (id: string) => Promise<void>;
  newChat: () => Promise<string | null>;
  deleteChat: (id: string) => Promise<void>;
  togglePinChat: (id: string, pinned: boolean) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stopStreaming: () => void;
  saveSettings: (patch: Partial<SettingsRow>) => Promise<void>;
  openArtifact: (id: string) => void;
  closeArtifactPanel: () => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  regenerateLast: () => Promise<void>;
  createArtifact: (input: {
    title: string;
    type: string;
    language?: string;
    content: string;
  }) => Promise<string | null>;
}

const NovaContext = createContext<NovaState | null>(null);

export function useNova() {
  const ctx = useContext(NovaContext);
  if (!ctx) throw new Error("useNova must be used within NovaProvider");
  return ctx;
}

// ============ Provider ============

export function NovaProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentChat, setCurrentChat] = useState<ChatRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [settings, setSettings] = useState<SettingsRow>(DEFAULT_SETTINGS);
  const [streaming, setStreaming] = useState<StreamingState>({
    messageId: null,
    content: "",
    isStreaming: false,
  });
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isArtifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [loading, setLoading] = useState({ chats: true, messages: false, settings: true });
  const abortRef = useRef<AbortController | null>(null);

  // ============ Load settings first ============
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        const s = data.settings || DEFAULT_SETTINGS;
        setSettings(s);
        applyTheme(s.theme as ThemeId);
        applyFonts({ sans: s.fontSans, mono: s.fontMono, display: s.fontDisplay });
      } catch {
        // use defaults
        applyTheme(DEFAULT_SETTINGS.theme as ThemeId);
        applyFonts({
          sans: DEFAULT_SETTINGS.fontSans,
          mono: DEFAULT_SETTINGS.fontMono,
          display: DEFAULT_SETTINGS.fontDisplay,
        });
      } finally {
        setLoading((l) => ({ ...l, settings: false }));
      }
    })();
  }, []);

  // ============ Load chats ============
  const loadChats = useCallback(async () => {
    setLoading((l) => ({ ...l, chats: true }));
    try {
      const res = await fetch("/api/chats");
      const data = await res.json();
      setChats(data.chats || []);
    } catch (e: any) {
      toast.error("Failed to load chats", { description: e.message });
    } finally {
      setLoading((l) => ({ ...l, chats: false }));
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // ============ Select chat ============
  const selectChat = useCallback(async (id: string) => {
    setCurrentChatId(id);
    setLoading((l) => ({ ...l, messages: true }));
    try {
      const res = await fetch(`/api/chats/${id}`);
      const data = await res.json();
      setCurrentChat(data.chat);
      setMessages(data.messages || []);
      // Load artifacts for this chat
      const artRes = await fetch(`/api/artifacts?chatId=${id}`);
      const artData = await artRes.json();
      setArtifacts(artData.artifacts || []);
    } catch (e: any) {
      toast.error("Failed to load chat", { description: e.message });
    } finally {
      setLoading((l) => ({ ...l, messages: false }));
    }
  }, []);

  // ============ New chat ============
  const newChat = useCallback(async () => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New chat",
          model: settings.defaultModel,
          systemPrompt: currentChat?.systemPrompt,
        }),
      });
      const data = await res.json();
      if (data.chat) {
        setChats((c) => [data.chat, ...c]);
        await selectChat(data.chat.id);
        return data.chat.id;
      }
    } catch (e: any) {
      toast.error("Failed to create chat", { description: e.message });
    }
    return null;
  }, [settings.defaultModel, currentChat, selectChat]);

  // ============ Delete chat ============
  const deleteChat = useCallback(async (id: string) => {
    try {
      await fetch(`/api/chats/${id}`, { method: "DELETE" });
      setChats((c) => c.filter((ch) => ch.id !== id));
      if (currentChatId === id) {
        setCurrentChatId(null);
        setCurrentChat(null);
        setMessages([]);
        setArtifacts([]);
      }
      toast.success("Chat deleted");
    } catch (e: any) {
      toast.error("Failed to delete chat", { description: e.message });
    }
  }, [currentChatId]);

  const togglePinChat = useCallback(async (id: string, pinned: boolean) => {
    await fetch(`/api/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
    setChats((c) => c.map((ch) => (ch.id === id ? { ...ch, pinned } : ch)));
  }, []);

  // ============ Send message with SSE streaming ============
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (!currentChatId) {
      const id = await newChat();
      if (!id) return;
      // Wait for state to settle
      await new Promise((r) => setTimeout(r, 50));
    }
    const chatId = currentChatId || (await newChat());
    if (!chatId) return;

    // Optimistic: add user message
    const optimisticUser: MessageRow = {
      id: `temp-${Date.now()}`,
      chatId,
      role: "user",
      content: text,
      status: "complete",
      artifactIds: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticUser]);

    // Optimistic: add empty assistant placeholder
    const optimisticAssistant: MessageRow = {
      id: `temp-assistant-${Date.now()}`,
      chatId,
      role: "assistant",
      content: "",
      status: "streaming",
      model: settings.defaultModel,
      artifactIds: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticAssistant]);
    setStreaming({ messageId: optimisticAssistant.id, content: "", isStreaming: true });

    // SSE
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          message: text,
          model: settings.defaultModel,
          temperature: settings.defaultTemperature,
          maxTokens: settings.defaultMaxTokens,
        }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let realAssistantId: string | null = null;
      let fullContent = "";
      const newArtifacts: ArtifactRow[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const ev of events) {
          const lines = ev.split("\n");
          const eventType = lines.find((l) => l.startsWith("event:"))?.replace("event:", "").trim();
          const dataStr = lines.find((l) => l.startsWith("data:"))?.replace("data:", "").trim();
          if (!eventType || !dataStr) continue;
          let payload: any;
          try { payload = JSON.parse(dataStr); } catch { continue; }
          switch (eventType) {
            case "user-message":
              // Server confirmed user message — replace optimistic
              setMessages((m) => m.map((msg) =>
                msg.id === optimisticUser.id
                  ? { ...msg, id: payload.id }
                  : msg
              ));
              break;
            case "assistant-start":
              realAssistantId = payload.id;
              setMessages((m) => m.map((msg) =>
                msg.id === optimisticAssistant.id
                  ? { ...msg, id: payload.id, model: payload.model }
                  : msg
              ));
              setStreaming((s) => ({ ...s, messageId: payload.id }));
              break;
            case "delta":
              fullContent += payload.content;
              setStreaming((s) => ({ ...s, content: fullContent }));
              setMessages((m) => m.map((msg) =>
                msg.id === (realAssistantId || optimisticAssistant.id)
                  ? { ...msg, content: fullContent, status: "streaming" }
                  : msg
              ));
              break;
            case "artifact":
              newArtifacts.push({
                id: payload.id,
                chatId,
                messageId: realAssistantId || optimisticAssistant.id,
                title: payload.title,
                type: payload.type,
                language: payload.language,
                content: "",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              setArtifacts((a) => [...a, ...newArtifacts.slice(-1)]);
              break;
            case "assistant-end":
              setMessages((m) => m.map((msg) =>
                msg.id === (realAssistantId || optimisticAssistant.id)
                  ? {
                      ...msg,
                      id: payload.id,
                      content: payload.content,
                      status: "complete",
                      tokensOut: payload.tokensOut,
                      finishReason: payload.finishReason,
                      artifactIds: payload.artifactIds || [],
                    }
                  : msg
              ));
              setStreaming({ messageId: null, content: "", isStreaming: false });
              // Reload chats to get the new auto-title
              loadChats();
              break;
            case "error":
              toast.error("Chat error", { description: payload.error });
              setStreaming({ messageId: null, content: "", isStreaming: false });
              setMessages((m) => m.map((msg) =>
                msg.id === optimisticAssistant.id
                  ? { ...msg, status: "error", content: msg.content || `[Error: ${payload.error}]` }
                  : msg
              ));
              break;
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        toast.error("Streaming failed", { description: e.message });
      }
      setStreaming({ messageId: null, content: "", isStreaming: false });
      setMessages((m) => m.map((msg) =>
        msg.id === optimisticAssistant.id
          ? { ...msg, status: "error", content: msg.content || "[aborted]" }
          : msg
      ));
    } finally {
      abortRef.current = null;
    }
  }, [currentChatId, newChat, settings, loadChats]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming({ messageId: null, content: "", isStreaming: false });
  }, []);

  const regenerateLast = useCallback(async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      toast.error("Nothing to regenerate");
      return;
    }
    // Drop the trailing assistant message
    const lastAssistantIdx = messages.length - 1;
    if (messages[lastAssistantIdx]?.role === "assistant") {
      setMessages((m) => m.slice(0, -1));
    }
    await sendMessage(lastUser.content);
  }, [messages, sendMessage]);

  // ============ Settings ============
  const saveSettings = useCallback(async (patch: Partial<SettingsRow>) => {
    const newSettings = { ...settings, ...patch };
    setSettings(newSettings);
    // Apply theme/fonts immediately
    if (patch.theme) applyTheme(patch.theme as ThemeId);
    if (patch.fontSans || patch.fontMono || patch.fontDisplay) {
      applyFonts({
        sans: newSettings.fontSans,
        mono: newSettings.fontMono,
        display: newSettings.fontDisplay,
      });
    }
    // Persist to backend
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (e: any) {
      toast.error("Failed to save settings", { description: e.message });
    }
  }, [settings]);

  // ============ Artifact panel ============
  const openArtifact = useCallback((id: string) => {
    setCurrentArtifactId(id);
    setArtifactPanelOpen(true);
  }, []);
  const closeArtifactPanel = useCallback(() => {
    setArtifactPanelOpen(false);
    setCurrentArtifactId(null);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((s) => !s), []);

  // ============ Manual artifact creation ============
  const createArtifact = useCallback(async (input: {
    title: string;
    type: string;
    language?: string;
    content: string;
  }) => {
    try {
      const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, chatId: currentChatId }),
      });
      const data = await res.json();
      if (data.artifact) {
        setArtifacts((a) => [data.artifact, ...a]);
        return data.artifact.id;
      }
    } catch (e: any) {
      toast.error("Failed to create artifact", { description: e.message });
    }
    return null;
  }, [currentChatId]);

  const value: NovaState = {
    chats,
    currentChatId,
    currentChat,
    messages,
    artifacts,
    settings,
    streaming,
    isSidebarOpen,
    isSettingsOpen,
    isArtifactPanelOpen,
    currentArtifactId,
    loading,
    loadChats,
    selectChat,
    newChat,
    deleteChat,
    togglePinChat,
    sendMessage,
    stopStreaming,
    saveSettings,
    openArtifact,
    closeArtifactPanel,
    toggleSidebar,
    setSettingsOpen,
    regenerateLast,
    createArtifact,
  };

  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
}
