import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Message = { id: string; role: 'user' | 'assistant'; text: string; tool?: string };
export type Chat = { id: string; title: string; messages: Message[]; updatedAt: string };
export type Project = { id: string; name: string; description: string; color: string; files: number };
export type Tool = { id: string; name: string; description: string; icon: string; category: string };

type NovaContextValue = { chats: Chat[]; projects: Project[]; tools: Tool[]; activeChat: Chat; createChat: () => void; sendMessage: (text: string) => void; toggleProject: (id: string) => void };

const tools: Tool[] = [
  { id: 'memory', name: 'Memory Vault', description: 'Recall, store, and organize durable knowledge.', icon: 'brain', category: 'Cognition' },
  { id: 'reasoning', name: 'Reasoning Chain', description: 'Break complex questions into clear steps.', icon: 'git-branch', category: 'Cognition' },
  { id: 'learning', name: 'Learning Loop', description: 'Turn feedback into reusable improvements.', icon: 'book-open', category: 'Cognition' },
  { id: 'calculator', name: 'Calculator', description: 'Evaluate basic numeric expressions safely.', icon: 'calculator', category: 'Utilities' },
  { id: 'summarize', name: 'Summarizer', description: 'Compress long notes into useful briefs.', icon: 'scan', category: 'Utilities' },
  { id: 'planner', name: 'Project Planner', description: 'Create milestones, tasks, and next actions.', icon: 'list', category: 'Productivity' },
];

const initialChats: Chat[] = [{ id: 'nova', title: 'New conversation', updatedAt: new Date().toISOString(), messages: [{ id: 'welcome', role: 'assistant', text: 'I’m Nova. I can help you think, build, plan, and remember — entirely on this device.' }] }];
const initialProjects: Project[] = [{ id: 'mobile', name: 'Mobile workspace', description: 'Your converted Expo command center.', color: '#55d6ff', files: 12 }, { id: 'ideas', name: 'Ideas lab', description: 'Capture and develop new directions.', color: '#a78bfa', files: 7 }];
const NovaContext = createContext<NovaContextValue | null>(null);

export function NovaProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [loaded, setLoaded] = useState(false);
  const projects = initialProjects;

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem('nova.chats').then((value) => {
      if (!mounted) return;
      if (value) {
        try { setChats(JSON.parse(value) as Chat[]); } catch { setChats(initialChats); }
      }
      setLoaded(true);
    }).catch(() => mounted && setLoaded(true));
    return () => { mounted = false; };
  }, []);

  useEffect(() => { if (loaded) void AsyncStorage.setItem('nova.chats', JSON.stringify(chats)); }, [chats, loaded]);

  const activeChat = chats[0] ?? initialChats[0];
  const createChat = () => setChats((value) => [{ id: `${Date.now()}`, title: 'New conversation', updatedAt: new Date().toISOString(), messages: [] }, ...value]);
  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const tool = toolFor(trimmed);
    setChats((value) => value.map((chat, index) => index ? chat : ({ ...chat, title: chat.messages.length ? chat.title : trimmed.slice(0, 28), updatedAt: new Date().toISOString(), messages: [...chat.messages, { id: `${Date.now()}`, role: 'user', text: trimmed }, { id: `a${Date.now()}`, role: 'assistant', text: reply(tool), tool }] })));
  };
  const value = useMemo(() => ({ chats, projects, tools, activeChat, createChat, sendMessage, toggleProject: () => {} }), [chats, activeChat]);
  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
}

export function useNova() { const value = useContext(NovaContext); if (!value) throw new Error('useNova must be used inside NovaProvider'); return value; }
function toolFor(text: string) { const value = text.toLowerCase(); if (value.includes('remember') || value.includes('memory')) return 'Memory Vault'; if (value.includes('plan')) return 'Project Planner'; if (/[0-9]\s*[+*/-]\s*[0-9]/.test(value) || value.includes('calculate')) return 'Calculator'; if (value.includes('summar')) return 'Summarizer'; return undefined; }
function reply(tool?: string) { if (tool === 'Memory Vault') return 'I can keep that in your local Memory Vault. What should I label this memory?'; if (tool === 'Project Planner') return 'Let’s make it actionable. I’d start with a clear outcome, three milestones, and one next action for today.'; if (tool === 'Calculator') return 'Calculator is ready. Send an expression like 18 * 4 or 120 / 8.'; if (tool === 'Summarizer') return 'Paste the notes you want condensed and I’ll turn them into a focused brief.'; return 'That’s a good direction. I can help you explore it, turn it into a plan, or save the useful parts to memory.'; }
