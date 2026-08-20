import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { addMemory, advanceRun, AgentRun, Approval, agentTools, createRun, loadRuntime, Memory, pipelines, Pipeline, requestApproval, runPipeline, saveRuntime } from '../agent/runtime';
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

type NovaContextValue = { chats: Chat[]; projects: Project[]; tools: Tool[]; runs: AgentRun[]; approvals: Approval[]; memories: Memory[]; pipelines: Pipeline[]; activeChat: Chat; createChat: () => void; sendMessage: (text: string) => void; startRun: (input: string) => void; startPipeline: (pipeline: Pipeline, input: string) => void; approve: (id: string, approved: boolean) => void; saveMemory: (content: string, tags?: string[]) => void; toggleProject: (id: string) => void };
const NovaContext = createContext<NovaContextValue | null>(null);

export function NovaProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Chat[]>(initialChats); const [runs, setRuns] = useState<AgentRun[]>([]); const [approvals, setApprovals] = useState<Approval[]>([]); const [memories, setMemories] = useState<Memory[]>([]); const [loaded, setLoaded] = useState(false);
  useEffect(() => { loadRuntime().then((data) => { setRuns(data.runs); setApprovals(data.approvals); setMemories(data.memories); setLoaded(true); }).catch(() => setLoaded(true)); }, []);
  useEffect(() => { if (loaded) void saveRuntime({ runs, approvals, memories }); }, [runs, approvals, memories, loaded]);
  const activeChat = chats[0] ?? initialChats[0];
  const createChat = () => setChats((value) => [{ id: `${Date.now()}`, title: 'New conversation', updatedAt: new Date().toISOString(), messages: [] }, ...value]);
  const sendMessage = (text: string) => { const trimmed = text.trim(); if (!trimmed) return; setChats((value) => value.map((chat, index) => index ? chat : ({ ...chat, title: chat.messages.length ? chat.title : trimmed.slice(0, 28), updatedAt: new Date().toISOString(), messages: [...chat.messages, { id: `${Date.now()}`, role: 'user', text: trimmed }, { id: `a${Date.now()}`, role: 'assistant', text: reply(trimmed), tool: toolFor(trimmed) }] }))); };
  const startRun = (input: string) => { const run = createRun(input); setRuns((value) => [advanceRun(run), ...value]); };
  const startPipeline = async (pipeline: Pipeline, input: string) => { const run = await runPipeline(pipeline, input); setRuns((value) => [run, ...value]); if (agentTools.some((tool) => tool.id === 'approval' && pipeline.id === 'project')) setApprovals((value) => [requestApproval(run), ...value]); };
  const approve = (id: string, approved: boolean) => setApprovals((value) => value.map((item) => item.id === id ? { ...item, status: approved ? 'approved' : 'rejected' } : item));
  const saveMemory = (content: string, tags: string[] = []) => { if (content.trim()) setMemories((value) => [addMemory(content, tags), ...value]); };
  const value = useMemo(() => ({ chats, projects: initialProjects, tools, runs, approvals, memories, pipelines, activeChat, createChat, sendMessage, startRun, startPipeline, approve, saveMemory, toggleProject: () => {} }), [chats, runs, approvals, memories, activeChat]);
  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
}
export function useNova() { const value = useContext(NovaContext); if (!value) throw new Error('useNova must be used inside NovaProvider'); return value; }
function toolFor(text: string) { const value = text.toLowerCase(); if (value.includes('remember') || value.includes('memory')) return 'Memory Vault'; if (value.includes('plan')) return 'Project Planner'; if (value.includes('run') || value.includes('agent')) return 'Agent runtime'; return undefined; }
function reply(text: string) { const tool = toolFor(text); if (tool === 'Memory Vault') return 'I can save that to the on-device Memory Vault. Use the memory tool to label it.'; if (tool === 'Project Planner') return 'I can turn that into a pipeline with milestones, risks, approvals, and a next action.'; if (tool === 'Agent runtime') return 'The local agent runtime can execute a durable run with inspect, plan, execute, and review steps.'; return 'That’s a good direction. I can help you explore it, turn it into a plan, execute local tools, or save the useful parts to memory.'; }
