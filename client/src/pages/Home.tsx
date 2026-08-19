import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { InteractiveWebGLBackground } from "../components/InteractiveWebGLBackground";
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
  Terminal,
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
type ThemeName = "paper" | "dark" | "midnight" | "sepia" | "mint" | "aurora" | "candy" | "terminal" | "glass" | "sunset" | "nebula" | "ocean" | "hologram" | "vaporwave" | "emerald" | "obsidian" | "blueprint" | "coral" | "cosmic" | "lava" | "paper-cut" | "arctic" | "monochrome" | "rosewood" | "citrus" | "sapphire" | "amethyst" | "forest" | "sandstorm" | "plasma" | "nocturne" | "zen" | "studio" | "rain";
const FONT_OPTIONS = ["DM Sans", "Newsreader", "Inter", "Space Grotesk", "JetBrains Mono", "Playfair Display", "Source Serif 4", "Crimson Pro", "Fira Code", "Lora", "Alegreya", "Archivo", "Barlow", "Bebas Neue", "Cabin", "Caveat", "Chakra Petch", "Cinzel", "Cormorant Garamond", "Dancing Script", "EB Garamond", "Exo 2", "IBM Plex Sans", "IBM Plex Mono", "Inconsolata", "Josefin Sans", "Karla", "Libre Baskerville", "Manrope", "Merriweather", "Montserrat", "Mulish", "Noto Sans", "Noto Serif", "Nunito", "Open Sans", "Oswald", "Outfit", "Overpass", "Poppins", "Quicksand", "Raleway", "Roboto", "Roboto Slab", "Rubik", "Sora", "Spectral", "Syne", "Ubuntu", "Urbanist", "Vollkorn", "Work Sans", "Yanone Kaffeesatz", "Zilla Slab", "Aptos", "Calibri", "Cambria", "Century Gothic", "Franklin Gothic", "Garamond", "Gill Sans", "Helvetica Neue", "Lucida Console", "Lucida Sans", "Palatino", "Rockwell", "Segoe UI", "Times New Roman", "Arial", "Georgia", "Verdana", "Tahoma", "Trebuchet MS", "Courier New", "Bitter", "DM Mono", "Figtree", "Heebo", "Hind", "Khand", "Lexend", "Marcellus", "Maven Pro", "Monda", "Nanum Gothic", "Plus Jakarta Sans", "Prata", "Questrial", "Red Hat Display", "Rokkitt", "Schibsted Grotesk", "Signika", "Space Mono", "Teko", "Titillium Web", "Varela Round", "Wix Madefor Display", "Yantramanav"] as const;
type FontName = typeof FONT_OPTIONS[number];
type WorkspaceSettings = {
  enterToSend: boolean; showHints: boolean; autoSaveDrafts: boolean; compactDensity: boolean; compactComposer: boolean; showAttachmentDropZone: boolean; reducedMotion: boolean; highContrast: boolean; fontScale: number; showTimestamps: boolean; showAvatars: boolean; spellcheck: boolean; smartCompose: boolean; citeSources: boolean; webSearchDefault: boolean; saveConversationHistory: boolean; localOnlyDrafts: boolean; allowAnalytics: boolean; notifyTaskComplete: boolean; notifyMentions: boolean; soundEffects: boolean; autoOpenArtifacts: boolean; artifactPreview: boolean; attachmentPreviews: boolean; maxAttachmentMb: number; redactAttachments: boolean; confirmExternalActions: boolean; keyboardShortcuts: boolean; language: string; timezone: string; theme: ThemeName; fontFamily: FontName; focusMode: boolean; ambientEffects: boolean; showCommandHints: boolean; chatWidth: "narrow" | "wide" | "full"; bubbleStyle: "soft" | "sharp" | "minimal"; autoTranscribeVoice: boolean; smartSuggestions: boolean; showToolStatus: boolean;
};
const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = { enterToSend: true, showHints: true, autoSaveDrafts: true, compactDensity: false, compactComposer: false, showAttachmentDropZone: true, reducedMotion: false, highContrast: false, fontScale: 100, showTimestamps: true, showAvatars: true, spellcheck: true, smartCompose: true, citeSources: true, webSearchDefault: false, saveConversationHistory: true, localOnlyDrafts: false, allowAnalytics: false, notifyTaskComplete: true, notifyMentions: true, soundEffects: false, autoOpenArtifacts: true, artifactPreview: true, attachmentPreviews: true, maxAttachmentMb: 25, redactAttachments: true, confirmExternalActions: true, keyboardShortcuts: true, language: "English", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", theme: "paper", fontFamily: "DM Sans", focusMode: false, ambientEffects: true, showCommandHints: true, chatWidth: "wide", bubbleStyle: "soft", autoTranscribeVoice: true, smartSuggestions: true, showToolStatus: false };
const buildDiffLines = (left: string, right: string): DiffLine[] => { const leftLines = left.split("\n"); const rightLines = right.split("\n"); const count = Math.max(leftLines.length, rightLines.length); return Array.from({ length: count }, (_, index) => ({ left: leftLines[index] ?? "", right: rightLines[index] ?? "", changed: (leftLines[index] ?? "") !== (rightLines[index] ?? "") })); };

function NovaMark({ size = 27 }: { size?: number }) {
  return (
    <span aria-label="Nova" role="img" className="nova-mark" style={{ width: size, height: size }}>
      N
    </span>
  );
}

function IconButton({ label, children, onClick, active = false }: { label: string; children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return <button aria-label={label} title={label} onClick={onClick} className={`icon-button ${active ? "is-active" : ""}`}>{children}</button>;
}

function Sidebar({ open, onClose, selected, onSelect, onNew, items, projectCount, projects, activeProject, onCreateProject, onSelectProject, onToggleStar, onOpenPreferences, onSignIn, showHints, isAuthenticated }: { open: boolean; onClose: () => void; selected: number; onSelect: (id: number) => void; onNew: () => void; items: Conversation[]; projectCount: number; projects: Array<{ id: number; name: string }>; activeProject: number | null; onCreateProject: () => void; onSelectProject: (id: number | null) => void; onToggleStar: (id: number, starred: boolean) => void; onOpenPreferences: () => void; onSignIn: () => void; showHints: boolean; isAuthenticated: boolean }) {
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
          <div className="section-label conversations-label"><span>Recent chats</span><button aria-label="Sort conversations" onClick={() => toast("Chats are sorted by recent activity.")}><MoreHorizontal size={15} /></button></div>
          <div className="conversation-list">
            {filtered.map((item) => <div className={`conversation-item ${selected === item.id ? "selected" : ""}`} key={item.id}><button className="conversation-main" onClick={() => { onSelect(item.id); onClose(); }}><span>{item.title}</span><small>{item.date}</small></button><button className={`conversation-star ${item.starred ? "starred" : ""}`} aria-label={item.starred ? "Unstar conversation" : "Star conversation"} onClick={() => onToggleStar(item.id, !item.starred)}><Star size={13} fill={item.starred ? "currentColor" : "none"} /></button></div>)}
            {!filtered.length && <p className="empty-search">No chats found.</p>}
          </div>
        </div>
        <div className="sidebar-footer">
          <button className="upgrade-card workspace-status-card" onClick={() => onOpenPreferences()}><div className="upgrade-icon"><Settings2 size={15} /></div><div><strong>Shape your workspace</strong><span>Open advanced preferences</span></div><ChevronRight size={16} /></button>
          <button className="profile-row" onClick={onOpenPreferences}><div className="avatar">AM</div><div className="profile-copy"><strong>Alex Morgan</strong><span>Workspace preferences</span></div><Settings2 size={16} /></button>
          <button className="workspace-signin" onClick={() => { if (!isAuthenticated) onSignIn(); else onOpenPreferences(); }}>{isAuthenticated ? "Account connected" : "Sign in to sync projects & chats"}<ArrowUpRight size={14} /></button>
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
  const transcribeMutation = trpc.voice.uploadAndTranscribe.useMutation({ onError: (error) => { setIsRecording(false); toast(error.message || "Audio transcription failed."); } });
  const updateConversationMutation = trpc.conversations.update.useMutation({ onError: (error) => setErrorNotice(error.message) });
  const passwordLoginMutation = trpc.auth.passwordLogin.useMutation({ onSuccess: () => { setPasswordOpen(false); setPasswordDraft(""); window.location.reload(); }, onError: (error) => { setErrorNotice(error.message); toast(error.message); } });
  const sandboxMutation = trpc.sandbox.execute.useMutation({ onError: (error) => { setErrorNotice(error.message); toast(error.message); } });
  const selectedConversationQuery = trpc.conversations.get.useQuery({ id: selected }, { enabled: isAuthenticated && selected > 0, retry: false });
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<Message[]>([]);
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
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [sandboxCode, setSandboxCode] = useState("return 2 + 2;");
  const [sandboxResult, setSandboxResult] = useState("");
  const [paletteQuery, setPaletteQuery] = useState("");
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(() => { if (typeof window === "undefined") return DEFAULT_WORKSPACE_SETTINGS; try { return { ...DEFAULT_WORKSPACE_SETTINGS, ...JSON.parse(localStorage.getItem("nova-workspace-settings") || "{}") }; } catch { return DEFAULT_WORKSPACE_SETTINGS; } });
  const enterToSend = workspaceSettings.enterToSend;
  const showHints = workspaceSettings.showHints;
  const updateSetting = <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => setWorkspaceSettings((current) => ({ ...current, [key]: value }));
  const [promptFolders, setPromptFolders] = useState<string[]>(() => { if (typeof window === "undefined") return ["All prompts"]; try { return JSON.parse(localStorage.getItem("nova-prompt-folders") || "null") || ["All prompts"]; } catch { return ["All prompts"]; } });
  const [promptItems, setPromptItems] = useState<PromptItem[]>(() => { if (typeof window === "undefined") return []; try { return JSON.parse(localStorage.getItem("nova-prompt-items") || "[]"); } catch { return []; } });
  const [promptFolder, setPromptFolder] = useState("All prompts");
  const [isRecording, setIsRecording] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [selectedModel, setSelectedModel] = useState("nova-2");
  const connectionsQuery = trpc.ai.connections.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const conversationItems = persistedConversationsQuery.data?.map((item) => ({ id: item.id, title: item.title, date: new Date(item.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" }), starred: item.isStarred })) ?? [];
  const activeTitle = conversationItems.find((c) => c.id === selected)?.title ?? "New conversation";
  const currentProject = projectsQuery.data?.find((project) => project.id === activeProject);
  const beginLogin = () => { setPasswordOpen(true); setErrorNotice(null); };
  const runSandbox = async () => { if (!isAuthenticated) { toast("Unlock the workspace to use the sandbox."); beginLogin(); return; } try { const result = await sandboxMutation.mutateAsync({ code: sandboxCode, timeoutMs: 5000, maxOutputLength: 20000, allowImports: false }); setSandboxResult(result.output ?? JSON.stringify(result)); toast("Sandbox run complete"); } catch { /* mutation handler reports the error */ } };
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
  useEffect(() => { localStorage.setItem("nova-workspace-settings", JSON.stringify(workspaceSettings)); document.documentElement.style.setProperty("--nova-font-scale", `${workspaceSettings.fontScale}%`); document.documentElement.classList.toggle("nova-reduced-motion", workspaceSettings.reducedMotion); document.documentElement.classList.toggle("nova-high-contrast", workspaceSettings.highContrast); document.documentElement.classList.toggle("nova-no-ambient", !workspaceSettings.ambientEffects); document.documentElement.dataset.novaTheme = workspaceSettings.theme; document.documentElement.style.setProperty("--nova-font-family", `\"${workspaceSettings.fontFamily}\", var(--font-sans)`); }, [workspaceSettings]);
  useEffect(() => { const move = (event: PointerEvent) => { document.documentElement.style.setProperty("--pointer-x", `${event.clientX}px`); document.documentElement.style.setProperty("--pointer-y", `${event.clientY}px`); }; window.addEventListener("pointermove", move, { passive: true }); return () => window.removeEventListener("pointermove", move); }, []);
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
    if (!isAuthenticated) { toast("Sign in to star persistent chats."); beginLogin(); return; }
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
    if (!isAuthenticated) { toast("Sign in to create persistent projects."); beginLogin(); return; }
    const name = window.prompt("Name this project");
    if (!name?.trim()) return;
    const instructions = window.prompt("Optional project instructions for Nova", "Keep answers grounded in this project’s context.") ?? undefined;
    const payload = { name: name.trim(), description: "A focused space for related conversations.", instructions };
    const run = async () => { const createdProject = await createProjectMutation.mutateAsync(payload); setActiveProject(createdProject.id); await utils.projects.list.invalidate(); setErrorNotice(null); setRetryAction(null); toast("Project created"); };
    try { await run(); } catch { setErrorNotice("Couldn’t create the project. Try again."); setRetryAction(() => run); }
  };
  const sendMessage = async () => {
    const value = draft.trim();
    if (!value && attachments.length === 0) return;
    const attachmentContext = attachments.length ? `\n\nAttached files (metadata):\n${attachments.map((attachment) => `- ${attachment.file.name} (${attachment.file.type || "application/octet-stream"}, ${Math.round(attachment.file.size / 1024)} KB)`).join("\n")}` : "";
    const requestValue = `${value || "Please inspect the attached files."}${attachmentContext}`;
    setErrorNotice(null);
    const now = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const localUserMessage = { id: Date.now(), role: "user" as const, content: requestValue, time: now };
    setMessages((items) => [...items, localUserMessage]);
    setDraft("");
    setAttachments([]);
    let conversationId = selected;
    if (isAuthenticated && conversationId <= 0) {
      const payload = { title: requestValue.slice(0, 72), model: "nova-2", projectId: activeProject ?? undefined };
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
      const completion = await completeMutation.mutateAsync({ model: selectedModel, system: currentProject?.instructions ?? undefined, messages: [...messages.filter((message) => message.content.trim()).map((message) => ({ role: message.role, content: message.content })), { role: "user", content: requestValue }] });
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
  const createArtifact = async () => { if (!isAuthenticated) { toast("Sign in to create AI artifacts."); beginLogin(); return; } const prompt = artifactPrompt.trim() || draft.trim(); if (!prompt) { toast("Describe what you want Nova to create first."); return; } try { setErrorNotice(null); const context = messages.slice(-8).map((message) => `${message.role}: ${message.content}`).join("\n\n"); const result = await createArtifactMutation.mutateAsync({ model: selectedModel, kind: artifactKind, prompt, context }); if (generatedArtifact) { const revision = { id: `${Date.now()}`, label: generatedArtifact.title || "Previous revision", content: generatedArtifact.content, createdAt: new Date().toISOString() }; setArtifactRevisions((items) => [revision, ...items].slice(0, 12)); setSelectedRevisionId(revision.id); setArtifactPreviousContent(revision.content); } setGeneratedArtifact(result); setArtifactEditing(false); setArtifactCompareOpen(false); setArtifactCreateOpen(false); setArtifactOpen(true); setArtifactPrompt(""); setRetryAction(null); toast("Artifact created"); } catch { setErrorNotice("Nova couldn’t create that artifact. Try again."); setRetryAction(() => createArtifact); } };
  const selectedRevision = artifactRevisions.find((revision) => revision.id === selectedRevisionId);
  const toggleArtifactEditing = () => { if (!generatedArtifact) return; if (!artifactEditing) { const revision = { id: `${Date.now()}`, label: generatedArtifact.title || "Edited revision", content: generatedArtifact.content, createdAt: new Date().toISOString() }; setArtifactRevisions((items) => [revision, ...items].slice(0, 12)); setSelectedRevisionId(revision.id); setArtifactPreviousContent(revision.content); } setArtifactEditing((value) => !value); setArtifactCompareOpen(false); };
  const keepArtifactRevision = () => { if (!generatedArtifact) return; setArtifactPreviousContent(generatedArtifact.content); setSelectedRevisionId(null); setArtifactCompareOpen(false); toast("Current revision kept"); };
  const restoreArtifactRevision = () => { const content = selectedRevision?.content ?? artifactPreviousContent; if (!generatedArtifact || !content) return; setGeneratedArtifact({ ...generatedArtifact, content }); setArtifactCompareOpen(false); setArtifactEditing(false); toast("Previous revision restored"); };
  const exportArtifact = () => { if (!generatedArtifact) return; const extension = generatedArtifact.kind === "code" ? "md" : "md"; const blob = new Blob([`# ${generatedArtifact.title}\n\n${generatedArtifact.summary}\n\n${generatedArtifact.content}`], { type: "text/markdown" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${generatedArtifact.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nova-artifact"}.${extension}`; anchor.click(); URL.revokeObjectURL(url); toast("Artifact exported"); };
  const exportConversation = () => { const text = [`# ${activeTitle}`, "", ...messages.map((message) => `**${message.role === "user" ? "You" : "Nova"}** · ${message.time}\n\n${message.content}`)].join("\n\n"); const blob = new Blob([text], { type: "text/markdown" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${activeTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nova-conversation"}.md`; anchor.click(); URL.revokeObjectURL(url); toast("Conversation exported"); };
  const shareConversation = async () => { const shareText = `${activeTitle} · Nova Chat`; if (navigator.share) await navigator.share({ title: shareText, text: shareText }); else { await navigator.clipboard?.writeText(window.location.href); toast("Conversation link copied"); } };
  const applyPrompt = (prompt: string) => { setDraft(prompt); setPromptLibraryOpen(false); setPaletteOpen(false); };
  const runWebSearch = async () => {
    if (!isAuthenticated) { toast("Sign in to use web search."); beginLogin(); return; }
    const query = window.prompt("Search the web", draft.trim() || "");
    if (!query?.trim()) return;
    try { const result = await searchMutation.mutateAsync({ query: query.trim() }); setSearchResults(result); setArtifactOpen(true); setErrorNotice(null); } catch { setErrorNotice("Web search failed. Try a more specific query."); }
  };
  const startVoiceInput = async () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = workspaceSettings.language === "English" ? "en-US" : workspaceSettings.language.slice(0, 2).toLowerCase();
      recognition.interimResults = true;
      recognition.onresult = (event: any) => { const transcript = Array.from(event.results).map((result: any) => result[0]?.transcript ?? "").join(""); setDraft(transcript); };
      recognition.onerror = () => { setIsRecording(false); toast("Voice input stopped unexpectedly."); };
      recognition.onend = () => setIsRecording(false);
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { toast("Voice input is not supported in this browser."); return; }
    if (!isAuthenticated) { toast("Sign in to transcribe recorded audio."); beginLogin(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => { const encoded = String(reader.result).split(",")[1] || ""; if (!encoded) return; try { const result = await transcribeMutation.mutateAsync({ audioBase64: encoded, mimeType: blob.type || "audio/webm", prompt: "Transcribe the user's voice into the chat draft." }); setDraft((current) => current ? `${current} ${result.text}` : result.text); toast("Audio transcribed into the draft"); } catch { /* mutation handler reports the failure */ } };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      toast("Recording… tap the microphone again to transcribe");
    } catch { toast("Microphone permission was denied or unavailable."); }
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
    const maxBytes = workspaceSettings.maxAttachmentMb * 1024 * 1024;
    const remaining = Math.max(0, 12 - attachments.length);
    const files = Array.from(fileList).slice(0, remaining).filter((file) => {
      if (file.size > maxBytes) { toast(`${file.name} is larger than ${workspaceSettings.maxAttachmentMb} MB.`); return false; }
      return true;
    });
    if (!files.length) return;
    const next = files.map((file) => ({ id: `${file.name}-${file.lastModified}-${crypto.randomUUID?.() ?? Date.now()}`, file, previewUrl: workspaceSettings.attachmentPreviews && file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined }));
    setAttachments((current) => [...current, ...next].slice(0, 12));
    const textFile = files.find((file) => /text|json|csv|markdown|xml|yaml|javascript|typescript|python/.test(file.type) || /\.(txt|md|csv|json|xml|yaml|yml|js|ts|tsx|py|log)$/i.test(file.name));
    if (textFile) { const text = (await textFile.text()).slice(0, 20000); setDraft((current) => current || `Analyze ${textFile.name} and summarize the most important points.\n\n${text}`); }
  };
  const removeAttachment = (id: string) => setAttachments((current) => current.filter((item) => item.id !== id));
  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.types.includes("Files")) setIsDragActive(true); };
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; setIsDragActive(true); };
  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); if (event.currentTarget === event.target) setIsDragActive(false); };
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); setIsDragActive(false); void handleFiles(event.dataTransfer.files); };

  if (loading) return <div className="app-loading"><NovaMark size={34} /><span>Opening your workspace…</span></div>;

  return (
    <div className={`app-shell ${workspaceSettings.compactComposer ? "compact-composer" : ""} ${workspaceSettings.focusMode ? "focus-mode" : ""} ${workspaceSettings.chatWidth === "narrow" ? "chat-width-narrow" : workspaceSettings.chatWidth === "full" ? "chat-width-full" : ""} ${workspaceSettings.bubbleStyle === "sharp" ? "bubble-sharp" : workspaceSettings.bubbleStyle === "minimal" ? "bubble-minimal" : ""}`}>
      <InteractiveWebGLBackground enabled={workspaceSettings.ambientEffects && ["aurora", "glass", "hologram", "nebula", "ocean", "cosmic", "sapphire", "amethyst", "plasma", "nocturne", "rain"].includes(workspaceSettings.theme)} reducedMotion={workspaceSettings.reducedMotion} />
      {paletteOpen && <div className="overlay-scrim" onClick={() => setPaletteOpen(false)}><section className="command-palette" role="dialog" aria-label="Command palette" onClick={(event) => event.stopPropagation()}><div className="command-search"><Command size={16} /><input autoFocus value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="Search commands" /><kbd>ESC</kbd></div><div className="command-group"><span>Quick actions</span>{visiblePaletteCommands.map((command) => <button key={command.label} onClick={() => { command.action(); setPaletteOpen(false); }} aria-label={command.label}>{command.icon}<span>{command.label}</span>{showHints && command.hint && <kbd>{command.hint}</kbd>}</button>)}{!visiblePaletteCommands.length && <p className="empty-search">No commands found.</p>}</div></section></div>}
      {passwordOpen && <div className="overlay-scrim" onClick={() => setPasswordOpen(false)}><section className="password-card" role="dialog" aria-label="Password access" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Private workspace</span><h2>Unlock Nova</h2></div><IconButton label="Close password dialog" onClick={() => setPasswordOpen(false)}><X size={17} /></IconButton></div><p>Enter the workspace password to continue. The password is checked server-side and never stored in the browser.</p><form onSubmit={(event) => { event.preventDefault(); if (passwordDraft) void passwordLoginMutation.mutateAsync({ password: passwordDraft }); }}><input autoFocus type="password" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} placeholder="Workspace password" aria-label="Workspace password" /><button className="primary-artifact-button" type="submit" disabled={!passwordDraft || passwordLoginMutation.isPending}>{passwordLoginMutation.isPending ? "Unlocking…" : "Unlock workspace"}<ArrowUpRight size={14} /></button></form>{errorNotice && <div className="artifact-retry" role="alert">{errorNotice}</div>}<small>Deployment setup required: configure NOVA_ACCESS_PASSWORD_HASH in Vercel.</small></section></div>}
      {sandboxOpen && <div className="overlay-scrim" onClick={() => setSandboxOpen(false)}><section className="sandbox-card" role="dialog" aria-label="Sandbox" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Bounded execution</span><h2>Sandbox</h2></div><IconButton label="Close sandbox" onClick={() => setSandboxOpen(false)}><X size={17} /></IconButton></div><p>Run bounded calculations with controlled HTTPS network access in an isolated workspace.</p><textarea className="sandbox-editor" value={sandboxCode} onChange={(event) => setSandboxCode(event.target.value)} spellCheck={false} aria-label="Sandbox code" /><div className="sandbox-actions"><button className="primary-artifact-button" onClick={() => void runSandbox()} disabled={sandboxMutation.isPending}>{sandboxMutation.isPending ? "Running…" : "Run sandbox"}<Terminal size={14} /></button><span>60 s max · allowlisted HTTPS GET/HEAD · no filesystem or host control</span></div>{sandboxResult && <pre className="sandbox-result">{sandboxResult}</pre>}</section></div>}
      {artifactCreateOpen && <div className="overlay-scrim" onClick={() => setArtifactCreateOpen(false)}><section className="artifact-create-card" role="dialog" aria-label="Create artifact" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Nova workshop</span><h2>Create an artifact</h2></div><IconButton label="Close artifact creator" onClick={() => setArtifactCreateOpen(false)}><X size={17} /></IconButton></div><p>Turn your conversation into a useful, editable output.</p><div className="artifact-kind-grid">{([ ["document", "Document", "A polished brief or note"], ["plan", "Plan", "Steps, milestones, and next actions"], ["table", "Table", "A structured comparison or dataset"], ["code", "Code", "A focused implementation artifact"] ] as const).map(([kind, label, description]) => <button key={kind} className={artifactKind === kind ? "artifact-kind active" : "artifact-kind"} onClick={() => setArtifactKind(kind)}><strong>{label}</strong><span>{description}</span></button>)}</div><textarea className="artifact-prompt-input" value={artifactPrompt} onChange={(event) => setArtifactPrompt(event.target.value)} placeholder="What should Nova create? For example: turn this discussion into a launch checklist…" />{errorNotice && <div className="artifact-retry" role="alert"><span>{errorNotice}</span><button onClick={() => void createArtifact()} disabled={createArtifactMutation.isPending}>{createArtifactMutation.isPending ? "Retrying…" : "Retry artifact"}</button></div>}<div className="artifact-create-footer"><span>{messages.length ? "Uses the latest conversation context" : "Add a specific request for better results"}</span><button className="primary-artifact-button" onClick={() => void createArtifact()} disabled={createArtifactMutation.isPending}>{createArtifactMutation.isPending ? "Creating…" : "Create artifact"}<Sparkles size={14} /></button></div></section></div>}
      {preferencesOpen && <div className="overlay-scrim" onClick={() => setPreferencesOpen(false)}><section className="preferences-card" role="dialog" aria-label="Workspace preferences" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Personal workspace</span><h2>Preferences</h2></div><IconButton label="Close preferences" onClick={() => setPreferencesOpen(false)}><X size={17} /></IconButton></div><p>Choose how Nova behaves while you work.</p><div className="preferences-grid"><div className="preferences-section"><span className="eyebrow">Writing & chat</span><label className="preference-row"><span><strong>Send with Enter</strong><small>Use Shift + Enter for a new line.</small></span><input type="checkbox" checked={workspaceSettings.enterToSend} onChange={(event) => updateSetting("enterToSend", event.target.checked)} /></label><label className="preference-row"><span><strong>Show helpful hints</strong><small>Keep keyboard and workspace tips visible.</small></span><input type="checkbox" checked={workspaceSettings.showHints} onChange={(event) => updateSetting("showHints", event.target.checked)} /></label><label className="preference-row"><span><strong>Smart compose</strong><small>Use Nova’s contextual drafting suggestions.</small></span><input type="checkbox" checked={workspaceSettings.smartCompose} onChange={(event) => updateSetting("smartCompose", event.target.checked)} /></label><label className="preference-row"><span><strong>Spellcheck</strong><small>Check text as you write.</small></span><input type="checkbox" checked={workspaceSettings.spellcheck} onChange={(event) => updateSetting("spellcheck", event.target.checked)} /></label><label className="preference-row"><span><strong>Save drafts automatically</strong><small>Keep unfinished work available on this device.</small></span><input type="checkbox" checked={workspaceSettings.autoSaveDrafts} onChange={(event) => updateSetting("autoSaveDrafts", event.target.checked)} /></label></div><div className="preferences-section"><span className="eyebrow">Appearance & accessibility</span><label className="preference-row"><span><strong>Theme</strong><small>Choose the visual atmosphere for Nova.</small></span><select value={workspaceSettings.theme} onChange={(event) => updateSetting("theme", event.target.value as ThemeName)}><option value="paper">Warm Paper</option><option value="dark">Dark</option><option value="midnight">Midnight</option><option value="sepia">Sepia</option><option value="mint">Mint</option><option value="aurora">Aurora 3D</option><option value="candy">Candy Bloom</option><option value="terminal">Terminal Matrix</option><option value="glass">Glass Orbit</option><option value="sunset">Sunset Studio</option><option value="nebula">Nebula Drift</option><option value="ocean">Deep Ocean</option><option value="hologram">Hologram Glass</option><option value="vaporwave">Vaporwave Grid</option><option value="emerald">Emerald Lab</option><option value="obsidian">Obsidian Bloom</option><option value="blueprint">Blueprint Grid</option><option value="coral">Coral Reef</option><option value="cosmic">Cosmic Dust</option><option value="lava">Lava Glow</option><option value="paper-cut">Paper Cutout</option><option value="arctic">Arctic Aurora</option><option value="monochrome">Monochrome Studio</option><option value="rosewood">Rosewood</option><option value="citrus">Citrus Signal</option><option value="sapphire">Sapphire Circuit</option><option value="amethyst">Amethyst Night</option><option value="forest">Forest Canopy</option><option value="sandstorm">Sandstorm</option><option value="plasma">Plasma Bloom</option><option value="nocturne">Nocturne</option><option value="zen">Zen Garden</option><option value="studio">Studio Console</option><option value="rain">Rain Glass</option></select></label><label className="preference-row"><span><strong>Compact density</strong><small>Use tighter workspace spacing.</small></span><input type="checkbox" checked={workspaceSettings.compactDensity} onChange={(event) => updateSetting("compactDensity", event.target.checked)} /></label><label className="preference-row"><span><strong>Compact composer</strong><small>Reduce composer padding for smaller screens.</small></span><input type="checkbox" checked={workspaceSettings.compactComposer} onChange={(event) => updateSetting("compactComposer", event.target.checked)} /></label><label className="preference-row"><span><strong>Attachment drop zone</strong><small>Show drag-and-drop guidance beside Attach files.</small></span><input type="checkbox" checked={workspaceSettings.showAttachmentDropZone} onChange={(event) => updateSetting("showAttachmentDropZone", event.target.checked)} /></label><label className="preference-row"><span><strong>Reduced motion</strong><small>Minimize interface transitions.</small></span><input type="checkbox" checked={workspaceSettings.reducedMotion} onChange={(event) => updateSetting("reducedMotion", event.target.checked)} /></label><label className="preference-row"><span><strong>High contrast</strong><small>Increase contrast for controls and text.</small></span><input type="checkbox" checked={workspaceSettings.highContrast} onChange={(event) => updateSetting("highContrast", event.target.checked)} /></label><label className="preference-row"><span><strong>Show timestamps</strong><small>Display message times.</small></span><input type="checkbox" checked={workspaceSettings.showTimestamps} onChange={(event) => updateSetting("showTimestamps", event.target.checked)} /></label><label className="preference-row"><span><strong>Show avatars</strong><small>Keep participant identity markers visible.</small></span><input type="checkbox" checked={workspaceSettings.showAvatars} onChange={(event) => updateSetting("showAvatars", event.target.checked)} /></label><label className="preference-row"><span><strong>Font family</strong><small>{workspaceSettings.fontFamily} · 60+ available choices.</small></span><select value={workspaceSettings.fontFamily} onChange={(event) => updateSetting("fontFamily", event.target.value as FontName)}>{FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}</select></label><label className="preference-row"><span><strong>Font scale</strong><small>{workspaceSettings.fontScale}% interface scale.</small></span><input type="range" min="80" max="140" step="5" value={workspaceSettings.fontScale} onChange={(event) => updateSetting("fontScale", Number(event.target.value))} /></label><label className="preference-row"><span><strong>Focus mode</strong><small>Dim navigation until you need it.</small></span><input type="checkbox" checked={workspaceSettings.focusMode} onChange={(event) => updateSetting("focusMode", event.target.checked)} /></label><label className="preference-row"><span><strong>Ambient effects</strong><small>Enable pointer-reactive background depth.</small></span><input type="checkbox" checked={workspaceSettings.ambientEffects} onChange={(event) => updateSetting("ambientEffects", event.target.checked)} /></label><label className="preference-row"><span><strong>Chat width</strong><small>Choose a narrow, balanced, or full canvas.</small></span><select value={workspaceSettings.chatWidth} onChange={(event) => updateSetting("chatWidth", event.target.value as WorkspaceSettings["chatWidth"])}><option value="narrow">Narrow</option><option value="wide">Wide</option><option value="full">Full canvas</option></select></label><label className="preference-row"><span><strong>Bubble style</strong><small>Change message surface geometry.</small></span><select value={workspaceSettings.bubbleStyle} onChange={(event) => updateSetting("bubbleStyle", event.target.value as WorkspaceSettings["bubbleStyle"])}><option value="soft">Soft</option><option value="sharp">Sharp</option><option value="minimal">Minimal</option></select></label></div><div className="preferences-section"><span className="eyebrow">Research & intelligence</span><label className="preference-row"><span><strong>Cite sources</strong><small>Prefer source-aware answers.</small></span><input type="checkbox" checked={workspaceSettings.citeSources} onChange={(event) => updateSetting("citeSources", event.target.checked)} /></label><label className="preference-row"><span><strong>Web search by default</strong><small>Allow current-information lookup.</small></span><input type="checkbox" checked={workspaceSettings.webSearchDefault} onChange={(event) => updateSetting("webSearchDefault", event.target.checked)} /></label><label className="preference-row"><span><strong>Confirm external actions</strong><small>Ask before high-impact operations.</small></span><input type="checkbox" checked={workspaceSettings.confirmExternalActions} onChange={(event) => updateSetting("confirmExternalActions", event.target.checked)} /></label><label className="preference-row"><span><strong>Conversation history</strong><small>Save authenticated conversations.</small></span><input type="checkbox" checked={workspaceSettings.saveConversationHistory} onChange={(event) => updateSetting("saveConversationHistory", event.target.checked)} /></label><label className="preference-row"><span><strong>Local-only drafts</strong><small>Keep drafts on this device.</small></span><input type="checkbox" checked={workspaceSettings.localOnlyDrafts} onChange={(event) => updateSetting("localOnlyDrafts", event.target.checked)} /></label></div><div className="preferences-section"><span className="eyebrow">Artifacts & attachments</span><label className="preference-row"><span><strong>Auto-open artifacts</strong><small>Open generated documents beside chat.</small></span><input type="checkbox" checked={workspaceSettings.autoOpenArtifacts} onChange={(event) => updateSetting("autoOpenArtifacts", event.target.checked)} /></label><label className="preference-row"><span><strong>Artifact previews</strong><small>Show document and code previews.</small></span><input type="checkbox" checked={workspaceSettings.artifactPreview} onChange={(event) => updateSetting("artifactPreview", event.target.checked)} /></label><label className="preference-row"><span><strong>Attachment previews</strong><small>Show thumbnails and metadata.</small></span><input type="checkbox" checked={workspaceSettings.attachmentPreviews} onChange={(event) => updateSetting("attachmentPreviews", event.target.checked)} /></label><label className="preference-row"><span><strong>Redact attachment previews</strong><small>Prefer privacy-safe extracted text.</small></span><input type="checkbox" checked={workspaceSettings.redactAttachments} onChange={(event) => updateSetting("redactAttachments", event.target.checked)} /></label><label className="preference-row"><span><strong>Maximum attachment size</strong><small>{workspaceSettings.maxAttachmentMb} MB per file.</small></span><select value={workspaceSettings.maxAttachmentMb} onChange={(event) => updateSetting("maxAttachmentMb", Number(event.target.value))}><option value="10">10 MB</option><option value="25">25 MB</option><option value="50">50 MB</option><option value="100">100 MB</option></select></label></div><div className="preferences-section"><span className="eyebrow">Notifications & privacy</span><label className="preference-row"><span><strong>Task completion alerts</strong><small>Notify when longer work finishes.</small></span><input type="checkbox" checked={workspaceSettings.notifyTaskComplete} onChange={(event) => updateSetting("notifyTaskComplete", event.target.checked)} /></label><label className="preference-row"><span><strong>Mention alerts</strong><small>Notify about workspace mentions.</small></span><input type="checkbox" checked={workspaceSettings.notifyMentions} onChange={(event) => updateSetting("notifyMentions", event.target.checked)} /></label><label className="preference-row"><span><strong>Sound effects</strong><small>Use quiet interface sounds.</small></span><input type="checkbox" checked={workspaceSettings.soundEffects} onChange={(event) => updateSetting("soundEffects", event.target.checked)} /></label><label className="preference-row"><span><strong>Auto-transcribe voice</strong><small>Insert recorded voice transcripts into the draft.</small></span><input type="checkbox" checked={workspaceSettings.autoTranscribeVoice} onChange={(event) => updateSetting("autoTranscribeVoice", event.target.checked)} /></label><label className="preference-row"><span><strong>Show tool status</strong><small>Show progress labels for long-running tools.</small></span><input type="checkbox" checked={workspaceSettings.showToolStatus} onChange={(event) => updateSetting("showToolStatus", event.target.checked)} /></label><label className="preference-row"><span><strong>Allow anonymous analytics</strong><small>Never include message content.</small></span><input type="checkbox" checked={workspaceSettings.allowAnalytics} onChange={(event) => updateSetting("allowAnalytics", event.target.checked)} /></label><label className="preference-row"><span><strong>Keyboard shortcuts</strong><small>Enable command palette shortcuts.</small></span><input type="checkbox" checked={workspaceSettings.keyboardShortcuts} onChange={(event) => updateSetting("keyboardShortcuts", event.target.checked)} /></label><label className="preference-row"><span><strong>Language</strong><small>Preferred workspace language.</small></span><select value={workspaceSettings.language} onChange={(event) => updateSetting("language", event.target.value)}><option>English</option><option>French</option><option>Spanish</option><option>Portuguese</option><option>German</option></select></label><label className="preference-row"><span><strong>Timezone</strong><small>Used for timestamps and schedules.</small></span><input value={workspaceSettings.timezone} onChange={(event) => updateSetting("timezone", event.target.value)} /></label></div></div><div className="preference-footnote">Saved automatically on this device. Sign in to sync workspace data across devices.</div></section></div>}
      {promptLibraryOpen && <div className="overlay-scrim" onClick={() => setPromptLibraryOpen(false)}><section className="prompt-library" role="dialog" aria-label="Prompt library" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Nova toolkit</span><h2>Prompt library</h2></div><IconButton label="Close prompt library" onClick={() => setPromptLibraryOpen(false)}><X size={17} /></IconButton></div><p>Start from a reusable prompt, then make it your own.</p><div className="prompt-library-toolbar"><div className="folder-tabs">{promptFolders.map((folder) => <button key={folder} className={promptFolder === folder ? "folder-tab active" : "folder-tab"} onClick={() => setPromptFolder(folder)}>{folder}<span>{folder === "All prompts" ? promptItems.length : promptItems.filter((item) => item.folder === folder).length}</span></button>)}</div><div className="folder-actions"><button onClick={createPromptFolder}><Plus size={14} />New folder</button>{promptFolder !== "All prompts" && <><button onClick={renamePromptFolder} aria-label="Rename folder"><PenLine size={14} /></button><button onClick={deletePromptFolder} aria-label="Delete folder"><Archive size={14} /></button></>}</div></div><div className="prompt-grid">{filteredPromptItems.map((item) => <div className="prompt-card" key={item.id}><button className="prompt-card-main" onClick={() => applyPrompt(item.text)}><Sparkles size={15} /><span>{item.text}</span><ArrowUpRight size={14} /></button><select value={item.folder} onChange={(event) => assignPrompt(item.id, event.target.value)} aria-label={`Folder for ${item.text}`}>{promptFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}</select></div>)}</div></section></div>}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} selected={selected} onSelect={(id) => { setSelected(id); if (!isAuthenticated) setMessages([]); }} onNew={startNew} items={conversationItems} projectCount={projectsQuery.data?.length ?? 0} projects={projectsQuery.data ?? []} activeProject={activeProject} onCreateProject={createProjectFromSidebar} onSelectProject={(id) => { setActiveProject(id); setSelected(0); setMessages([]); setSidebarOpen(false); }} onToggleStar={toggleStar} onOpenPreferences={() => setPreferencesOpen(true)} onSignIn={beginLogin} showHints={showHints} isAuthenticated={isAuthenticated} />
      <main className="chat-area">
        <header className="chat-header">
          <div className="mobile-brand"><IconButton label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></IconButton><NovaMark size={24} /><span>nova</span></div>
          <div className="conversation-heading"><span>{activeTitle}</span>{currentProject && <button className="project-context-pill" onClick={() => setInstructionsOpen((open) => !open)}><FolderOpen size={13} />{currentProject.name}</button>}<button className="header-caret" aria-label="Conversation options" onClick={() => toast("Conversation options are available from the actions above.")}><ChevronDown size={15} /></button></div>
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
          <div className={`composer-wrap ${isDragActive ? "is-drag-active" : ""}`} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {attachments.length > 0 && <div className="attachment-preview-row">{attachments.map((attachment) => <div className="attachment-preview" key={attachment.id}>{attachment.previewUrl ? <img src={attachment.previewUrl} alt="" /> : <div className="file-preview-icon"><FileText size={16} /></div>}<div className="attachment-copy"><strong>{attachment.file.name}</strong><span>{Math.max(1, Math.round(attachment.file.size / 1024))} KB</span></div><button aria-label={`Remove ${attachment.file.name}`} onClick={() => removeAttachment(attachment.id)}><X size={13} /></button></div>)}</div>}
            <div className="composer-tools"><IconButton label="Voice input" active={isRecording} onClick={startVoiceInput}><Mic size={18} /></IconButton><input ref={fileInputRef} className="sr-only" type="file" multiple accept="*/*" onChange={(event) => { void handleFiles(event.target.files); event.currentTarget.value = ""; }} /><input ref={imageInputRef} className="sr-only" type="file" multiple accept="image/*" onChange={(event) => { void handleFiles(event.target.files); event.currentTarget.value = ""; }} /><button className="composer-attach-button" type="button" onClick={() => fileInputRef.current?.click()}><Paperclip size={17} /><span>Attach files</span></button><IconButton label="Add an image" onClick={() => imageInputRef.current?.click()}><ImagePlus size={18} /></IconButton><IconButton label="Create artifact" active={artifactCreateOpen} onClick={() => setArtifactCreateOpen(true)}><FileText size={18} /></IconButton></div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && enterToSend) { e.preventDefault(); sendMessage(); } }} placeholder="Message Nova..." rows={1} aria-label="Message Nova" /><div className="composer-attachment-bar"><button className="composer-attach-button" type="button" onClick={() => fileInputRef.current?.click()}><Paperclip size={17} /><span>Attach files</span></button>{workspaceSettings.showAttachmentDropZone && <span className="drop-hint">or drag files here</span>}{attachments.length > 0 && <span className="attachment-count">{attachments.length} attached</span>}</div>
            <div className="composer-bottom"><div className="composer-context"><button className="model-selector" onClick={() => setModelOpen((value) => !value)}><Sparkles size={14} /><span>{selectedModel === "nova-fast" ? "Nova Fast" : "Nova 2"}</span><ChevronDown size={13} /></button>{modelOpen && <div className="model-menu"><div className="provider-menu-label">Choose how Nova responds</div><button onClick={() => { setSelectedModel("nova-2"); setModelOpen(false); }}><span className="model-dot" /><span><strong>Nova 2</strong><small>Balanced and thoughtful</small></span>{selectedModel === "nova-2" && <Check size={15} />}</button><button onClick={() => { setSelectedModel("nova-fast"); setModelOpen(false); }}><span className="model-dot fast" /><span><strong>Nova Fast</strong><small>Quick everyday help</small></span>{selectedModel === "nova-fast" && <Check size={15} />}</button></div>}<span className="context-divider" /><button className="context-link" onClick={() => void runWebSearch()}><Globe2 size={14} />{searchMutation.isPending ? "Searching…" : "Web search"}</button><button className="context-link" onClick={() => setSandboxOpen(true)}><Terminal size={14} />Sandbox</button></div><button className={`send-button ${draft.trim() ? "ready" : ""}`} onClick={sendMessage} aria-label="Send message"><Send size={17} /></button></div>
          </div>
          {showHints && <p className="composer-note">Nova can make mistakes. Check important information.</p>}
        </div>
      </main>
    </div>
  );
}
