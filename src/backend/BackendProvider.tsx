import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BackendClient, flushOutbox, loadBackendConfig, loadOutbox, saveBackendConfig } from './client';
import { BackendConfig, BackendHealth, BackendMutation, BackendToolDescriptor, defaultBackendConfig } from './contracts';

type BackendContextValue = { config: BackendConfig; health: BackendHealth; tools: BackendToolDescriptor[]; outbox: BackendMutation[]; loading: boolean; saveConfig: (next: BackendConfig) => Promise<void>; refresh: () => Promise<void>; discoverTools: () => Promise<void>; flush: () => Promise<void> };
const Context = createContext<BackendContextValue | null>(null);

export function BackendProvider({ children }: { children: React.ReactNode }) { const [config, setConfig] = useState(defaultBackendConfig); const [health, setHealth] = useState<BackendHealth>({ status: 'unknown', checkedAt: new Date().toISOString(), message: 'Checking backend status.' }); const [tools, setTools] = useState<BackendToolDescriptor[]>([]); const [outbox, setOutbox] = useState<BackendMutation[]>([]); const [loading, setLoading] = useState(true);
  const refresh = async () => { const next = await loadBackendConfig(); setConfig(next); setHealth(await new BackendClient(next).health()); setOutbox(await loadOutbox()); setLoading(false); };
  useEffect(() => { void refresh(); }, []);
  const saveConfig = async (next: BackendConfig) => { const saved = await saveBackendConfig(next); setConfig(saved); setHealth(await new BackendClient(saved).health()); };
  const discoverTools = async () => { if (!config.allowRemoteTools) { setTools([]); return; } try { setTools(await new BackendClient(config).listTools()); } catch { setTools([]); } };
  const flush = async () => { await flushOutbox(); setOutbox(await loadOutbox()); setHealth(await new BackendClient(config).health()); };
  const value = useMemo(() => ({ config, health, tools, outbox, loading, saveConfig, refresh, discoverTools, flush }), [config, health, tools, outbox, loading]); return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBackend() { const value = useContext(Context); if (!value) throw new Error('useBackend must be used inside BackendProvider'); return value; }
