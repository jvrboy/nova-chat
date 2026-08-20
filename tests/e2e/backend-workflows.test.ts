import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async (key: string) => storage.get(key) ?? null, setItem: async (key: string, value: string) => { storage.set(key, value); }, removeItem: async (key: string) => { storage.delete(key); }, multiSet: async (entries: Array<[string, string]>) => { entries.forEach(([key, value]) => storage.set(key, value)); }, multiRemove: async (keys: string[]) => { keys.forEach((key) => storage.delete(key)); } } }));
vi.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY', getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined }));

import { handleLocalApi } from '../../src/backend/api';
import { loadBackendStore } from '../../src/backend/repository';
import { bootstrapWorkspace, createDefaultWorkflow, createProjectPlan, runWorkflow, triageTask } from '../../src/backend/services';
import { RealtimeHub } from '../../src/backend/realtimeHub';
import { enqueueWorkerJob, loadDeadLetters, loadWorkerQueue, processWorkerQueue } from '../../src/backend/worker';

beforeEach(() => storage.clear());

describe('Nova backend workflows', () => {
  it('bootstraps a workspace and creates an executable project plan', async () => {
    const snapshot = await bootstrapWorkspace('workspace-e2e', 'owner-e2e');
    expect(snapshot.projects).toHaveLength(1);
    const result = await createProjectPlan('workspace-e2e', 'owner-e2e', 'Launch workspace', 'Ship a useful release.');
    expect(result.project.name).toBe('Launch workspace');
    expect(result.tasks).toHaveLength(4);
    const store = await loadBackendStore();
    expect(store.projects.some((project) => project.id === result.project.id)).toBe(true);
    expect(store.tasks.filter((task) => task.projectId === result.project.id)).toHaveLength(4);
  });

  it('executes a workflow and records a local notification plus audit trail', async () => {
    const workflow = await createDefaultWorkflow('workspace-e2e');
    const executed = await runWorkflow(workflow.id, 'workspace-e2e', 'owner-e2e');
    expect(executed.id).toBe(workflow.id);
    const store = await loadBackendStore();
    expect(store.audit.some((record) => record.action === 'workflow.executed')).toBe(true);
    expect(store.notifications.some((notification) => notification.title === 'Workflow completed')).toBe(true);
  });

  it('triages a task through the local API contract', async () => {
    const plan = await createProjectPlan('workspace-e2e', 'owner-e2e', 'Triage project', 'Prioritize the next action.');
    const response = await handleLocalApi({ method: 'PATCH', path: `/v1/tasks/${plan.tasks[0].id}`, workspaceId: 'workspace-e2e', actorId: 'owner-e2e', body: { status: 'in_progress' } });
    expect(response.status).toBe(200);
    expect((response.data as { status: string }).status).toBe('in_progress');
    expect((await triageTask(plan.tasks[1].id, 'blocked', 'owner-e2e', 'workspace-e2e'))?.status).toBe('blocked');
  });
});

describe('Nova worker queue', () => {
  it('processes supported jobs and clears them from the queue', async () => {
    const job = await enqueueWorkerJob({ toolId: 'workspace-health', input: { workspaceId: 'workspace-e2e' }, priority: 10 });
    const result = await processWorkerQueue('workspace-e2e');
    expect(result.completed).toContain(job.id);
    expect(await loadWorkerQueue()).toHaveLength(0);
    expect(result.deadLettered).toHaveLength(0);
  });

  it('moves unknown jobs to dead letters after the configured retry limit', async () => {
    const job = await enqueueWorkerJob({ toolId: 'unknown-tool', input: {}, maxAttempts: 1 });
    const result = await processWorkerQueue('workspace-e2e');
    expect(result.deadLettered).toContain(job.id);
    const dead = await loadDeadLetters();
    expect(dead.some((item) => item.id === job.id && item.status === 'failed')).toBe(true);
  });
});

describe('Nova realtime hub', () => {
  it('broadcasts project/task changes to a workspace and acknowledges the sender', () => {
    const hub = new RealtimeHub();
    const first: string[] = [];
    const second: string[] = [];
    hub.connect({ id: 'peer-1', workspaceId: 'workspace-e2e', revision: 0, socket: { send: (payload) => first.push(payload) } });
    hub.connect({ id: 'peer-2', workspaceId: 'workspace-e2e', revision: 0, socket: { send: (payload) => second.push(payload) } });
    const message = { type: 'change' as const, workspaceId: 'workspace-e2e', clientId: 'peer-1', revision: 1, entityType: 'task' as const, operation: 'upsert' as const, entity: { id: 'task-1', projectId: 'project-1', title: 'Ship', description: '', status: 'todo' as const, priority: 'high' as const, labels: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, entityId: 'task-1', sentAt: new Date().toISOString(), messageId: 'message-1' };
    hub.receive(message, 'peer-1');
    expect(JSON.parse(first[0]).type).toBe('ack');
    expect(JSON.parse(second[0]).type).toBe('change');
    expect(hub.getWorkspaceRevision('workspace-e2e')).toBe(1);
    hub.receive(message, 'peer-1');
    expect(first).toHaveLength(1);
  });
});


describe('Nova realtime client fallback', () => {
  it('queues a task change while offline for later reconnect delivery', async () => {
    const { RealtimeSyncClient, loadPendingRealtimeMessages } = await import('../../src/backend/realtime');
    const client = new RealtimeSyncClient();
    await client.start();
    const accepted = await client.publishChange('task', 'upsert', { id: 'task-offline', projectId: 'project-1', title: 'Offline task', description: '', status: 'todo', priority: 'medium', labels: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    expect(accepted).toBe(false);
    expect((await loadPendingRealtimeMessages()).some((message) => message.entityId === 'task-offline')).toBe(true);
    client.stop();
  });
});


describe('Nova multi-region replication and failover', () => {
  it('replicates ordered worker mutations and reports standby lag', async () => {
    const { appendReplicationEntry, loadReplicationState, replicatePending } = await import('../../src/backend/regions');
    await appendReplicationEntry('us-east-1', { id: 'mutation-1', kind: 'job', payload: { toolId: 'workspace-health' }, attempts: 0, nextAttemptAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    await appendReplicationEntry('us-east-1', { id: 'mutation-2', kind: 'job', payload: { toolId: 'analytics-rollup' }, attempts: 0, nextAttemptAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    const result = await replicatePending('eu-west-1');
    expect(result.applied).toHaveLength(2);
    const state = await loadReplicationState();
    expect(state.regions.find((region) => region.id === 'eu-west-1')?.lastAppliedSequence).toBe(2);
  });
  it('enforces a single leader lease and promotes the best healthy region', async () => {
    const { acquireLeaderLease, executeFailover, heartbeatRegion, planFailover } = await import('../../src/backend/regions');
    await acquireLeaderLease('workspace-e2e', 'us-east-1', 30_000);
    await expect(acquireLeaderLease('workspace-e2e', 'eu-west-1', 30_000)).rejects.toThrow('Leader lease');
    await heartbeatRegion('us-east-1', 0, false);
    const plan = await planFailover('workspace-e2e', 'primary heartbeat lost');
    expect(plan.toRegion).toBe('eu-west-1');
    const promoted = await executeFailover(plan);
    expect(promoted.state.primaryRegion).toBe('eu-west-1');
    expect(promoted.state.failoverCount).toBe(1);
  });
});
