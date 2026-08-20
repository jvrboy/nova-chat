import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { aggregateUsage, bootstrapWorkspace, checkConnectors, createDefaultWorkflow, createProjectPlan, runWorkflow, toggleWorkflow, triageTask } from './services';
import { AuditRecord, ConnectorRecord, ProjectRecord, TaskRecord, UsageMetric, WorkflowRecord } from './domain';
import { loadBackendStore } from './repository';
import { processWorkerQueue } from './worker';
import { RealtimeMessage, RealtimeState, RealtimeSyncClient } from './realtime';

type DomainContextValue = { projects: ProjectRecord[]; tasks: TaskRecord[]; workflows: WorkflowRecord[]; connectors: ConnectorRecord[]; audit: AuditRecord[]; usage: UsageMetric[]; summary: { runs: number; toolCalls: number; filesIndexed: number; syncs: number; errors: number; avgLatencyMs: number }; ready: boolean; realtime: RealtimeState; refresh: () => Promise<void>; createPlan: (name: string, description: string) => Promise<void>; seedWorkspace: () => Promise<void>; addDefaultWorkflow: () => Promise<void>; runWorkflow: (id: string) => Promise<void>; toggleWorkflow: (id: string) => Promise<void>; triageTask: (id: string, status: TaskRecord['status']) => Promise<void>; checkConnectors: () => Promise<void>; processJobs: () => Promise<void> };
const Context = createContext<DomainContextValue | null>(null);

export function DomainProvider({ children }: { children: React.ReactNode }) { const [store, setStore] = useState<Awaited<ReturnType<typeof loadBackendStore>>>({ projects: [], tasks: [], workflows: [], connectors: [], audit: [], usage: [], notifications: [] }); const [summary, setSummary] = useState({ runs: 0, toolCalls: 0, filesIndexed: 0, syncs: 0, errors: 0, avgLatencyMs: 0 }); const [ready, setReady] = useState(false); const [realtime, setRealtime] = useState<RealtimeState>({ status: 'disabled', revision: 0, pending: 0 }); const realtimeRef = useRef<RealtimeSyncClient | null>(null);
  const refresh = async () => { const next = await loadBackendStore(); setStore(next); setSummary(await aggregateUsage('nova-local')); setReady(true); };
  useEffect(() => { void refresh(); const client = new RealtimeSyncClient({ onStatus: setRealtime, onChange: (_message: RealtimeMessage) => { void refresh(); }, onSnapshot: (_message: RealtimeMessage) => { void refresh(); }, onConflict: (_message: RealtimeMessage) => { void refresh(); } }); realtimeRef.current = client; void client.start(); return () => client.stop(); }, []);
  const publish = async (entityType: 'project' | 'task', entity: ProjectRecord | TaskRecord) => { await realtimeRef.current?.publishChange(entityType, 'upsert', entity); };
  const seedWorkspace = async () => { await bootstrapWorkspace('nova-local'); await refresh(); };
  const createPlan = async (name: string, description: string) => { const result = await createProjectPlan('nova-local', 'local-user', name, description); await publish('project', result.project); for (const task of result.tasks) await publish('task', task); await refresh(); };
  const addDefaultWorkflow = async () => { await createDefaultWorkflow('nova-local'); await refresh(); };
  const executeWorkflow = async (id: string) => { await runWorkflow(id, 'nova-local', 'local-user'); await refresh(); };
  const flipWorkflow = async (id: string) => { await toggleWorkflow(id); await refresh(); };
  const updateTask = async (id: string, status: TaskRecord['status']) => { const task = await triageTask(id, status, 'local-user', 'nova-local'); if (task) await publish('task', task); await refresh(); };
  const refreshConnectors = async () => { await checkConnectors('nova-local'); await refresh(); };
  const processJobs = async () => { await processWorkerQueue('nova-local'); await refresh(); };
  const value = useMemo(() => ({ projects: store.projects, tasks: store.tasks, workflows: store.workflows, connectors: store.connectors, audit: store.audit, usage: store.usage, summary, ready, realtime, refresh, createPlan, seedWorkspace, addDefaultWorkflow, runWorkflow: executeWorkflow, toggleWorkflow: flipWorkflow, triageTask: updateTask, checkConnectors: refreshConnectors, processJobs }), [store, summary, ready, realtime]); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useDomain() { const value = useContext(Context); if (!value) throw new Error('useDomain must be used inside DomainProvider'); return value; }
