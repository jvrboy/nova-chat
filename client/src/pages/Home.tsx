import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  Archive,
  ArrowUp,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  FileText,
  FolderOpen,
  Globe2,
  Heart,
  ImagePlus,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  SquarePen,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// Style reminder: this page is the chosen Warm Paper / Quiet Intelligence direction.
// Keep the chat reading measure narrow, controls quiet, and action moments persimmon.

type Message = { id: number; role: "user" | "assistant"; content: string; time: string };
type Conversation = { id: number; title: string; date: string; active?: boolean; starred?: boolean };
type LocalAttachment = { id: string; file: File; previewUrl?: string };

const demoConversations: Conversation[] = [
  { id: 1, title: "A calmer way to plan the week", date: "Today", active: true, starred: true },
  { id: 2, title: "Notes from the design review", date: "Yesterday" },
  { id: 3, title: "Turn this brief into a narrative", date: "Yesterday" },
  { id: 4, title: "A guide to better questions", date: "Monday" },
  { id: 5, title: "Research synthesis — Q3", date: "Monday" },
  { id: 6, title: "Drafting a thoughtful reply", date: "Aug 12" },
];

const starterMessages: Message[] = [
  { id: 1, role: "user", content: "Help me make my weekly planning feel less overwhelming.", time: "10:24 AM" },
  { id: 2, role: "assistant", content: "Absolutely. Let’s make it feel lighter, not more optimized.\n\nA useful starting point is to separate your week into three kinds of work: what truly needs your attention, what would be meaningful to move forward, and what can wait without consequence.\n\nWould you like to build a simple rhythm around those three buckets?", time: "10:24 AM" },
];

function NovaMark({ size = 27 }: { size?: number }) {
  return <img src="/manus-storage/nova-mark_62465292.png" alt="Nova" width={size} height={size} className="nova-mark" />;
}

function IconButton({ label, children, onClick, active = false }: { label: string; children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return <button aria-label={label} title={label} onClick={onClick} className={`icon-button ${active ? "is-active" : ""}`}>{children}</button>;
}

function Sidebar({ open, onClose, selected, onSelect, onNew, items, projectCount, onCreateProject }: { open: boolean; onClose: () => void; selected: number; onSelect: (id: number) => void; onNew: () => void; items: Conversation[]; projectCount: number; onCreateProject: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())), [items, query]);
  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-topline">
          <div className="brand-lockup"><NovaMark size={28} /><span>nova</span></div>
          <IconButton label="Close navigation" onClick={onClose}><ChevronLeft size={17} /></IconButton>
        </div>
        <button className="new-chat" onClick={onNew}><SquarePen size={17} /><span>New chat</span><span className="shortcut">⌘ K</span></button>
        <div className="sidebar-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" /><kbd>⌘ /</kbd></div>
        <div className="sidebar-scroll">
          <div className="section-label"><span>Your space</span><Ellipsis size={15} /></div>
          <nav className="workspace-links">
            <button><MessageCircle size={16} />Chats</button>
            <button onClick={onCreateProject}><FolderOpen size={16} />Projects <span className="link-count">{projectCount}</span></button>
            <button><Star size={16} />Starred</button>
          </nav>
          <div className="section-label conversations-label"><span>Recent chats</span><button aria-label="Sort conversations"><MoreHorizontal size={15} /></button></div>
          <div className="conversation-list">
            {filtered.map((item) => <button key={item.id} className={`conversation-item ${selected === item.id ? "selected" : ""}`} onClick={() => { onSelect(item.id); onClose(); }}><span>{item.title}</span><small>{item.date}</small></button>)}
            {!filtered.length && <p className="empty-search">No chats found.</p>}
          </div>
        </div>
        <div className="sidebar-footer">
          <button className="upgrade-card" onClick={() => toast("Nova Pro is coming soon.")}><div className="upgrade-icon"><Zap size={15} /></div><div><strong>Make more room</strong><span>Explore Nova Pro</span></div><ChevronRight size={16} /></button>
          <button className="profile-row" onClick={() => toast("Account settings are coming soon.")}><div className="avatar">AM</div><div className="profile-copy"><strong>Alex Morgan</strong><span>Personal workspace</span></div><Settings2 size={16} /></button>
        </div>
      </aside>
    </>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selected, setSelected] = useState(1);
  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const persistedConversationsQuery = trpc.conversations.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const createConversationMutation = trpc.conversations.create.useMutation();
  const createProjectMutation = trpc.projects.create.useMutation();
  const addMessageMutation = trpc.conversations.addMessage.useMutation();
  const updateConversationMutation = trpc.conversations.update.useMutation();
  const selectedConversationQuery = trpc.conversations.get.useQuery({ id: selected }, { enabled: isAuthenticated && selected > 0, retry: false });
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationItems = persistedConversationsQuery.data?.map((item) => ({ id: item.id, title: item.title, date: new Date(item.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" }), starred: item.isStarred })) ?? demoConversations;
  const activeTitle = conversationItems.find((c) => c.id === selected)?.title ?? "New conversation";
  useEffect(() => {
    const thread = selectedConversationQuery.data?.messages;
    if (thread?.length) setMessages(thread.map((message) => ({ id: message.id, role: message.role, content: message.content, time: new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })));
  }, [selectedConversationQuery.data]);

  const startNew = () => { setSelected(0); setMessages([]); setDraft(""); setSidebarOpen(false); };
  const createProjectFromSidebar = async () => {
    if (!isAuthenticated) { toast("Sign in to create persistent projects."); startLogin(); return; }
    const name = window.prompt("Name this project");
    if (!name?.trim()) return;
    await createProjectMutation.mutateAsync({ name: name.trim(), description: "A focused space for related conversations." });
    await utils.projects.list.invalidate();
    toast("Project created");
  };
  const sendMessage = async () => {
    const value = draft.trim();
    if (!value) return;
    const now = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const localUserMessage = { id: Date.now(), role: "user" as const, content: value, time: now };
    setMessages((items) => [...items, localUserMessage]);
    setDraft("");
    setAttachments([]);
    let conversationId = selected;
    if (isAuthenticated && conversationId <= 0) {
      const created = await createConversationMutation.mutateAsync({ title: value.slice(0, 72), model: "nova-2" });
      conversationId = created.id;
      setSelected(created.id);
      await utils.conversations.list.invalidate();
    }
    if (isAuthenticated && conversationId > 0) await addMessageMutation.mutateAsync({ conversationId, role: "user", content: value });
    window.setTimeout(async () => {
      const assistantContent = "That’s a thoughtful place to begin. I’ll help you give it shape without adding unnecessary weight.\n\nWhat would feel like a useful next step?";
      setMessages((items) => [...items, { id: Date.now() + 1, role: "assistant", content: assistantContent, time: now }]);
      if (isAuthenticated && conversationId > 0) await addMessageMutation.mutateAsync({ conversationId, role: "assistant", content: assistantContent });
    }, 520);
  };
  const copyLast = async () => { const text = messages.findLast((m) => m.role === "assistant")?.content ?? ""; await navigator.clipboard?.writeText(text); setCopied(true); toast("Response copied to clipboard"); window.setTimeout(() => setCopied(false), 1400); };
  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const next = Array.from(fileList).slice(0, 5).map((file) => ({ id: `${file.name}-${file.lastModified}`, file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined }));
    setAttachments((current) => [...current, ...next].slice(0, 5));
  };
  const removeAttachment = (id: string) => setAttachments((current) => current.filter((item) => item.id !== id));

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} selected={selected} onSelect={(id) => { setSelected(id); if (id === 1 && !isAuthenticated) setMessages(starterMessages); }} onNew={startNew} items={conversationItems} projectCount={projectsQuery.data?.length ?? 0} onCreateProject={createProjectFromSidebar} />
      <main className="chat-area">
        <header className="chat-header">
          <div className="mobile-brand"><IconButton label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></IconButton><NovaMark size={24} /><span>nova</span></div>
          <div className="conversation-heading"><span>{activeTitle}</span><button className="header-caret" aria-label="Conversation options"><ChevronDown size={15} /></button></div>
          <div className="header-actions"><IconButton label="Search conversation" onClick={() => toast("Conversation search is ready for your next question.")}><Search size={17} /></IconButton><IconButton label="Conversation details" onClick={() => toast("This conversation is private to your workspace.")}><Ellipsis size={18} /></IconButton></div>
        </header>
        <div className="chat-scroll">
          {!messages.length ? <div className="empty-state"><div className="empty-mark"><NovaMark size={43} /></div><h1>What are you working through?</h1><p>Bring a question, a draft, or a half-formed idea.<br />Nova will help you give it shape.</p><div className="suggestion-row"><button onClick={() => setDraft("Help me think through a difficult decision")}>Think through a decision <ArrowUp size={14} /></button><button onClick={() => setDraft("Help me turn these notes into a clear outline")}>Shape some notes <ArrowUp size={14} /></button></div></div> : <div className="message-column">
            <div className="date-rule"><span>Today</span></div>
            {messages.map((message, index) => <article className={`message ${message.role}`} key={message.id}>
              {message.role === "user" ? <div className="user-message-wrap"><div className="user-avatar">AM</div><div><div className="message-meta"><span>You</span><time>{message.time}</time></div><p>{message.content}</p></div></div> : <div className="assistant-message-wrap"><div className="assistant-badge"><NovaMark size={21} /></div><div className="assistant-content"><div className="message-meta"><span>Nova</span><time>{message.time}</time></div>{message.content.split("\n").map((line, lineIndex) => line ? <p key={lineIndex}>{line}</p> : <div className="message-break" key={lineIndex} />)}{index === messages.length - 1 && message.role === "assistant" && <div className="response-actions"><IconButton label="Like response"><ThumbsUp size={15} /></IconButton><IconButton label="Dislike response"><ThumbsDown size={15} /></IconButton><IconButton label="Copy response" onClick={copyLast}>{copied ? <Check size={15} /> : <Copy size={15} />}</IconButton><span className="action-separator" /><IconButton label="Save response"><Heart size={15} /></IconButton></div>}</div></div>}
            </article>)}
          </div>}
        </div>
        <div className="composer-dock">
          <div className="composer-wrap">
            {attachments.length > 0 && <div className="attachment-preview-row">{attachments.map((attachment) => <div className="attachment-preview" key={attachment.id}>{attachment.previewUrl ? <img src={attachment.previewUrl} alt="" /> : <div className="file-preview-icon"><FileText size={16} /></div>}<div className="attachment-copy"><strong>{attachment.file.name}</strong><span>{Math.max(1, Math.round(attachment.file.size / 1024))} KB</span></div><button aria-label={`Remove ${attachment.file.name}`} onClick={() => removeAttachment(attachment.id)}><X size={13} /></button></div>)}</div>}
            <div className="composer-tools"><input ref={fileInputRef} className="sr-only" type="file" multiple accept="image/*,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => { handleFiles(event.target.files); event.currentTarget.value = ""; }} /><IconButton label="Attach files" onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /></IconButton><IconButton label="Add an image" onClick={() => fileInputRef.current?.click()}><ImagePlus size={18} /></IconButton></div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Message Nova..." rows={1} aria-label="Message Nova" />
            <div className="composer-bottom"><div className="composer-context"><button className="model-selector" onClick={() => setModelOpen((value) => !value)}><Sparkles size={14} /><span>Nova 2</span><ChevronDown size={13} /></button>{modelOpen && <div className="model-menu"><button onClick={() => { setModelOpen(false); toast("Nova 2 selected"); }}><span className="model-dot" /><span><strong>Nova 2</strong><small>Balanced and thoughtful</small></span><Check size={15} /></button><button onClick={() => { setModelOpen(false); toast("Nova Fast selected"); }}><span className="model-dot fast" /><span><strong>Nova Fast</strong><small>Quick everyday help</small></span></button></div>}<span className="context-divider" /><button className="context-link" onClick={() => toast("Search the web is ready for your next question.")}><Globe2 size={14} />Web search</button></div><button className={`send-button ${draft.trim() ? "ready" : ""}`} onClick={sendMessage} aria-label="Send message"><Send size={17} /></button></div>
          </div>
          <p className="composer-note">Nova can make mistakes. Check important information.</p>
        </div>
      </main>
    </div>
  );
}
