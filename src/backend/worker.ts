import AsyncStorage from '@react-native-async-storage/async-storage';
import { appendAudit, loadBackendStore, queueNotification, recordUsage } from './repository';
import { BackendJob } from './contracts';

export type WorkerJob = BackendJob & { priority: number; attempts: number; maxAttempts: number; nextRunAt: string; input: Record<string, unknown> };
export type WorkerResult = { completed: string[]; retried: string[]; deadLettered: string[] };
const QUEUE_KEY = 'nova.backend.worker.queue.v1';
const DEAD_KEY = 'nova.backend.worker.dead-letter.v1';
const parse = <T,>(value: string | null, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const id = () => `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
export async function loadWorkerQueue() { return parse<WorkerJob[]>(await AsyncStorage.getItem(QUEUE_KEY), []); }
export async function loadDeadLetters() { return parse<WorkerJob[]>(await AsyncStorage.getItem(DEAD_KEY), []); }
export async function enqueueWorkerJob(input: Pick<WorkerJob, 'toolId' | 'input'> & Partial<Pick<WorkerJob, 'priority' | 'maxAttempts'>>) { const queue = await loadWorkerQueue(); const timestamp = now(); const job: WorkerJob = { id: id(), toolId: input.toolId, input: input.input, priority: input.priority ?? 5, attempts: 0, maxAttempts: input.maxAttempts ?? 3, status: 'queued', createdAt: timestamp, updatedAt: timestamp, nextRunAt: timestamp }; await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, job])); return job; }
async function saveQueue(queue: WorkerJob[]) { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
async function saveDeadLetters(queue: WorkerJob[]) { await AsyncStorage.setItem(DEAD_KEY, JSON.stringify(queue.slice(-100))); }
async function execute(job: WorkerJob) { if (job.toolId === 'analytics-rollup') return { metric: 'usage', value: Object.keys(job.input).length }; if (job.toolId === 'notification') { await queueNotification({ workspaceId: String(job.input.workspaceId ?? 'nova-local'), channel: 'local', title: String(job.input.title ?? 'Nova worker'), body: String(job.input.body ?? 'Worker job completed.'), route: typeof job.input.route === 'string' ? job.input.route : undefined }); return { sent: true }; } if (job.toolId === 'workspace-health') { const store = await loadBackendStore(); return { projects: store.projects.length, tasks: store.tasks.length, connectors: store.connectors.length }; } throw new Error(`Unknown worker tool: ${job.toolId}`); }
export async function processWorkerQueue(workspaceId: string, actorId = 'local-worker'): Promise<WorkerResult> { const queue = (await loadWorkerQueue()).filter((job) => new Date(job.nextRunAt).getTime() <= Date.now()).sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt)); const pending = (await loadWorkerQueue()).filter((job) => new Date(job.nextRunAt).getTime() > Date.now()); const completed: string[] = []; const retried: string[] = []; const deadLettered: string[] = []; const dead = await loadDeadLetters(); for (const job of queue) { try { await execute(job); completed.push(job.id); await appendAudit({ workspaceId, actorId, action: 'worker.completed', resource: 'job', resourceId: job.id, risk: 'low', metadata: { toolId: job.toolId, attempts: job.attempts } }); } catch (error) { const attempts = job.attempts + 1; if (attempts >= job.maxAttempts) { deadLettered.push(job.id); dead.push({ ...job, status: 'failed', attempts, updatedAt: now(), error: error instanceof Error ? error.message : 'worker failure' }); } else { retried.push(job.id); pending.push({ ...job, status: 'queued', attempts, updatedAt: now(), nextRunAt: new Date(Date.now() + Math.min(30 * 60_000, 2 ** attempts * 5000)).toISOString(), error: error instanceof Error ? error.message : 'worker retry' }); } } } await saveQueue(pending); await saveDeadLetters(dead); await recordUsage({ workspaceId, day: new Date().toISOString().slice(0, 10), runs: completed.length, toolCalls: queue.length, filesIndexed: 0, syncs: 0, errors: deadLettered.length, latencyMs: 0 }); return { completed, retried, deadLettered }; }


import { acquireLeaderLease, appendReplicationEntry, executeFailover, heartbeatRegion, loadReplicationState, planFailover, replicatePending } from './regions';
import { endSpan, recordMetric, startSpan } from './observability';
export type RegionalWorkerResult = WorkerResult & { regionId: string; role: 'leader' | 'standby'; failedOver: boolean; replicationApplied: number; leaseEpoch?: number };
export async function processWorkerQueueRegional(workspaceId: string, regionId: string, options: { autoFailover?: boolean; leaseTtlMs?: number } = {}): Promise<RegionalWorkerResult> {
  const state = await loadReplicationState();
  const region = state.regions.find((item) => item.id === regionId);
  if (!region) throw new Error(`Unknown worker region: ${regionId}`);
  const rootSpan = await startSpan('worker.regional.process', { workspaceId }, undefined, regionId);
  const startedAt = Date.now();
  await heartbeatRegion(regionId, 0, true);
  const replicationStartedAt = Date.now();
  const replication = await replicatePending(regionId);
  await recordMetric({ name: 'replication.latency', value: Date.now() - replicationStartedAt, unit: 'ms', regionId, workspaceId, traceId: rootSpan.traceId });
  await recordMetric({ name: 'replication.lag', value: Math.max(0, state.lastSequence - (region.lastAppliedSequence + replication.applied.length)), unit: 'entries', regionId, workspaceId, traceId: rootSpan.traceId });
  let activeRegion = regionId;
  let failedOver = false;
  const isLeader = state.primaryRegion === regionId || region.status === 'promoted';
  if (!isLeader) { await endSpan(rootSpan, 'ok', { role: 'standby', replicationApplied: replication.applied.length }); return { completed: [], retried: [], deadLettered: [], regionId, role: 'standby', failedOver: false, replicationApplied: replication.applied.length }; }
  try {
    const lease = await acquireLeaderLease(workspaceId, activeRegion, options.leaseTtlMs ?? 30_000);
    const result = await processWorkerQueue(workspaceId, `worker-${activeRegion}`);
    for (const jobId of [...result.completed, ...result.retried, ...result.deadLettered]) await appendReplicationEntry(activeRegion, { id: jobId, kind: 'job', payload: { workspaceId, jobId, result }, attempts: 0, nextAttemptAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    await recordMetric({ name: 'worker.duration', value: Date.now() - startedAt, unit: 'ms', regionId: activeRegion, workspaceId, traceId: rootSpan.traceId });
    await recordMetric({ name: 'worker.completed', value: result.completed.length, unit: 'count', regionId: activeRegion, workspaceId, traceId: rootSpan.traceId });
    await recordMetric({ name: 'worker.failed', value: result.deadLettered.length, unit: 'count', regionId: activeRegion, workspaceId, traceId: rootSpan.traceId });
    await endSpan(rootSpan, 'ok', { role: 'leader', failedOver, completed: result.completed.length });
    return { ...result, regionId: activeRegion, role: 'leader', failedOver, replicationApplied: replication.applied.length, leaseEpoch: lease.epoch };
  } catch (error) {
    await heartbeatRegion(activeRegion, 0, false);
    if (!options.autoFailover) { await endSpan(rootSpan, 'error', { failoverRequested: false }); throw error; }
    await endSpan(rootSpan, 'error', { failoverRequested: true });
    const failoverStartedAt = Date.now();
    const plan = await planFailover(workspaceId, error instanceof Error ? error.message : 'leader-unavailable');
    const promoted = await executeFailover(plan);
    activeRegion = promoted.plan.toRegion;
    failedOver = true;
    const lease = await acquireLeaderLease(workspaceId, activeRegion, options.leaseTtlMs ?? 30_000);
    const result = await processWorkerQueue(workspaceId, `worker-${activeRegion}`);
    for (const jobId of [...result.completed, ...result.retried, ...result.deadLettered]) await appendReplicationEntry(activeRegion, { id: jobId, kind: 'job', payload: { workspaceId, jobId, result, failover: true }, attempts: 0, nextAttemptAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    await recordMetric({ name: 'failover.duration', value: Date.now() - failoverStartedAt, unit: 'ms', regionId: activeRegion, workspaceId, traceId: rootSpan.traceId });
    await recordMetric({ name: 'worker.duration', value: Date.now() - startedAt, unit: 'ms', regionId: activeRegion, workspaceId, traceId: rootSpan.traceId });
    await recordMetric({ name: 'worker.completed', value: result.completed.length, unit: 'count', regionId: activeRegion, workspaceId, traceId: rootSpan.traceId });
    await recordMetric({ name: 'worker.failed', value: result.deadLettered.length, unit: 'count', regionId: activeRegion, workspaceId, traceId: rootSpan.traceId });
    return { ...result, regionId: activeRegion, role: 'leader', failedOver, replicationApplied: replication.applied.length, leaseEpoch: lease.epoch };
  }
}
export async function getRegionalWorkerStatus() { const state = await loadReplicationState(); return { primaryRegion: state.primaryRegion, failoverCount: state.failoverCount, regions: state.regions.map((region) => ({ ...region, lag: Math.max(0, state.lastSequence - region.lastAppliedSequence) })), lastSequence: state.lastSequence }; }
