"use client";

import { useEffect, useRef } from "react";
import { useNova } from "@/components/nova-provider";
import { ChatSidebar, SidebarToggle } from "@/components/nova/chat-sidebar";
import { ChatMessage } from "@/components/nova/chat-message";
import { ChatInput } from "@/components/nova/chat-input";
import { ArtifactPanel } from "@/components/nova/artifact-panel";
import { SettingsDialog } from "@/components/nova/settings-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Wrench, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

export default function Home() {
  const {
    messages, currentChat, currentChatId, loading, newChat,
    isSettingsOpen, setSettingsOpen, isArtifactPanelOpen,
    streaming, settings,
  } = useNova();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTools, setShowTools] = useState(false);

  // Auto-scroll on new content
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming.content]);

  const empty = !currentChatId || messages.length === 0;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background text-foreground">
      <ChatSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b h-12 flex items-center gap-2 px-3 shrink-0 bg-background/95 backdrop-blur">
          <SidebarToggle />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {currentChat ? (
              <>
                <span className="text-sm font-medium truncate">{currentChat.title}</span>
                <span className="text-xs text-muted-foreground">· {currentChat.model}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">New conversation</span>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Wrench className="size-4" />
                <span className="hidden sm:inline">Tools</span>
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => triggerQuickAction("calculator")}>
                <span>Calculator</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerQuickAction("uuid-generator")}>
                <span>Generate UUIDs</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerQuickAction("password-generator")}>
                <span>Password Generator</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerQuickAction("hash-generator")}>
                <span>Hash text</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerQuickAction("web-search")}>
                <span>Web Search</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerQuickAction("current-time")}>
                <span>Current time</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => triggerQuickAction("image-generation")}>
                <span>Generate image</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => newChat()} title="New chat">
            <Plus className="size-4" />
          </Button>
        </header>

        {/* Messages area */}
        <div className="flex-1 min-h-0 overflow-hidden" ref={scrollRef}>
          {loading.messages ? (
            <div className="h-full flex items-center justify-center">
              <Sparkles className="size-6 text-muted-foreground animate-pulse" />
            </div>
          ) : empty ? (
            <EmptyState onNewChat={() => newChat()} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-2">
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}
              {streaming.isStreaming && !streaming.content && !messages.some(m => m.id === streaming.messageId && m.content) && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm pl-11">
                  <Sparkles className="size-4 animate-pulse" />
                  <span>Nova is thinking...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput />
      </div>

      {/* Artifact panel */}
      {isArtifactPanelOpen && (
        <div className="h-full shrink-0">
          <ArtifactPanel />
        </div>
      )}

      <SettingsDialog open={isSettingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  const examples = [
    "Write a TypeScript function that debounces async calls",
    "Create a CSV of 5 fictional products with prices",
    "Generate an SVG logo for an AI startup called 'Nova'",
    "Search the web for the latest Next.js 16 features",
    "Make a markdown README for a calculator library",
  ];
  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/30 flex items-center justify-center mb-4">
        <Sparkles className="size-8 text-primary" />
      </div>
      <h1 className="text-3xl font-bold mb-2 font-display">Welcome to Nova Chat</h1>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        An advanced AI workspace with real, downloadable artifacts —
        backed by Supabase &amp; Cloudflare. Start with a question or pick an example.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl w-full">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              // Trigger a send by setting chat input — but since we don't have access here,
              // just create a new chat and the user can paste
              onNewChat();
            }}
            className="text-left text-sm p-3 border rounded-md hover:bg-accent/50 transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

async function triggerQuickAction(toolId: string) {
  try {
    const res = await fetch(`/api/tools/${toolId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: {} }),
    });
    const data = await res.json();
    const { toast } = await import("sonner");
    if (data.result?.error) {
      toast.error(`${toolId} failed`, { description: data.result.error });
    } else {
      toast.success(`${toolId} executed`, {
        description: JSON.stringify(data.result).slice(0, 200),
      });
    }
  } catch (e: any) {
    const { toast } = await import("sonner");
    toast.error(`Tool failed`, { description: e.message });
  }
}
