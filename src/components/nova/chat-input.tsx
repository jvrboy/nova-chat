"use client";

import { useState, useRef, useEffect } from "react";
import { useNova } from "@/components/nova-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Square, Paperclip, Mic, ChevronUp, Slash, Sparkles, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ChatInput() {
  const { sendMessage, streaming, stopStreaming, settings, setSettingsOpen, currentChat } = useNova();
  const [text, setText] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const isStreaming = streaming.isStreaming;

  const submit = async () => {
    if (isStreaming || !text.trim()) return;
    const msg = text;
    setText("");
    setShowSlashMenu(false);
    await sendMessage(msg);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (settings.sendOnEnter) submit();
    }
    if (e.key === "/" && text.length === 0) {
      setShowSlashMenu(true);
    }
    if (e.key === "Escape") setShowSlashMenu(false);
  };

  return (
    <div className="border-t bg-background/95 backdrop-blur px-3 py-3 sm:px-6 sm:py-4">
      <div className="max-w-3xl mx-auto">
        {/* Slash menu */}
        {showSlashMenu && (
          <SlashMenu
            onSelect={(s) => {
              setText(s);
              setShowSlashMenu(false);
              ref.current?.focus();
            }}
            onClose={() => setShowSlashMenu(false)}
          />
        )}
        <div className="relative border rounded-2xl bg-card focus-within:ring-2 focus-within:ring-ring/50 transition-all">
          <Textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              isStreaming ? "Nova is responding…" :
              `Message ${currentChat?.title ? `· ${currentChat.title.slice(0, 30)}` : "Nova Chat"} — Enter to send, Shift+Enter for new line`
            }
            disabled={isStreaming}
            className="min-h-[44px] max-h-[220px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 pr-24 pt-3 pb-12 text-sm scrollbar-thin"
            rows={1}
          />
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => toast.info("Attachments coming soon")}>
              <Paperclip className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => toast.info("Voice input coming soon")}>
              <Mic className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowSlashMenu(true)} title="Slash commands">
              <Slash className="size-4" />
            </Button>
          </div>
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setSettingsOpen(true)} title="Settings">
              <Settings2 className="size-4" />
            </Button>
            {isStreaming ? (
              <Button size="icon" className="size-8" variant="destructive" onClick={stopStreaming}>
                <Square className="size-3" />
              </Button>
            ) : (
              <Button size="icon" className="size-8" onClick={submit} disabled={!text.trim()}>
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-2">
            <span>{settings.sendOnEnter ? "Enter to send" : "Ctrl+Enter to send"}</span>
            <span>·</span>
            <span>Model: <button className="font-medium hover:text-foreground" onClick={() => setSettingsOpen(true)}>{settings.defaultModel}</button></span>
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="size-3" />
            <span>Nova may use tools & generate artifacts</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const SLASH_COMMANDS: { cmd: string; desc: string; insert: string }[] = [
  { cmd: "/help", desc: "Show available commands", insert: "/help" },
  { cmd: "/calc", desc: "Calculator", insert: "/calc " },
  { cmd: "/uuid", desc: "Generate UUIDs", insert: "/uuid" },
  { cmd: "/b64", desc: "Base64 codec", insert: "/b64 " },
  { cmd: "/pass", desc: "Generate password", insert: "/pass" },
  { cmd: "/json", desc: "Format JSON", insert: "/json " },
  { cmd: "/qr", desc: "Generate QR code", insert: "/qr " },
  { cmd: "/time", desc: "Current time", insert: "/time" },
  { cmd: "/lorem", desc: "Lorem ipsum", insert: "/lorem" },
  { cmd: "/art", desc: "Create artifact (markdown/code/csv)", insert: "/art " },
  { cmd: "/search", desc: "Web search", insert: "/search " },
  { cmd: "/image", desc: "Generate image", insert: "/image " },
];

function SlashMenu({ onSelect, onClose }: { onSelect: (s: string) => void; onClose: () => void }) {
  return (
    <div className="mb-2 border rounded-lg bg-popover shadow-md overflow-hidden">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b flex items-center justify-between">
        <span>Slash commands</span>
        <button onClick={onClose} className="hover:text-foreground">✕</button>
      </div>
      <div className="max-h-64 overflow-auto scrollbar-thin">
        {SLASH_COMMANDS.map((c) => (
          <button
            key={c.cmd}
            onClick={() => onSelect(c.insert)}
            className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center justify-between"
          >
            <span><code className="text-primary font-mono">{c.cmd}</code> <span className="text-muted-foreground">{c.desc}</span></span>
            <ChevronUp className="size-3 rotate-90 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
