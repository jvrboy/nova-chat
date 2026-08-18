import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  Archive,
  ArrowUp,
  Command,
  Download,
  Link2,
  Mic,
  PanelRight,
  ArrowUpRight,
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
type SearchResult = { heading: string; abstractText: string; abstractUrl: string | null; relatedTopics: Array<{ text: string; url: string | null }> };
type PromptItem = { id: string; text: string; folder: string };
type GeneratedArtifact = { title: string; summary: string; content: string; language: string; kind: "document" | "plan" | "table" | "code"; model?: string };
type ArtifactRevision = { id: string; label: string; content: string; createdAt: string };
type DiffLine = { left: string; right: string; changed: boolean };
const buildDiffLines = (left: string, right: string): DiffLine[] => { const leftLines = left.split("\\n"); const rightLines = right.split("\\n"); const count = Math.max(leftLines.length, rightLines.length); return Array.from({ length: count }, (_, index) => ({ left: leftLines[index] ?? "", right: rightLines[index] ?? "", changed: (leftLines[index] ?? "") !== (rightLines[index] ?? "") })); };

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

function Sidebar({ open, onClose, selected, onSelect, onNew, items, projectCount, projects, activeProject, onCreateProject, onSelectProject, onToggleStar, onOpenPreferences, showHints }: { open: boolean; onClose: () => void; selected: number; onSelect: (id: number) => void; onNew: () => void; items: Conversation[]; projectCount: number; projects: Array<{ id: number; name: string }>; activeProject: number | null; onCreateProject: () => void; onSelectProject: (id: number | null) => void; onToggleStar: (id: number, starred: boolean) => void; onOpenPreferences: () => void; showHints: boolean }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "starred">("all");
  const filtered = useMemo(() => items.filter((item) => (view === "all" || item.starred) && item.title.toLowerCase().includes(query.toLowerCase())), [items, query, view]);
  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-topline">
          <div className="brand-lockup"><NovaMark size={28} /><span>nova</span></div>
          <IconButton label="Close navigation" onClick={onClose}><ChevronLeft size={17} /></IconButton>
        </div>
        <button className="new-chat" onClick={onNew}><SquarePen size={17} /><span>New chat</span>{showHints && <span className="shortcut">⌘ K</span>}</button>
        <div className="sidebar-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" />{showHints && <kbd>⌘ /</kbd>}</div>
        <div className="sidebar-scroll">
          <div className="section-label"><span>Your space</span><Ellipsis size={15} /></div>
          <nav className="workspace-links">
            <button onClick={() => setView("all")}><MessageCircle size={16} />Chats</button>
            <button onClick={() => projects.length ? onSelectProject(null) : onCreateProject()} className={activeProject === null ? "" : "workspace-muted"}><FolderOpen size={16} />Projects <span className="link-count">{projectCount}</span></button>
            <button onClick={() => setView("starred")}><Star size={16} />Starred</button>
            {projects.length > 0 && <div className="project-sublist">{projects.map((project) => <button key={project.id} className={activeProject === project.id ? "project-selected" : ""} onClick={() => onSelectProject(project.id)}><span className="project-dot" />{project.name}</button>)}<button className="project-add" onClick={onCreateProject}><Plus size={13} />New project</button></div>}
          </nav>
          <div className="section-label conversations-label"><span>Recent chats</span><button aria-label="Sort conversations"><MoreHorizontal size={15} /></button></div>
          <div className="conversation-list">
            {filtered.map((item) => <div className={`conversation-item ${selected === item.id ? "selected" : ""}`} key={item.id}><button className="conversation-main" onClick={() => { onSelect(item.id); onClose(); }}><span>{item.title}</span><small>{item.date}</small></button><button className={`conversation-star ${item.starred ? "starred" : ""}`} aria-label={item.starred ? "Unstar conversation" : "Star conversation"} onClick={() => onToggleStar(item.id, !item.starred)}><Star size={13} fill={item.starred ? "currentColor" : "none"} /></button></div>)}
            {!filtered.length && <p className="empty-search">No chats found.</p>}
          </div>
        </div>
        <div className="sidebar-footer">
          <button className="upgrade-card" onClick={() => toast("Nova Pro is coming soon.")}><div className="upgrade-icon"><Zap size={15} /></div><div><strong>Make more room</strong><span>Explore Nova Pro</span></div><ChevronRight size={16} /></button>
          <button className="profile-row" onClick={onOpenPreferences}><div className="avatar">AM</div><div className="profile-copy"><strong>Alex Morgan</strong><span>Workspace preferences</span></div><Settings2 size={16} /></button>
        </div>
      </aside>
    </>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selected, setSelected] = useState(1);
  const [activeProject, setActiveProject] = useState<number | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<unknown>) | null>(null);
  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const persistedConversationsQuery = trpc.conversations.list.useQuery(activeProject ? { projectId: activeProject } : undefined, { enabled: isAuthenticated, retry: false });
  const createConversationMutation = trpc.conversations.create.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const createProjectMutation = trpc.projects.create.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const updateProjectMutation = trpc.projects.update.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const addMessageMutation = trpc.conversations.addMessage.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const completeMutation = trpc.ai.complete.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const createArtifactMutation = trpc.ai.createArtifact.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const searchMutation = trpc.web.search.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const updateConversationMutation = trpc.conversations.update.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const selectedConversationQuery = trpc.conversations.get.useQuery({ id: selected }, { enabled: isAuthenticated && selected > 0, retry: false });
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [artifactCreateOpen, setArtifactCreateOpen] = useState(false);
  const [artifactKind, setArtifactKind] = useState<GeneratedArtifact["kind"]>("document");
  const [artifactPrompt, setArtifactPrompt] = useState("");
  const [generatedArtifact, setGeneratedArtifact] = useState<GeneratedArtifact | null>(() => { if (typeof window === "undefined") return null; try { return JSON.parse(localStorage.getItem("nova-last-artifact") || "null"); } catch { return null; } });
  const [artifactEditing, setArtifactEditing] = useState(false);
  const [artifactCompareOpen, setArtifactCompareOpen] = useState(false);
  const [artifactPreviousContent, setArtifactPreviousContent] = useState("");
  const [artifactRevisions, setArtifactRevisions] = useState<ArtifactRevision[]>(() => { if (typeof window === "undefined") return []; try { return JSON.parse(localStorage.getItem("nova-artifact-revisions") || "[]"); } catch { return []; } });
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [enterToSend, setEnterToSend] = useState(() => typeof window === "undefined" ? true : localStorage.getItem("nova-enter-to-send") !== "false");
  const [showHints, setShowHints] = useState(() => typeof window === "undefined" ? true : localStorage.getItem("nova-show-hints") !== "false");
  const [promptFolders, setPromptFolders] = useState<string[]>(() => { if (typeof window === "undefined") return ["All prompts", "Planning", "Writing", "Research"]; try { return JSON.parse(localStorage.getItem("nova-prompt-folders") || "null") || ["All prompts", "Planning", "Writing", "Research"]; } catch { return ["All prompts", "Planning", "Writing", "Research"]; } });
  const [promptItems, setPromptItems] = useState<PromptItem[]>(() => { const fallback = [{ id: "outline", text: "Turn these notes into a clear outline", folder: "Planning" }, { id: "tone", text: "Rewrite this with a calmer, more direct tone", folder: "Writing" }, { id: "compare", text: "Help me compare these options", folder: "Research" }, { id: "week", text: "Create a focused plan for the next seven days", folder: "Planning" }]; if (typeof window === "undefined") return fallback; try { return JSON.parse(localStorage.getItem("nova-prompt-items") || "null") || fallback; } catch { return fallback; } });
  const [promptFolder, setPromptFolder] = useState("All prompts");
  const [isRecording, setIsRecording] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [selectedModel, setSelectedModel] = useState("nova-2");
  const modelsQuery = trpc.ai.models.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const conversationItems = persistedConversationsQuery.data?.map((item) => ({ id: item.id, title: item.title, date: new Date(item.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" }), starred: item.isStarred })) ?? demoConversations;
  const activeTitle = conversationItems.find((c) => c.id === selected)?.title ?? "New conversation";
  const currentProject = projectsQuery.data?.find((project) => project.id === activeProject);
  useEffect(() => { setInstructionsDraft(currentProject?.instructions ?? ""); }, [currentProject?.id, currentProject?.instructions]);
  useEffect(() => {
    if (selected === 0) { setMessages([]); return; }
    const thread = selectedConversationQuery.data?.messages;
    if (selectedConversationQuery.data) setMessages((thread ?? []).map((message) => ({ id: message.id, role: message.role, content: message.content, time: new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })));
  }, [selected, selectedConversationQuery.data]);
  useEffect(() => {
    const error = projectsQuery.error ?? persistedConversationsQuery.error ?? selectedConversationQuery.error;
    if (error) setErrorNotice(error.message);
  }, [projectsQuery.error, persistedConversationsQuery.error, selectedConversationQuery.error]);
  useEffect(() => { localStorage.setItem("nova-enter-to-send", String(enterToSend)); localStorage.setItem("nova-show-hints", String(showHints)); }, [enterToSend, showHints]);
  useEffect(() => { localStorage.setItem("nova-prompt-folders", JSON.stringify(promptFolders)); localStorage.setItem("nova-prompt-items", JSON.stringify(promptItems)); }, [promptFolders, promptItems]);
  useEffect(() => { if (generatedArtifact) localStorage.setItem("nova-last-artifact", JSON.stringify(generatedArtifact)); else localStorage.removeItem("nova-last-artifact"); }, [generatedArtifact]);
  useEffect(() => { localStorage.setItem("nova-artifact-revisions", JSON.stringify(artifactRevisions)); }, [artifactRevisions]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(true); setPaletteQuery(""); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); startNew(); }
      if (event.key === "Escape") { setPaletteOpen(false); setPromptLibraryOpen(false); setArtifactOpen(false); setInstructionsOpen(false); setPreferencesOpen(false); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const startNew = () => { setSelected(0); setMessages([]); setDraft(""); setSidebarOpen(false); };
  const retryQueries = async () => { setErrorNotice(null); await Promise.all([utils.projects.list.invalidate(), utils.conversations.list.invalidate(), selected > 0 ? utils.conversations.get.invalidate({ id: selected }) : Promise.resolve()]); };
  const toggleStar = async (id: number, isStarred: boolean) => {
    if (!isAuthenticated) { toast("Sign in to star persistent chats."); return; }
    try { await updateConversationMutation.mutateAsync({ id, isStarred }); await utils.conversations.list.invalidate(); setRetryAction(null); }
    catch { setErrorNotice("Couldn’t update the star. Try again."); setRetryAction(() => () => toggleStar(id, isStarred)); }
  };
  const archiveSelected = async () => {
    if (!isAuthenticated || selected <= 0) { toast("Sign in to archive persistent chats."); return; }
    const conversationId = selected;
    try { await updateConversationMutation.mutateAsync({ id: conversationId, isArchived: true }); setSelected(0); setMessages([]); await utils.conversations.list.invalidate(); setRetryAction(null); toast("Conversation archived"); }
    catch { setErrorNotice("Couldn’t archive this conversation. Try again."); setRetryAction(() => () => archiveSelected()); }
  };
  const saveProjectInstructions = async () => {
    if (!currentProject) return;
    const payload = { id: currentProject.id, instructions: instructionsDraft };
    const run = async () => { await updateProjectMutation.mutateAsync(payload); await utils.projects.list.invalidate(); setInstructionsOpen(false); setErrorNotice(null); setRetryAction(null); toast("Project instructions saved"); };
    try { await run(); } catch { setErrorNotice("Couldn’t save project instructions. Try again."); setRetryAction(() => run); }
  };
  const createProjectFromSidebar = async () => {
    if (!isAuthenticated) { toast("Sign in to create persistent projects."); startLogin(); return; }
    const name = window.prompt("Name this project");
    if (!name?.trim()) return;
    const instructions = window.prompt("Optional project instructions for Nova", "Keep answers grounded in this project’s context.") ?? undefined;
    const payload = { name: name.trim(), description: "A focused space for related conversations.", instructions };
    const run = async () => { const createdProject = await createProjectMutation.mutateAsync(payload); setActiveProject(createdProject.id); await utils.projects.list.invalidate(); setErrorNotice(null); setRetryAction(null); toast("Project created"); };
    try { await run(); } catch { setErrorNotice("Couldn’t create the project. Try again."); setRetryAction(() => run); }
  };
  const sendMessage = async () => {
    const value = draft.trim();
    if (!value) return;
    setErrorNotice(null);
    const now = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const localUserMessage = { id: Date.now(), role: "user" as const, content: value, time: now };
    setMessages((items) => [...items, localUserMessage]);
    setDraft("");
    setAttachments([]);
    let conversationId = selected;
    if (isAuthenticated && conversationId <= 0) {
      const payload = { title: value.slice(0, 72), model: "nova-2", projectId: activeProject ?? undefined };
      try {
        const created = await createConversationMutation.mutateAsync(payload);
        conversationId = created.id;
        setSelected(created.id);
        await utils.conversations.list.invalidate();
      } catch {
        setErrorNotice("Couldn’t create the conversation. Try again.");
        setRetryAction(() => async () => { const created = await createConversationMutation.mutateAsync(payload); await addMessageMutation.mutateAsync({ conversationId: created.id, role: "user", content: value }); setSelected(created.id); await utils.conversations.list.invalidate(); await utils.conversations.get.invalidate({ id: created.id }); setErrorNotice(null); setRetryAction(null); });
        return;
      }
    }
    if (isAuthenticated && conversationId > 0) {
      const userPayload = { conversationId, role: "user" as const, content: value };
      try { await addMessageMutation.mutateAsync(userPayload); await utils.conversations.get.invalidate({ id: conversationId }); }
      catch { setErrorNotice("Couldn’t save your message. Try again."); setRetryAction(() => async () => { await addMessageMutation.mutateAsync(userPayload); await utils.conversations.get.invalidate({ id: conversationId }); setErrorNotice(null); setRetryAction(null); }); }
    }
    try {
      const completion = await completeMutation.mutateAsync({ model: selectedModel, system: currentProject?.instructions ?? undefined, messages: [...messages.filter((message) => message.content.trim()).map((message) => ({ role: message.role, content: message.content })), { role: "user", content: value }] });
      const assistantContent = completion.content || "I’m ready to help with that.";
      setMessages((items) => [...items, { id: Date.now() + 1, role: "assistant", content: assistantContent, time: now }]);
      if (isAuthenticated && conversationId > 0) {
        const assistantPayload = { conversationId, role: "assistant" as const, content: assistantContent };
        try { await addMessageMutation.mutateAsync(assistantPayload); await utils.conversations.get.invalidate({ id: conversationId }); await utils.conversations.list.invalidate(); }
        catch { setErrorNotice("Couldn’t save Nova’s response. Try again."); setRetryAction(() => async () => { await addMessageMutation.mutateAsync(assistantPayload); await utils.conversations.get.invalidate({ id: conversationId }); await utils.conversations.list.invalidate(); setErrorNotice(null); setRetryAction(null); }); }
      }
    } catch { setErrorNotice("Nova couldn’t complete that response. Retry when ready."); setRetryAction(() => async () => { await sendMessage(); }); }
  };
  const copyLast = async () => { const text = messages.findLast((m) => m.role === "assistant")?.content ?? ""; await navigator.clipboard?.writeText(text); setCopied(true); toast("Response copied to clipboard"); window.setTimeout(() => setCopied(false), 1400); };
  const createArtifact = async () => { if (!isAuthenticated) { toast("Sign in to create AI artifacts."); startLogin(); return; } const prompt = artifactPrompt.trim() || draft.trim(); if (!prompt) { toast("Describe what you want Nova to create first."); return; } try { setErrorNotice(null); const context = messages.slice(-8).map((message) => `${message.role}: ${message.content}`).join("\n\n"); const result = await createArtifactMutation.mutateAsync({ model: selectedModel, kind: artifactKind, prompt, context }); if (generatedArtifact) { const revision = { id: `${Date.now()}`, label: generatedArtifact.title || "Previous revision", content: generatedArtifact.content, createdAt: new Date().toISOString() }; setArtifactRevisions((items) => [revision, ...items].slice(0, 12)); setSelectedRevisionId(revision.id); setArtifactPreviousContent(revision.content); } setGeneratedArtifact(result); setArtifactEditing(false); setArtifactCompareOpen(false); setArtifactCreateOpen(false); setArtifactOpen(true); setArtifactPrompt(""); setRetryAction(null); toast("Artifact created"); } catch { setErrorNotice("Nova couldn’t create that artifact. Try again."); setRetryAction(() => createArtifact); } };
  const selectedRevision = artifactRevisions.find((revision) => revision.id === selectedRevisionId);
  const toggleArtifactEditing = () => { if (!generatedArtifact) return; if (!artifactEditing) { const revision = { id: `${Date.now()}`, label: generatedArtifact.title || "Edited revision", content: generatedArtifact.content, createdAt: new Date().toISOString() }; setArtifactRevisions((items) => [revision, ...items].slice(0, 12)); setSelectedRevisionId(revision.id); setArtifactPreviousContent(revision.content); } setArtifactEditing((value) => !value); setArtifactCompareOpen(false); };
  const keepArtifactRevision = () => { if (!generatedArtifact) return; setArtifactPreviousContent(generatedArtifact.content); setSelectedRevisionId(null); setArtifactCompareOpen(false); toast("Current revision kept"); };
  const restoreArtifactRevision = () => { const content = selectedRevision?.content ?? artifactPreviousContent; if (!generatedArtifact || !content) return; setGeneratedArtifact({ ...generatedArtifact, content }); setArtifactCompareOpen(false); setArtifactEditing(false); toast("Previous revision restored"); };
  const exportArtifact = () => { if (!generatedArtifact) return; const extension = generatedArtifact.kind === "code" ? "md" : "md"; const blob = new Blob([`# ${generatedArtifact.title}\n\n${generatedArtifact.summary}\n\n${generatedArtifact.content}`], { type: "text/markdown" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${generatedArtifact.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nova-artifact"}.${extension}`; anchor.click(); URL.revokeObjectURL(url); toast("Artifact exported"); };
  const exportConversation = () => { const text = [`# ${activeTitle}`, "", ...messages.map((message) => `**${message.role === "user" ? "You" : "Nova"}** · ${message.time}\n\n${message.content}`)].join("\n\n"); const blob = new Blob([text], { type: "text/markdown" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${activeTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nova-conversation"}.md`; anchor.click(); URL.revokeObjectURL(url); toast("Conversation exported"); };
  const shareConversation = async () => { const shareText = `${activeTitle} · Nova Chat`; if (navigator.share) await navigator.share({ title: shareText, text: shareText }); else { await navigator.clipboard?.writeText(window.location.href); toast("Conversation link copied"); } };
  const applyPrompt = (prompt: string) => { setDraft(prompt); setPromptLibraryOpen(false); setPaletteOpen(false); };
  const runWebSearch = async () => {
    if (!isAuthenticated) { toast("Sign in to use web search."); startLogin(); return; }
    const query = window.prompt("Search the web", draft.trim() || "");
    if (!query?.trim()) return;
    try { const result = await searchMutation.mutateAsync({ query: query.trim() }); setSearchResults(result); setArtifactOpen(true); setErrorNotice(null); } catch { setErrorNotice("Web search failed. Try a more specific query."); }
  };
  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast("Voice input is not supported in this browser."); return; }
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.onresult = (event: any) => { const transcript = Array.from(event.results).map((result: any) => result[0]?.transcript ?? "").join(""); setDraft(transcript); };
    recognition.onerror = () => { setIsRecording(false); toast("Voice input stopped unexpectedly."); };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };
  const filteredPromptItems = promptItems.filter((item) => promptFolder === "All prompts" || item.folder === promptFolder);
  const createPromptFolder = () => { const name = window.prompt("Name this prompt folder"); if (!name?.trim() || promptFolders.includes(name.trim())) return; setPromptFolders((folders) => [...folders, name.trim()]); setPromptFolder(name.trim()); };
  const renamePromptFolder = () => { if (promptFolder === "All prompts") return; const name = window.prompt("Rename folder", promptFolder); if (!name?.trim() || promptFolders.includes(name.trim())) return; setPromptFolders((folders) => folders.map((folder) => folder === promptFolder ? name.trim() : folder)); setPromptItems((items) => items.map((item) => item.folder === promptFolder ? { ...item, folder: name.trim() } : item)); setPromptFolder(name.trim()); };
  const deletePromptFolder = () => { if (promptFolder === "All prompts") return; setPromptFolders((folders) => folders.filter((folder) => folder !== promptFolder)); setPromptItems((items) => items.map((item) => item.folder === promptFolder ? { ...item, folder: "All prompts" } : item)); setPromptFolder("All prompts"); };
  const assignPrompt = (id: string, folder: string) => setPromptItems((items) => items.map((item) => item.id === id ? { ...item, folder } : item));
  const paletteCommands = [{ label: "Start a new chat", hint: "⌘ N", icon: <SquarePen size={15} />, action: startNew }, { label: "Open prompt library", hint: "", icon: <BookOpen size={15} />, action: () => { setPromptLibraryOpen(true); setPaletteOpen(false); } }, { label: "Export this conversation", hint: "", icon: <Download size={15} />, action: exportConversation }, { label: "Open artifacts", hint: "", icon: <PanelRight size={15} />, action: () => setArtifactOpen(true) }, { label: "Open workspace preferences", hint: "", icon: <Settings2 size={15} />, action: () => setPreferencesOpen(true) }];
  const visiblePaletteCommands = paletteCommands.filter((command) => command.label.toLowerCase().includes(paletteQuery.toLowerCase()));
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const files = Array.from(fileList).slice(0, 5);
    const next = files.map((file) => ({ id: `${file.name}-${file.lastModified}`, file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined }));
    setAttachments((current) => [...current, ...next].slice(0, 5));
    const textFile = files.find((file) => /text|json|csv|markdown/.test(file.type) || /\.(txt|md|csv|json)$/i.test(file.name));
    if (textFile) { const text = (await textFile.text()).slice(0, 12000); setDraft((current) => current || `Analyze ${textFile.name} and summarize the most important points.\n\n${text}`); }
  };
  const removeAttachment = (id: string) => setAttachments((current) => current.filter((item) => item.id !== id));

  if (loading) return <div className="app-loading"><NovaMark size={34} /><span>Opening your workspace…</span></div>;

  return (
    <div className="app-shell">
      {paletteOpen && <div className="overlay-scrim" onClick={() => setPaletteOpen(false)}><section className="command-palette" role="dialog" aria-label="Command palette" onClick={(event) => event.stopPropagation()}><div className="command-search"><Command size={16} /><input autoFocus value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="Search commands" /><kbd>ESC</kbd></div><div className="command-group"><span>Quick actions</span>{visiblePaletteCommands.map((command) => <button key={command.label} onClick={() => { command.action(); setPaletteOpen(false); }} aria-label={command.label}>{command.icon}<span>{command.label}</span>{showHints && command.hint && <kbd>{command.hint}</kbd>}</button>)}{!visiblePaletteCommands.length && <p className="empty-search">No commands found.</p>}</div></section></div>}
      {artifactCreateOpen && <div className="overlay-scrim" onClick={() => setArtifactCreateOpen(false)}><section className="artifact-create-card" role="dialog" aria-label="Create artifact" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Nova workshop</span><h2>Create an artifact</h2></div><IconButton label="Close artifact creator" onClick={() => setArtifactCreateOpen(false)}><X size={17} /></IconButton></div><p>Turn your conversation into a useful, editable output.</p><div className="artifact-kind-grid">{([ ["document", "Document", "A polished brief or note"], ["plan", "Plan", "Steps, milestones, and next actions"], ["table", "Table", "A structured comparison or dataset"], ["code", "Code", "A focused implementation artifact"] ] as const).map(([kind, label, description]) => <button key={kind} className={artifactKind === kind ? "artifact-kind active" : "artifact-kind"} onClick={() => setArtifactKind(kind)}><strong>{label}</strong><span>{description}</span></button>)}</div><textarea className="artifact-prompt-input" value={artifactPrompt} onChange={(event) => setArtifactPrompt(event.target.value)} placeholder="What should Nova create? For example: turn this discussion into a launch checklist…" />{errorNotice && <div className="artifact-retry" role="alert"><span>{errorNotice}</span><button onClick={() => void createArtifact()} disabled={createArtifactMutation.isPending}>{createArtifactMutation.isPending ? "Retrying…" : "Retry artifact"}</button></div>}<div className="artifact-create-footer"><span>{messages.length ? "Uses the latest conversation context" : "Add a specific request for better results"}</span><button className="primary-artifact-button" onClick={() => void createArtifact()} disabled={createArtifactMutation.isPending}>{createArtifactMutation.isPending ? "Creating…" : "Create artifact"}<Sparkles size={14} /></button></div></section></div>}
      {preferencesOpen && <div className="overlay-scrim" onClick={() => setPreferencesOpen(false)}><section className="preferences-card" role="dialog" aria-label="Workspace preferences" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Personal workspace</span><h2>Preferences</h2></div><IconButton label="Close preferences" onClick={() => setPreferencesOpen(false)}><X size={17} /></IconButton></div><p>Choose how Nova behaves while you work.</p><label className="preference-row"><span><strong>Send with Enter</strong><small>Use Shift + Enter for a new line.</small></span><input type="checkbox" checked={enterToSend} onChange={(event) => setEnterToSend(event.target.checked)} /></label><label className="preference-row"><span><strong>Show helpful hints</strong><small>Keep keyboard and workspace tips visible.</small></span><input type="checkbox" checked={showHints} onChange={(event) => setShowHints(event.target.checked)} /></label><div className="preference-footnote">Saved automatically on this device.</div></section></div>}
      {promptLibraryOpen && <div className="overlay-scrim" onClick={() => setPromptLibraryOpen(false)}><section className="prompt-library" role="dialog" aria-label="Prompt library" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Nova toolkit</span><h2>Prompt library</h2></div><IconButton label="Close prompt library" onClick={() => setPromptLibraryOpen(false)}><X size={17} /></IconButton></div><p>Start from a reusable prompt, then make it your own.</p><div className="prompt-library-toolbar"><div className="folder-tabs">{promptFolders.map((folder) => <button key={folder} className={promptFolder === folder ? "folder-tab active" : "folder-tab"} onClick={() => setPromptFolder(folder)}>{folder}<span>{folder === "All prompts" ? promptItems.length : promptItems.filter((item) => item.folder === folder).length}</span></button>)}</div><div className="folder-actions"><button onClick={createPromptFolder}><Plus size={14} />New folder</button>{promptFolder !== "All prompts" && <><button onClick={renamePromptFolder} aria-label="Rename folder"><PenLine size={14} /></button><button onClick={deletePromptFolder} aria-label="Delete folder"><Archive size={14} /></button></>}</div></div><div className="prompt-grid">{filteredPromptItems.map((item) => <div className="prompt-card" key={item.id}><button className="prompt-card-main" onClick={() => applyPrompt(item.text)}><Sparkles size={15} /><span>{item.text}</span><ArrowUpRight size={14} /></button><select value={item.folder} onChange={(event) => assignPrompt(item.id, event.target.value)} aria-label={`Folder for ${item.text}`}>{promptFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}</select></div>)}</div></section></div>}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} selected={selected} onSelect={(id) => { setSelected(id); if (id === 1 && !isAuthenticated) setMessages(starterMessages); }} onNew={startNew} items={conversationItems} projectCount={projectsQuery.data?.length ?? 0} projects={projectsQuery.data ?? []} activeProject={activeProject} onCreateProject={createProjectFromSidebar} onSelectProject={(id) => { setActiveProject(id); setSelected(0); setMessages([]); setSidebarOpen(false); }} onToggleStar={toggleStar} onOpenPreferences={() => setPreferencesOpen(true)} showHints={showHints} />
      <main className="chat-area">
        <header className="chat-header">
          <div className="mobile-brand"><IconButton label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></IconButton><NovaMark size={24} /><span>nova</span></div>
          <div className="conversation-heading"><span>{activeTitle}</span>{currentProject && <button className="project-context-pill" onClick={() => setInstructionsOpen((open) => !open)}><FolderOpen size={13} />{currentProject.name}</button>}<button className="header-caret" aria-label="Conversation options"><ChevronDown size={15} /></button></div>
          <div className="header-actions"><IconButton label="Search conversation" onClick={() => toast("Conversation search is ready for your next question.")}><Search size={17} /></IconButton><IconButton label="Open artifacts" active={artifactOpen} onClick={() => setArtifactOpen((open) => !open)}><FileText size={17} /></IconButton><IconButton label="Export conversation" onClick={exportConversation}><Download size={17} /></IconButton><IconButton label="Share conversation" onClick={() => void shareConversation()}><Link2 size={17} /></IconButton><IconButton label="Archive conversation" onClick={archiveSelected}><Archive size={17} /></IconButton><IconButton label="Conversation details" onClick={() => toast("This conversation is private to your workspace.")}><Ellipsis size={18} /></IconButton></div>
        </header>
        <div className="chat-scroll">
          {errorNotice && <div className="workspace-error" role="alert"><span>{errorNotice}</span><button onClick={() => void (retryAction ? retryAction() : retryQueries())}>Retry</button></div>}
          {instructionsOpen && currentProject && <div className="instructions-card"><div className="instructions-card-head"><div><span className="eyebrow">{currentProject.name}</span><h3>Project instructions</h3></div><button aria-label="Close project instructions" onClick={() => setInstructionsOpen(false)}><X size={15} /></button></div><textarea value={instructionsDraft} onChange={(event) => setInstructionsDraft(event.target.value)} placeholder="Tell Nova how to work in this project…" /><div className="instructions-card-actions"><span>Used as context for this project.</span><button onClick={() => void saveProjectInstructions()} disabled={updateProjectMutation.isPending}>{updateProjectMutation.isPending ? "Saving…" : "Save instructions"}</button></div></div>}
          {!messages.length ? <div className="empty-state"><div className="empty-mark"><NovaMark size={43} /></div><h1>What are you working through?</h1><p>Bring a question, a draft, or a half-formed idea.<br />Nova will help you give it shape.</p><div className="suggestion-row"><button onClick={() => setDraft("Help me think through a difficult decision")}>Think through a decision <ArrowUp size={14} /></button><button onClick={() => setDraft("Help me turn these notes into a clear outline")}>Shape some notes <ArrowUp size={14} /></button></div></div> : <div className="message-column">
            <div className="date-rule"><span>Today</span></div>
            {messages.map((message, index) => <article className={`message ${message.role}`} key={message.id}>
              {message.role === "user" ? <div className="user-message-wrap"><div className="user-avatar">AM</div><div><div className="message-meta"><span>You</span><time>{message.time}</time></div><p>{message.content}</p></div></div> : <div className="assistant-message-wrap"><div className="assistant-badge"><NovaMark size={21} /></div><div className="assistant-content"><div className="message-meta"><span>Nova</span><time>{message.time}</time></div>{message.content.split("\n").map((line, lineIndex) => line ? <p key={lineIndex}>{line}</p> : <div className="message-break" key={lineIndex} />)}{index === messages.length - 1 && message.role === "assistant" && <div className="response-actions"><IconButton label="Like response"><ThumbsUp size={15} /></IconButton><IconButton label="Dislike response"><ThumbsDown size={15} /></IconButton><IconButton label="Copy response" onClick={copyLast}>{copied ? <Check size={15} /> : <Copy size={15} />}</IconButton><span className="action-separator" /><IconButton label="Save response"><Heart size={15} /></IconButton></div>}</div></div>}
            </article>)}
          </div>}
        </div>
        {artifactOpen && <aside className="artifact-panel">        <div className="artifact-panel-head"><div><span className="eyebrow">Workspace tools</span><h2>Artifacts</h2></div><div className="artifact-panel-actions"><button className="artifact-create-button" onClick={() => setArtifactCreateOpen(true)}><Sparkles size={14} />Create</button><IconButton label="Close artifacts" onClick={() => setArtifactOpen(false)}><X size={17} /></IconButton></div></div>{generatedArtifact && <div className="generated-artifact-card"><div className="generated-artifact-meta"><div><span className="eyebrow">{generatedArtifact.kind}</span><h3>{generatedArtifact.title}</h3></div><span className="artifact-status">{generatedArtifact.model ?? "Nova"}</span></div><p className="artifact-summary">{generatedArtifact.summary}</p>{artifactRevisions.length > 0 && <div className="artifact-revision-picker"><label htmlFor="artifact-revision">Compare with</label><select id="artifact-revision" value={selectedRevisionId ?? artifactRevisions[0]?.id ?? ""} onChange={(event) => setSelectedRevisionId(event.target.value || null)}>{artifactRevisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.label} · {new Date(revision.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</option>)}</select></div>}{artifactCompareOpen && (selectedRevision?.content ?? artifactPreviousContent) ? <div className="artifact-comparison"><div className="diff-column"><span className="diff-label">{selectedRevision?.label ?? "Previous revision"}</span><pre>{buildDiffLines(selectedRevision?.content ?? artifactPreviousContent, generatedArtifact.content).map((line, index) => <span className={line.changed ? "diff-line changed" : "diff-line"} key={`left-${index}`}><b>{index + 1}</b>{line.left || " "}</span>)}</pre></div><div className="diff-column"><span className="diff-label">Current revision</span><pre>{buildDiffLines(selectedRevision?.content ?? artifactPreviousContent, generatedArtifact.content).map((line, index) => <span className={line.changed ? "diff-line changed" : "diff-line"} key={`right-${index}`}><b>{index + 1}</b>{line.right || " "}</span>)}</pre></div></div> : artifactEditing ? <textarea className="artifact-editor" value={generatedArtifact.content} onChange={(event) => setGeneratedArtifact({ ...generatedArtifact, content: event.target.value })} /> : <pre className="artifact-content">{generatedArtifact.content}</pre>}{<div className="generated-artifact-actions"><button onClick={toggleArtifactEditing}>{artifactEditing ? "Done editing" : "Edit"}</button>{artifactPreviousContent && <button onClick={() => setArtifactCompareOpen((value) => !value)}>{artifactCompareOpen ? "Close comparison" : "Compare revisions"}</button>}{artifactCompareOpen && <><button onClick={restoreArtifactRevision}>Restore previous</button><button onClick={keepArtifactRevision}>Keep current</button></>}<button onClick={exportArtifact}><Download size={13} />Export</button><button onClick={() => { setArtifactPrompt(`Improve and regenerate: ${generatedArtifact.title}`); setArtifactCreateOpen(true); }}>Regenerate</button></div>}</div>}{!generatedArtifact && <div className="artifact-empty"><div className="artifact-icon"><FileText size={19} /></div>{attachments.length > 0 ? <><strong>Attached to this draft</strong><div className="artifact-list">{attachments.map((attachment) => <div className="artifact-list-item" key={attachment.id}><FileText size={14} /><span>{attachment.file.name}</span><small>{Math.max(1, Math.round(attachment.file.size / 1024))} KB</small></div>)}</div><p>These files are ready to send with your next message.</p></> : searchResults ? <><strong>{searchResults.heading}</strong><p>{searchResults.abstractText}</p>{searchResults.abstractUrl && <a className="artifact-link" href={searchResults.abstractUrl} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={14} /></a>}{searchResults.relatedTopics.length > 0 && <div className="artifact-list">{searchResults.relatedTopics.map((topic) => <a className="artifact-list-item" key={topic.text} href={topic.url ?? "#"} target={topic.url ? "_blank" : undefined} rel="noreferrer"><Globe2 size={14} /><span>{topic.text}</span><ArrowUpRight size={13} /></a>)}</div>}</> : <><strong>{messages.length ? "Conversation snapshot" : "Build alongside the conversation"}</strong><p>{messages.length ? `${messages.length} messages in “${activeTitle}”. Attach a document or image to see it summarized here.` : "Documents, code, and structured outputs will appear here as you work."}</p><button onClick={() => fileInputRef.current?.click()}>Add a document <ArrowUpRight size={14} /></button></>}</div>} </aside>}
        <div className="composer-dock">
          <div className="composer-wrap">
            {attachments.length > 0 && <div className="attachment-preview-row">{attachments.map((attachment) => <div className="attachment-preview" key={attachment.id}>{attachment.previewUrl ? <img src={attachment.previewUrl} alt="" /> : <div className="file-preview-icon"><FileText size={16} /></div>}<div className="attachment-copy"><strong>{attachment.file.name}</strong><span>{Math.max(1, Math.round(attachment.file.size / 1024))} KB</span></div><button aria-label={`Remove ${attachment.file.name}`} onClick={() => removeAttachment(attachment.id)}><X size={13} /></button></div>)}</div>}
            <div className="composer-tools"><IconButton label="Voice input" active={isRecording} onClick={startVoiceInput}><Mic size={18} /></IconButton><input ref={fileInputRef} className="sr-only" type="file" multiple accept="image/*,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => { void handleFiles(event.target.files); event.currentTarget.value = ""; }} /><IconButton label="Attach files" onClick={() => fileInputRef.current?.click()}><Paperclip size={18} /></IconButton><IconButton label="Add an image" onClick={() => fileInputRef.current?.click()}><ImagePlus size={18} /></IconButton></div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && enterToSend) { e.preventDefault(); sendMessage(); } }} placeholder="Message Nova..." rows={1} aria-label="Message Nova" />
            <div className="composer-bottom"><div className="composer-context"><button className="model-selector" onClick={() => setModelOpen((value) => !value)}><Sparkles size={14} /><span>{selectedModel === "nova-2" ? "Nova 2" : selectedModel}</span><ChevronDown size={13} /></button>{modelOpen && <div className="model-menu"><button onClick={() => { setSelectedModel("nova-2"); setModelOpen(false); }}><span className="model-dot" /><span><strong>Nova 2</strong><small>Balanced and thoughtful</small></span>{selectedModel === "nova-2" && <Check size={15} />}</button><button onClick={() => { setSelectedModel("nova-fast"); setModelOpen(false); }}><span className="model-dot fast" /><span><strong>Nova Fast</strong><small>Quick everyday help</small></span>{selectedModel === "nova-fast" && <Check size={15} />}</button>{modelsQuery.data?.slice(0, 3).filter((model) => !["nova-2", "nova-fast"].includes(model.id)).map((model) => <button key={model.id} onClick={() => { setSelectedModel(model.id); setModelOpen(false); }}><span className="model-dot" /><span><strong>{model.id}</strong><small>Available model</small></span>{selectedModel === model.id && <Check size={15} />}</button>)}</div>}<span className="context-divider" /><button className="context-link" onClick={() => void runWebSearch()}><Globe2 size={14} />{searchMutation.isPending ? "Searching…" : "Web search"}</button></div><button className={`send-button ${draft.trim() ? "ready" : ""}`} onClick={sendMessage} aria-label="Send message"><Send size={17} /></button></div>
          </div>
          {showHints && <p className="composer-note">Nova can make mistakes. Check important information.</p>}
        </div>
      </main>
    </div>
  );
}
