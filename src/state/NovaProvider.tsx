import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addMemory, agentTools, appendEvent, AgentEvent, AgentJob, AgentRun, Approval, clearRuntime, createJob, createRun, exportRuntime, loadRuntime, Memory, pipelines, Pipeline, requestApproval, RuntimeData, saveRuntime } from '../agent/runtime';
import { CapabilityStatus, getCapabilityStatus, requestCapability } from '../platform/capabilities';
import { createTextFile, defaultStorageSettings, exportWorkspace, importPickedFiles, loadWorkspace, NovaFile, recoverWorkspace, removeWorkspaceFile, saveWorkspace, StorageSettings, updateStorageSettings } from '../storage/workspace';
import type { Tool } from './types';
import { advancedTools } from '../agent/advancedTools';
import { operationsTools } from '../agent/operationsTools';
import { productionTools } from '../agent/productionTools';
import { utilityTools } from '../agent/utilityTools';
import { useBackend } from '../backend/BackendProvider';
import { backendCreateChat, backendDecideApproval, backendRunTool, backendSendMessage, NovaApiError, streamNovaMessage } from '../backend/novaApi';
import type { ToolDefinition } from '../agent/runtime';

export type Message = { id: string; role: 'user' | 'assistant'; text: string; tool?: string; pending?: boolean; error?: boolean; approvalId?: string };
export type Chat = { id: string; title: string; messages: Message[]; updatedAt: string; backendChatId?: string };
export type Project = { id: string; name: string; description: string; color: string; files: number };

/** Single source of truth for every locally executable tool definition. */
export const allLocalTools: ToolDefinition[] = [...agentTools, ...advancedTools, ...operationsTools, ...productionTools, ...utilityTools];
export const findLocalTool = (id: string) => allLocalTools.find((tool) => tool.id === id);

const tools: Tool[] = [
  { id: 'memory', name: 'Memory Vault', description: 'Recall, store, and organize durable knowledge.', icon: 'brain', category: 'Cognition' },
  { id: 'reasoning', name: 'Reasoning Chain', description: 'Break complex questions into clear steps.', icon: 'git-branch', category: 'Cognition' },
  { id: 'learning', name: 'Learning Loop', description: 'Turn feedback into reusable improvements.', icon: 'book-open', category: 'Cognition' },
  { id: 'planner', name: 'Project Planner', description: 'Create milestones, tasks, and next actions.', icon: 'list', category: 'Productivity' },
  ...allLocalTools.map((tool) => ({ id: tool.id, name: tool.name, description: tool.description, icon: 'sparkles', category: categoryForTool(tool) })),
  { id: 'web-search-pro', name: 'Web Search Pro', description: 'Search the live web and optionally return full page content for grounded answers.', icon: 'globe', category: 'Production' },
  { id: 'code-execute', name: 'Code Executor', description: 'Run Python, JavaScript, TypeScript, R, or Bash in an isolated ephemeral sandbox. Requires approval.', icon: 'code-slash', category: 'Production' },
  { id: 'web-scrape', name: 'Page Scraper', description: 'Fetch a public HTTPS page and return clean, readable content for grounded analysis.', icon: 'globe', category: 'Production' },
  { id: 'web-site-map', name: 'Site Mapper', description: 'Discover the URL tree of a public website before selecting pages to analyze.', icon: 'map', category: 'Production' },
  { id: 'provider-status', name: 'Provider Diagnostics', description: 'Check which external providers are configured without exposing secrets.', icon: 'pulse', category: 'Production' },
  { id: 'summarize', name: 'Smart Summarizer', description: 'Turn long text into a concise brief, bullet summary, or executive readout.', icon: 'scan', category: 'Production' },
  { id: 'code-generate', name: 'Code Generator', description: 'Generate a focused code snippet without executing it.', icon: 'code-slash', category: 'Production' },
  { id: 'web-search-summary', name: 'Multi-Source Research', description: 'Combine up to five public pages into one cited research brief.', icon: 'globe', category: 'Production' },
  { id: 'translate', name: 'Translator', description: 'Translate text into a target language with no extra commentary.', icon: 'language', category: 'Production' },
  { id: 'classify', name: 'Text Classifier', description: 'Classify text into labels with a confidence score.', icon: 'pricetag', category: 'Production' },
];

function categoryForTool(tool: ToolDefinition): string {
  if ((utilityTools as ToolDefinition[]).includes(tool)) return 'Utilities';
  if ((advancedTools as ToolDefinition[]).includes(tool)) return 'Advanced';
  if ((operationsTools as ToolDefinition[]).includes(tool)) return 'Operations';
  if ((productionTools as ToolDefinition[]).includes(tool)) return 'Production';
  return 'Agentic';
}
const initialChats: Chat[] = [{ id: 'nova', title: 'New conversation', updatedAt: new Date().toISOString(), messages: [{ id: 'welcome', role: 'assistant', text: 'I’m Nova. I can help you think, build, plan, and remember. Connect a backend in Settings → Backend for real LLM replies with tools, memory, and agents — otherwise I run useful local heuristics only.' }] }];
const initialProjects: Project[] = [{ id: 'mobile', name: 'Mobile workspace', description: 'Your converted Expo command center.', color: '#55d6ff', files: 12 }, { id: 'ideas', name: 'Ideas lab', description: 'Capture and develop new directions.', color: '#a78bfa', files: 7 }];

type NovaContextValue = { chats: Chat[]; projects: Project[]; tools: Tool[]; runs: AgentRun[]; approvals: Approval[]; memories: Memory[]; jobs: AgentJob[]; events: AgentEvent[]; files: NovaFile[]; settings: StorageSettings; capabilities: CapabilityStatus; pipelines: Pipeline[]; activeChat: Chat; ready: boolean; backendConnected: boolean; streamingReply: boolean; createChat: () => void; sendMessage: (text: string) => void; runProductionTool: (toolId: string, input: Record<string, unknown>) => Promise<void>; runLocalToolInChat: (toolId: string, input: string) => Promise<string | null>; decideBackendApproval: (approvalId: string, approved: boolean) => Promise<void>; startRun: (input: string, toolId?: string) => Promise<string | null> | null; startPipeline: (pipeline: Pipeline, input: string) => Promise<string | null> | null; approve: (id: string, approved: boolean) => void; saveMemory: (content: string, tags?: string[]) => void; importFiles: () => Promise<void>; createNote: () => Promise<void>; deleteFile: (id: string) => Promise<void>; exportFiles: () => Promise<void>; updateSettings: (settings: StorageSettings) => Promise<void>; recoverStorage: () => Promise<void>; exportAgentData: () => Promise<string>; resetAgentData: () => Promise<void>; requestPermission: (name: keyof CapabilityStatus) => Promise<CapabilityStatus[keyof CapabilityStatus]> };
const NovaContext = createContext<NovaContextValue | null>(null);

export function NovaProvider({ children }: { children: React.ReactNode }) {
  const { config: backendConfig, health: backendHealth } = useBackend();
  const [chats, setChats] = useState<Chat[]>(initialChats); const [runs, setRuns] = useState<AgentRun[]>([]); const [approvals, setApprovals] = useState<Approval[]>([]); const [memories, setMemories] = useState<Memory[]>([]); const [jobs, setJobs] = useState<AgentJob[]>([]); const [events, setEvents] = useState<AgentEvent[]>([]); const [files, setFiles] = useState<NovaFile[]>([]); const [settings, setSettings] = useState<StorageSettings>(defaultStorageSettings); const [capabilities, setCapabilities] = useState<CapabilityStatus>({ camera: 'undetermined', microphone: 'undetermined', notifications: 'undetermined', mediaLibrary: 'undetermined' }); const [ready, setReady] = useState(false); const [streamingReply, setStreamingReply] = useState(false);
  const backendConnected = backendConfig.mode === 'remote' && Boolean(backendConfig.baseUrl) && backendHealth.status === 'healthy';
  const chatsRef = useRef(chats);
  const jobsRef = useRef(jobs);
  const runsRef = useRef(runs);
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { jobsRef.current = jobs; runsRef.current = runs; }, [jobs, runs]);

  useEffect(() => { Promise.all([loadRuntime(), loadWorkspace(), getCapabilityStatus()]).then(([runtime, workspace, capability]) => { setRuns(runtime.runs); setApprovals(runtime.approvals); setMemories(runtime.memories); setJobs(runtime.jobs); setEvents(runtime.events); setFiles(workspace.files); setSettings(workspace.settings); setCapabilities(capability); setReady(true); }).catch(() => setReady(true)); }, []);
  useEffect(() => { if (ready) void saveRuntime({ runs, approvals, memories, jobs, events }); }, [runs, approvals, memories, jobs, events, ready]);
  useEffect(() => { if (ready) void saveWorkspace(files, settings); }, [files, settings, ready]);
  const activeChat = chats[0] ?? initialChats[0];
  const activeChatId = () => (chatsRef.current[0] ?? initialChats[0]).id;
  const log = async (event: Omit<AgentEvent, 'id' | 'createdAt'>) => { const next = await appendEvent(event); setEvents((value) => [next, ...value].slice(0, 500)); };
  const createChat = () => setChats((value) => [{ id: `${Date.now()}`, title: 'New conversation', updatedAt: new Date().toISOString(), messages: [] }, ...value]);

  const patchChat = (chatId: string, updater: (chat: Chat) => Chat) => setChats((value) => value.map((chat) => (chat.id === chatId ? updater(chat) : chat)));
  const appendMessage = (chatId: string, message: Message) => patchChat(chatId, (chat) => ({ ...chat, updatedAt: new Date().toISOString(), title: chat.messages.length ? chat.title : message.role === 'user' ? message.text.slice(0, 28) : chat.title, messages: [...chat.messages, message] }));
  const replaceMessage = (chatId: string, messageId: string, patch: Partial<Message>) => patchChat(chatId, (chat) => ({ ...chat, messages: chat.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) }));

  /**
   * Ensures the given local chat has a corresponding backend chat id,
   * creating one lazily on first send. Cached on the Chat object itself.
   */
  const ensureBackendChatId = async (chat: Chat): Promise<string> => {
    if (chat.backendChatId) return chat.backendChatId;
    const created = await backendCreateChat(backendConfig, chat.title === 'New conversation' ? 'New conversation' : chat.title);
    patchChat(chat.id, (c) => ({ ...c, backendChatId: created.id }));
    return created.id;
  };

  const localReplyFallback = (text: string, reason?: string) => {
    const base = reply(text);
    return reason ? `${base}\n\n(Offline mode — ${reason})` : base;
  };

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const chat = chatsRef.current[0] ?? initialChats[0];
    const userMessage: Message = { id: `${Date.now()}`, role: 'user', text: trimmed };
    appendMessage(chat.id, userMessage);

    if (!backendConnected) {
      // No live backend: keep the app fully usable with the original local heuristic reply.
      const assistantMessage: Message = { id: `a${Date.now()}`, role: 'assistant', text: localReplyFallback(trimmed, backendConfig.mode === 'remote' ? backendHealth.message : 'connect a backend in Settings to get real AI replies'), tool: toolFor(trimmed) };
      appendMessage(chat.id, assistantMessage);
      return;
    }

    void (async () => {
      try {
        const backendChatId = await ensureBackendChatId(chat);
        const pendingId = `a${Date.now()}`;
        appendMessage(chat.id, { id: pendingId, role: 'assistant', text: '', pending: true });
        setStreamingReply(true);

        let received = false;
        let streamError: Error | null = null;
        await streamNovaMessage(backendConfig, backendChatId, trimmed, {
          onDelta: (delta) => { received = true; replaceMessage(chat.id, pendingId, { text: (chatsRef.current.find((c) => c.id === chat.id)?.messages.find((m) => m.id === pendingId)?.text ?? '') + delta, pending: true }); },
          onToolCall: (tool) => { replaceMessage(chat.id, pendingId, { tool }); },
          onDone: (assistantMessage) => { received = true; replaceMessage(chat.id, pendingId, { text: assistantMessage.text, tool: assistantMessage.tool, pending: false }); },
          onError: (error) => { streamError = error; replaceMessage(chat.id, pendingId, { text: `Backend error: ${error.message}`, pending: false, error: true }); },
        });

        // The stream endpoint persists the user message server-side before
        // streaming, so a retry must ONLY happen when the request never
        // reached the backend (network-level failure, not an HTTP error).
        const failure = streamError as Error | null;
        if (!received && failure instanceof Error && !(failure instanceof NovaApiError)) {
          const result = await backendSendMessage(backendConfig, backendChatId, trimmed);
          replaceMessage(chat.id, pendingId, { text: result.assistantMessage.text, tool: result.assistantMessage.tool, pending: false });
        }
        if (!received && !failure) {
          replaceMessage(chat.id, pendingId, { text: '(The backend returned an empty stream. Try resending in a moment.)', pending: false, error: true });
        }
      } catch (error) {
        appendMessage(chat.id, { id: `err${Date.now()}`, role: 'assistant', text: `Backend error: ${error instanceof Error ? error.message : 'unknown error'}. ${localReplyFallback(trimmed)}`, error: true });
      } finally {
        setStreamingReply(false);
      }
    })();
  };

  const runProductionTool = async (toolId: string, input: Record<string, unknown>) => {
    const chat = chatsRef.current[0] ?? initialChats[0];
    const label = toolId === 'code-execute' ? 'Run code' : toolId === 'web-search-pro' ? 'Search the web' : toolId === 'web-scrape' ? 'Scrape page' : toolId === 'web-site-map' ? 'Map website' : toolId === 'provider-status' ? 'Check providers' : toolId === 'summarize' ? 'Summarize' : toolId === 'code-generate' ? 'Generate code' : toolId === 'web-search-summary' ? 'Research sources' : toolId === 'translate' ? 'Translate' : toolId === 'classify' ? 'Classify text' : `Run ${toolId}`;
    const inputPreview = toolId === 'code-execute' ? String(input.code ?? '').slice(0, 120) : toolId === 'web-scrape' || toolId === 'web-site-map' ? String(input.url ?? '').slice(0, 120) : toolId === 'summarize' || toolId === 'code-generate' || toolId === 'translate' || toolId === 'classify' ? String(input.text ?? input.description ?? '').slice(0, 120) : toolId === 'web-search-summary' ? String(input.urls ?? '').slice(0, 120) : String(input.query ?? '').slice(0, 120);
    const pendingId = `a${Date.now()}`;
    appendMessage(chat.id, { id: `u${Date.now() - 1}`, role: 'user', text: `${label}: ${inputPreview}` });
    appendMessage(chat.id, { id: pendingId, role: 'assistant', text: '', pending: true, tool: toolId });
    try {
      if (!backendConnected) throw new Error('Connect a backend before running production tools.');
      const outcome = await backendRunTool(backendConfig, toolId, input);
      const resultText = outcome.requiresConfirmation
        ? `${outcome.message ?? 'This tool requires approval before it can run.'}\n\nApproval ID: ${outcome.approvalId ?? 'pending'}`
        : outcome.ok === false ? (outcome.error ?? 'Tool execution failed.') : formatToolResult(outcome.result);
      if (pendingId) replaceMessage(chat.id, pendingId, { text: resultText, pending: false, error: outcome.ok === false || Boolean(outcome.requiresConfirmation), approvalId: outcome.approvalId });
    } catch (error) {
      if (pendingId) replaceMessage(chat.id, pendingId, { text: error instanceof Error ? error.message : 'Production tool failed.', pending: false, error: true });
    }
  };

  const decideBackendApproval = async (approvalId: string, approved: boolean) => {
    if (!backendConnected) throw new Error('Connect a backend before deciding approvals.');
    await backendDecideApproval(backendConfig, approvalId, approved);
    const chat = chatsRef.current[0] ?? initialChats[0];
    const message = chat.messages.find((item) => item.approvalId === approvalId);
    if (message) replaceMessage(chat.id, message.id, { text: `${approved ? 'Approved' : 'Rejected'} on the backend. ${approved ? 'Run the request again to execute it with approval applied.' : 'Nothing was executed.'}`, approvalId: undefined, error: !approved });
  };

  const startRun = (input: string, toolId = 'extract') => { const run = createRun(input); const job = createJob(run.id, toolId, input); run.jobIds = [job.id]; run.status = 'running'; setRuns((value) => [run, ...value]); setJobs((value) => [job, ...value]); void log({ type: 'run.created', runId: run.id, message: `Started ${run.title}` }); const selectedTool = findLocalTool(toolId); if (selectedTool?.risk !== 'safe') { setApprovals((value) => [requestApproval(run, job, selectedTool?.risk ?? 'review'), ...value]); void log({ type: 'approval.requested', runId: run.id, message: `Approval required for ${toolId}` }); return null; } return executeJob(run, job); };

  /** Executes a job's tool for real and updates run/job/step state + the active chat transcript. */
  const executeJob = async (run: AgentRun, job: AgentJob): Promise<string | null> => {
    const selectedTool = findLocalTool(job.toolId);
    setJobs((value) => value.map((item) => (item.id === job.id ? { ...item, status: 'running', attempts: item.attempts + 1, updatedAt: new Date().toISOString() } : item)));
    const stepPatch = (name: string, status: AgentRun['steps'][number]['status'], output?: string) => setRuns((value) => value.map((item) => (item.id === run.id ? { ...item, updatedAt: new Date().toISOString(), steps: item.steps.map((step) => (step.id === name || step.name === name ? { ...step, status, output } : step)) } : item)));
    if (!selectedTool) {
      const error = `Unknown local tool: ${job.toolId}`;
      finishFailedRun(run.id, job.id, error);
      return error;
    }
    try {
      const filesNow = await loadWorkspace().then((workspace) => workspace.files).catch(() => []);
      const output = await selectedTool.run(job.input, { files: filesNow, log });
      setJobs((value) => value.map((item) => (item.id === job.id ? { ...item, status: 'completed', updatedAt: new Date().toISOString() } : item)));
      stepPatch('inspect', 'completed', `Input captured for ${selectedTool.name}.`);
      stepPatch('plan', 'completed', `Single-step plan: run ${selectedTool.id} (${selectedTool.risk}).`);
      stepPatch('execute', 'completed', output.slice(0, 400));
      stepPatch('review', 'completed', 'Output reviewed locally.');
      setRuns((value) => value.map((item) => (item.id === run.id ? { ...item, status: 'completed', updatedAt: new Date().toISOString() } : item)));
      void log({ type: 'run.completed', runId: run.id, message: `${selectedTool.name} completed.` });
      appendMessage(activeChatId(), { id: `t${Date.now()}`, role: 'assistant', text: `${selectedTool.name}\n\n${output}`, tool: selectedTool.id });
      return output;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Local tool execution failed.';
      finishFailedRun(run.id, job.id, messageText);
      appendMessage(activeChatId(), { id: `t${Date.now()}`, role: 'assistant', text: `${selectedTool.name} failed: ${messageText}`, tool: selectedTool.id, error: true });
      return messageText;
    }
  };
  const finishFailedRun = (runId: string, jobId: string, error: string) => { setJobs((value) => value.map((item) => (item.id === jobId ? { ...item, status: 'failed' as const, error, updatedAt: new Date().toISOString() } : item))); setRuns((value) => value.map((item) => (item.id === runId ? { ...item, status: 'failed' as const, error, updatedAt: new Date().toISOString() } : item))); void log({ type: 'run.failed', runId, message: error }); };

  /**
   * Runs a locally executable tool from the chat composer / Toolbox screen.
   * Appends the invocation + result to the active conversation. Works fully offline.
   */
  const runLocalToolInChat = async (toolId: string, input: string): Promise<string | null> => {
    const chat = chatsRef.current[0] ?? initialChats[0];
    const selectedTool = findLocalTool(toolId);
    if (!selectedTool) return null;
    appendMessage(chat.id, { id: `u${Date.now()}`, role: 'user', text: `${selectedTool.name}: ${input.slice(0, 200)}` });
    if (!backendConnected && selectedTool.risk !== 'safe') {
      const notice = `${selectedTool.name} is ${selectedTool.risk}-risk; approvals are processed in Operations once you're back online.`;
      appendMessage(chat.id, { id: `t${Date.now()}`, role: 'assistant', text: notice, tool: selectedTool.id, error: true });
      startRun(input, toolId);
      return notice;
    }
    const run = createRun(`${selectedTool.name}: ${input.slice(0, 60)}`);
    const job = createJob(run.id, toolId, input);
    run.jobIds = [job.id];
    run.status = 'running';
    setRuns((value) => [run, ...value]);
    setJobs((value) => [job, ...value]);
    void log({ type: 'run.created', runId: run.id, message: `Started ${run.title}` });
    if (selectedTool.risk !== 'safe') {
      setApprovals((value) => [requestApproval(run, job, selectedTool.risk), ...value]);
      void log({ type: 'approval.requested', runId: run.id, message: `Approval required for ${toolId}` });
      appendMessage(chat.id, { id: `t${Date.now()}`, role: 'assistant', text: `“${selectedTool.name}” is ${selectedTool.risk}-risk. Approve it under Operations → Approvals to execute it.`, tool: selectedTool.id });
      return null;
    }
    return executeJob(run, job);
  };

  const startPipeline = (pipeline: Pipeline, input: string) => startRun(`${pipeline.name}: ${input}`, pipeline.id === 'media' ? 'media-summary' : 'extract');
  const approve = (id: string, approved: boolean) => {
    const approval = approvals.find((item) => item.id === id);
    setApprovals((value) => value.map((item) => item.id === id ? { ...item, status: approved ? 'approved' : 'rejected', resolvedAt: new Date().toISOString() } : item));
    void log({ type: 'approval.resolved', message: `${approved ? 'Approved' : 'Rejected'} approval ${id}` });
    if (!approval) return;
    const jobsNow = jobsRef.current;
    if (!approved) {
      const job = jobsNow.find((item) => item.id === approval.jobId);
      if (job) finishFailedRun(approval.runId, job.id, 'Rejected by operator.');
      else setRuns((value) => value.map((item) => (item.id === approval.runId ? { ...item, status: 'cancelled' as const, updatedAt: new Date().toISOString() } : item)));
      return;
    }
    const job = jobsNow.find((item) => item.id === approval.jobId);
    const run = runsRef.current.find((item) => item.id === approval.runId);
    if (job && run) void executeJob(run, job);
  };
  const saveMemory = (content: string, tags: string[] = []) => { if (content.trim()) setMemories((value) => [addMemory(content, tags), ...value]); };
  const importFiles = async () => { const next = await importPickedFiles(files, settings); setFiles(next); if (next.length !== files.length) void log({ type: 'file.imported', message: `Imported ${next.length - files.length} file(s)` }); };
  const createNote = async () => setFiles(await createTextFile(files, `nova-note-${Date.now()}.txt`, 'New Nova note\n\nAdd context here and let the local tools index it.'));
  const deleteFile = async (id: string) => setFiles(await removeWorkspaceFile(files, id));
  const exportFiles = async () => { await exportWorkspace(files, settings); void log({ type: 'file.exported', message: `Exported ${files.length} file(s)` }); };
  const updateSettings = async (next: StorageSettings) => { setSettings(next); await updateStorageSettings(next); };
  const recoverStorage = async () => setFiles(await recoverWorkspace());
  /** Serializes the full agent runtime (runs, approvals, memories, jobs, events) for backup/sharing. */
  const exportAgentData = () => exportRuntime({ runs, approvals, memories, jobs, events } as RuntimeData);
  /** Clears all persisted agent runtime data on-device and resets in-memory state. */
  const resetAgentData = async () => { await clearRuntime(); setRuns([]); setApprovals([]); setMemories([]); setJobs([]); setEvents([]); };
  const requestPermission = async (name: keyof CapabilityStatus) => { const next = await requestCapability(name); setCapabilities((value) => ({ ...value, [name]: next })); return next; };
  const value = useMemo(() => ({ chats, projects: initialProjects, tools, runs, approvals, memories, jobs, events, files, settings, capabilities, pipelines, activeChat, ready, backendConnected, streamingReply, createChat, sendMessage, runProductionTool, runLocalToolInChat, decideBackendApproval, startRun, startPipeline, approve, saveMemory, importFiles, createNote, deleteFile, exportFiles, updateSettings, recoverStorage, exportAgentData, resetAgentData, requestPermission }), [chats, runs, approvals, memories, jobs, events, files, settings, capabilities, activeChat, ready, backendConnected, streamingReply]);
  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
}
export function useNova() { const value = useContext(NovaContext); if (!value) throw new Error('useNova must be used inside NovaProvider'); return value; }
function toolFor(text: string) { const value = text.toLowerCase(); if (value.includes('remember') || value.includes('memory')) return 'Memory Vault'; if (value.includes('plan')) return 'Project Planner'; if (value.includes('run') || value.includes('agent')) return 'Agent runtime'; return undefined; }
function formatToolResult(result: unknown) { if (typeof result === 'string') return result; try { return JSON.stringify(result, null, 2); } catch { return String(result); } }
function reply(text: string) { const tool = toolFor(text); if (tool === 'Memory Vault') return 'I can save that to the on-device Memory Vault. Use the memory tool to label it.'; if (tool === 'Project Planner') return 'I can turn that into a pipeline with milestones, risks, approvals, and a next action.'; if (tool === 'Agent runtime') return 'The local agent runtime can execute a durable run with retryable jobs, typed tools, approval gates, and event history.'; return 'That’s a good direction. I can help you explore it, turn it into a plan, execute local tools, or save the useful parts to memory.'; }
