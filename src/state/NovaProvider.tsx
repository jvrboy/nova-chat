import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { addMemory, agentTools, AgentEvent, AgentJob, AgentRun, Approval, createJob, createRun, loadRuntime, Memory, pipelines, Pipeline, requestApproval, RuntimeData, saveRuntime } from '../agent/runtime';
import { appendEvent } from '../agent/runtime';
import { CapabilityStatus, getCapabilityStatus, requestCapability } from '../platform/capabilities';
import { createTextFile, defaultStorageSettings, exportWorkspace, importPickedFiles, loadWorkspace, NovaFile, recoverWorkspace, removeWorkspaceFile, saveWorkspace, StorageSettings, updateStorageSettings } from '../storage/workspace';
import type { Tool } from './types';

export type Message = { id: string; role: 'user' | 'assistant'; text: string; tool?: string };
export type Chat = { id: string; title: string; messages: Message[]; updatedAt: string };
export type Project = { id: string; name: string; description: string; color: string; files: number };
const tools: Tool[] = [
  { id: 'memory', name: 'Memory Vault', description: 'Recall, store, and organize durable knowledge.', icon: 'brain', category: 'Cognition' },
  { id: 'reasoning', name: 'Reasoning Chain', description: 'Break complex questions into clear steps.', icon: 'git-branch', category: 'Cognition' },
  { id: 'learning', name: 'Learning Loop', description: 'Turn feedback into reusable improvements.', icon: 'book-open', category: 'Cognition' },
  { id: 'calculator', name: 'Calculator', description: 'Evaluate numeric expressions safely.', icon: 'calculator', category: 'Utilities' },
  { id: 'summarize', name: 'Summarizer', description: 'Compress notes into useful briefs.', icon: 'scan', category: 'Utilities' },
  { id: 'planner', name: 'Project Planner', description: 'Create milestones, tasks, and next actions.', icon: 'list', category: 'Productivity' },
  ...agentTools.map((tool) => ({ id: tool.id, name: tool.name, description: tool.description, icon: 'sparkles', category: 'Agentic' })),
];
const initialChats: Chat[] = [{ id: 'nova', title: 'New conversation', updatedAt: new Date().toISOString(), messages: [{ id: 'welcome', role: 'assistant', text: 'I’m Nova. I can help you think, build, plan, and remember — entirely on this device.' }] }];
const initialProjects: Project[] = [{ id: 'mobile', name: 'Mobile workspace', description: 'Your converted Expo command center.', color: '#55d6ff', files: 12 }, { id: 'ideas', name: 'Ideas lab', description: 'Capture and develop new directions.', color: '#a78bfa', files: 7 }];

type NovaContextValue = { chats: Chat[]; projects: Project[]; tools: Tool[]; runs: AgentRun[]; approvals: Approval[]; memories: Memory[]; jobs: AgentJob[]; events: AgentEvent[]; files: NovaFile[]; settings: StorageSettings; capabilities: CapabilityStatus; pipelines: Pipeline[]; activeChat: Chat; ready: boolean; createChat: () => void; sendMessage: (text: string) => void; startRun: (input: string, toolId?: string) => void; startPipeline: (pipeline: Pipeline, input: string) => void; approve: (id: string, approved: boolean) => void; saveMemory: (content: string, tags?: string[]) => void; importFiles: () => Promise<void>; createNote: () => Promise<void>; deleteFile: (id: string) => Promise<void>; exportFiles: () => Promise<void>; updateSettings: (settings: StorageSettings) => Promise<void>; recoverStorage: () => Promise<void>; requestPermission: (name: keyof CapabilityStatus) => Promise<void> };
const NovaContext = createContext<NovaContextValue | null>(null);

export function NovaProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Chat[]>(initialChats); const [runs, setRuns] = useState<AgentRun[]>([]); const [approvals, setApprovals] = useState<Approval[]>([]); const [memories, setMemories] = useState<Memory[]>([]); const [jobs, setJobs] = useState<AgentJob[]>([]); const [events, setEvents] = useState<AgentEvent[]>([]); const [files, setFiles] = useState<NovaFile[]>([]); const [settings, setSettings] = useState<StorageSettings>(defaultStorageSettings); const [capabilities, setCapabilities] = useState<CapabilityStatus>({ camera: 'undetermined', microphone: 'undetermined', notifications: 'undetermined', mediaLibrary: 'undetermined' }); const [ready, setReady] = useState(false);
  useEffect(() => { Promise.all([loadRuntime(), loadWorkspace(), getCapabilityStatus()]).then(([runtime, workspace, capability]) => { setRuns(runtime.runs); setApprovals(runtime.approvals); setMemories(runtime.memories); setJobs(runtime.jobs); setEvents(runtime.events); setFiles(workspace.files); setSettings(workspace.settings); setCapabilities(capability); setReady(true); }).catch(() => setReady(true)); }, []);
  useEffect(() => { if (ready) void saveRuntime({ runs, approvals, memories, jobs, events }); }, [runs, approvals, memories, jobs, events, ready]);
  useEffect(() => { if (ready) void saveWorkspace(files, settings); }, [files, settings, ready]);
  const activeChat = chats[0] ?? initialChats[0];
  const log = async (event: Omit<AgentEvent, 'id' | 'createdAt'>) => { const next = await appendEvent(event); setEvents((value) => [next, ...value].slice(0, 500)); };
  const createChat = () => setChats((value) => [{ id: `${Date.now()}`, title: 'New conversation', updatedAt: new Date().toISOString(), messages: [] }, ...value]);
  const sendMessage = (text: string) => { const trimmed = text.trim(); if (!trimmed) return; setChats((value) => value.map((chat, index) => index ? chat : ({ ...chat, title: chat.messages.length ? chat.title : trimmed.slice(0, 28), updatedAt: new Date().toISOString(), messages: [...chat.messages, { id: `${Date.now()}`, role: 'user', text: trimmed }, { id: `a${Date.now()}`, role: 'assistant', text: reply(trimmed), tool: toolFor(trimmed) }] }))); };
  const startRun = (input: string, toolId = 'extract') => { const run = createRun(input); const job = createJob(run.id, toolId, input); run.jobIds = [job.id]; run.status = 'running'; setRuns((value) => [run, ...value]); setJobs((value) => [job, ...value]); void log({ type: 'run.created', runId: run.id, message: `Started ${run.title}` }); if (agentTools.find((tool) => tool.id === toolId)?.risk !== 'safe') { setApprovals((value) => [requestApproval(run, job, agentTools.find((tool) => tool.id === toolId)?.risk ?? 'review'), ...value]); void log({ type: 'approval.requested', runId: run.id, message: `Approval required for ${toolId}` }); } };
  const startPipeline = (pipeline: Pipeline, input: string) => startRun(`${pipeline.name}: ${input}`, pipeline.id === 'media' ? 'media-summary' : 'extract');
  const approve = (id: string, approved: boolean) => { setApprovals((value) => value.map((item) => item.id === id ? { ...item, status: approved ? 'approved' : 'rejected', resolvedAt: new Date().toISOString() } : item)); void log({ type: 'approval.resolved', message: `${approved ? 'Approved' : 'Rejected'} approval ${id}` }); };
  const saveMemory = (content: string, tags: string[] = []) => { if (content.trim()) setMemories((value) => [addMemory(content, tags), ...value]); };
  const importFiles = async () => { const next = await importPickedFiles(files, settings); setFiles(next); if (next.length !== files.length) void log({ type: 'file.imported', message: `Imported ${next.length - files.length} file(s)` }); };
  const createNote = async () => setFiles(await createTextFile(files, `nova-note-${Date.now()}.txt`, 'New Nova note\n\nAdd context here and let the local tools index it.'));
  const deleteFile = async (id: string) => setFiles(await removeWorkspaceFile(files, id));
  const exportFiles = async () => { await exportWorkspace(files, settings); void log({ type: 'file.exported', message: `Exported ${files.length} file(s)` }); };
  const updateSettings = async (next: StorageSettings) => { setSettings(next); await updateStorageSettings(next); };
  const recoverStorage = async () => setFiles(await recoverWorkspace());
  const requestPermission = async (name: keyof CapabilityStatus) => { const next = await requestCapability(name); setCapabilities((value) => ({ ...value, [name]: next })); };
  const value = useMemo(() => ({ chats, projects: initialProjects, tools, runs, approvals, memories, jobs, events, files, settings, capabilities, pipelines, activeChat, ready, createChat, sendMessage, startRun, startPipeline, approve, saveMemory, importFiles, createNote, deleteFile, exportFiles, updateSettings, recoverStorage, requestPermission }), [chats, runs, approvals, memories, jobs, events, files, settings, capabilities, activeChat, ready]);
  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
}
export function useNova() { const value = useContext(NovaContext); if (!value) throw new Error('useNova must be used inside NovaProvider'); return value; }
function toolFor(text: string) { const value = text.toLowerCase(); if (value.includes('remember') || value.includes('memory')) return 'Memory Vault'; if (value.includes('plan')) return 'Project Planner'; if (value.includes('run') || value.includes('agent')) return 'Agent runtime'; return undefined; }
function reply(text: string) { const tool = toolFor(text); if (tool === 'Memory Vault') return 'I can save that to the on-device Memory Vault. Use the memory tool to label it.'; if (tool === 'Project Planner') return 'I can turn that into a pipeline with milestones, risks, approvals, and a next action.'; if (tool === 'Agent runtime') return 'The local agent runtime can execute a durable run with retryable jobs, typed tools, approval gates, and event history.'; return 'That’s a good direction. I can help you explore it, turn it into a plan, execute local tools, or save the useful parts to memory.'; }
