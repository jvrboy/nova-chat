"use client";

import { useState } from "react";
import { useNova } from "@/components/nova-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Pin, Trash2, MessageSquare,
  Settings, PanelLeftClose, PanelLeft, Sparkles, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export function ChatSidebar() {
  const {
    chats, currentChatId, selectChat, newChat, deleteChat, togglePinChat,
    isSidebarOpen, toggleSidebar, setSettingsOpen, loading,
  } = useNova();
  const [search, setSearch] = useState("");

  const filtered = chats.filter((c) =>
    !search || c.title.toLowerCase().includes(search.toLowerCase())
  );
  const pinned = filtered.filter((c) => c.pinned);
  const others = filtered.filter((c) => !c.pinned);

  return (
    <aside className={cn(
      "h-full flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
      isSidebarOpen ? "w-72" : "w-0 overflow-hidden"
    )}>
      <div className="p-3 flex items-center gap-2 border-b">
        <div className="flex items-center gap-2 flex-1">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="size-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Nova Chat</div>
            <div className="text-xs text-muted-foreground leading-tight">AI Workspace</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="size-8">
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <div className="p-3 space-y-2">
        <Button className="w-full justify-start gap-2" onClick={() => newChat()}>
          <Plus className="size-4" /> New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="p-2 space-y-1">
          {loading.chats ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading chats...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              <MessageSquare className="size-6 mx-auto mb-2 opacity-50" />
              No chats yet
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <div className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">Pinned</div>
              )}
              {pinned.map((c) => (
                <ChatItem
                  key={c.id}
                  chat={c}
                  isActive={c.id === currentChatId}
                  onSelect={() => selectChat(c.id)}
                  onDelete={() => deleteChat(c.id)}
                  onPin={(p) => togglePinChat(c.id, p)}
                />
              ))}
              {pinned.length > 0 && others.length > 0 && (
                <div className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">Recent</div>
              )}
              {others.map((c) => (
                <ChatItem
                  key={c.id}
                  chat={c}
                  isActive={c.id === currentChatId}
                  onSelect={() => selectChat(c.id)}
                  onDelete={() => deleteChat(c.id)}
                  onPin={(p) => togglePinChat(c.id, p)}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="p-2 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sm"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-4" /> Settings
        </Button>
      </div>
    </aside>
  );
}

function ChatItem({
  chat, isActive, onSelect, onDelete, onPin,
}: {
  chat: { id: string; title: string; updatedAt: string; pinned?: boolean; messageCount?: number };
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onPin: (p: boolean) => void;
}) {
  return (
    <div className={cn(
      "group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-sidebar-accent",
      isActive && "bg-sidebar-accent"
    )} onClick={onSelect}>
      <MessageSquare className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{chat.title}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {chat.messageCount !== undefined && <span>{chat.messageCount} msgs</span>}
          {chat.messageCount !== undefined && <span>·</span>}
          <span>{formatDistanceToNow(new Date(chat.updatedAt), { addSuffix: true })}</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPin(!chat.pinned); }}>
            <Pin className="size-4 mr-2" /> {chat.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="size-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SidebarToggle() {
  const { isSidebarOpen, toggleSidebar } = useNova();
  if (isSidebarOpen) return null;
  return (
    <Button variant="ghost" size="icon" onClick={toggleSidebar} className="size-9">
      <PanelLeft className="size-4" />
    </Button>
  );
}
