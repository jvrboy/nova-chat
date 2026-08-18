/**
 * Performance, Caching, and Metrics Tools for Nova Chat
 * Inspired by microkernel-system architecture
 */

// --- LRU Cache ---

export type LRUCacheEntry<T> = { key: string; value: T; expires: number | null; accessTime: number };

export class LRUCache<T> {
  private cache = new Map<string, LRUCacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize: number = 1000) { this.maxSize = maxSize; }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expires !== null && Date.now() > entry.expires) { this.cache.delete(key); return undefined; }
    entry.accessTime = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value!;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { key, value, expires: ttlMs ? Date.now() + ttlMs : null, accessTime: Date.now() });
  }

  has(key: string): boolean { return this.get(key) !== undefined; }
  delete(key: string): boolean { return this.cache.delete(key); }
  clear(): void { this.cache.clear(); }
  get size(): number { return this.cache.size; }
  entries(): Array<{ key: string; value: T }> { return Array.from(this.cache.values(), e => ({ key: e.key, value: e.value })); }
}

// --- Metrics Collector ---

export type MetricCounter = { name: string; value: number; type: 'counter' | 'gauge' | 'histogram' };
export type MetricSnapshot = { timestamp: number; counters: Record<string, number> };

export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private timings = new Map<string, number[]>();

  increment(name: string, value: number = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + value); }
  decrement(name: string, value: number = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) - value); }
  gauge(name: string, value: number): void { this.gauges.set(name, value); }
  histogram(name: string, value: number): void {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name)!.push(value);
  }
  timing(name: string, durationMs: number): void {
    if (!this.timings.has(name)) this.timings.set(name, []);
    this.timings.get(name)!.push(durationMs);
  }

  async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try { const result = await fn(); this.timing(name, Date.now() - start); return result; }
    catch (e) { this.timing(name, Date.now() - start); throw e; }
  }

  getCounter(name: string): number { return this.counters.get(name) ?? 0; }
  getGauge(name: string): number { return this.gauges.get(name) ?? 0; }

  getStats(name: string): { count: number; min: number; max: number; avg: number; p50: number; p95: number; p99: number } | null {
    const data = this.timings.get(name) ?? this.histograms.get(name);
    if (!data || data.length === 0) return null;
    const sorted = [...data].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      count: sorted.length, min: sorted[0], max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  snapshot(): MetricSnapshot { return { timestamp: Date.now(), counters: Object.fromEntries(this.counters) }; }

  getAllStats(): Record<string, ReturnType<typeof this.getStats>> {
    const result: Record<string, ReturnType<typeof this.getStats>> = {};
    for (const name of [...Array.from(this.timings.keys()), ...Array.from(this.histograms.keys())]) result[name] = this.getStats(name);
    return result;
  }

  reset(): void { this.counters.clear(); this.gauges.clear(); this.histograms.clear(); this.timings.clear(); }
}

// --- Event Bus ---

type EventCallback = (data: unknown) => void | Promise<void>;

export class EventBus {
  private subscribers = new Map<string, Set<EventCallback>>();
  private globalSubscribers = new Set<EventCallback>();

  on(event: string, callback: EventCallback): () => void {
    if (!this.subscribers.has(event)) this.subscribers.set(event, new Set());
    this.subscribers.get(event)!.add(callback);
    return () => this.subscribers.get(event)?.delete(callback);
  }

  onAny(callback: EventCallback): () => void {
    this.globalSubscribers.add(callback);
    return () => this.globalSubscribers.delete(callback);
  }

  async emit(event: string, data?: unknown): Promise<void> {
    const callbacks = this.subscribers.get(event);
    if (callbacks) for (const cb of Array.from(callbacks)) { try { await cb(data); } catch { /* subscriber error */ } }
    for (const cb of Array.from(this.globalSubscribers)) { try { await cb({ event, data }); } catch { /* subscriber error */ } }
  }

  off(event: string): void { this.subscribers.delete(event); }
  removeAllListeners(): void { this.subscribers.clear(); this.globalSubscribers.clear(); }
  listenerCount(event?: string): number {
    if (!event) return Array.from(this.subscribers.values()).reduce((s, set) => s + set.size, 0) + this.globalSubscribers.size;
    return (this.subscribers.get(event)?.size ?? 0) + this.globalSubscribers.size;
  }
}

// --- Code Sandbox ---

export type SandboxConfig = {
  timeoutMs: number;
  maxOutputLength: number;
  allowImports: boolean;
  allowedImports: string[];
};

export type SandboxResult = {
  success: boolean;
  output: string;
  error: string | null;
  executionTime: number;
  timeout: boolean;
};

const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  timeoutMs: 5000, maxOutputLength: 50000, allowImports: false, allowedImports: [],
};

export async function executeSandboxedCode(code: string, config: Partial<SandboxConfig> = {}): Promise<SandboxResult> {
  const cfg = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  const startTime = Date.now();
  let output = '';
  let error: string | null = null;
  let timedOut = false;

  // Security check: block dangerous patterns
  const blocked = [/require\s*\(/, /process\./, /child_process/, /fs\./, /net\./, /dgram\./, /eval\s*\(/, /Function\s*\(/];
  for (const pattern of blocked) {
    if (pattern.test(code)) {
      return { success: false, output: '', error: `Security violation: blocked pattern detected (${pattern.source})`, executionTime: 0, timeout: false };
    }
  }

  // Check imports
  const importMatches = code.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
  if (importMatches && !cfg.allowImports) {
    return { success: false, output: '', error: `Imports not allowed: ${importMatches.join(', ')}`, executionTime: 0, timeout: false };
  }
  if (importMatches && cfg.allowImports && cfg.allowedImports.length > 0) {
    for (const imp of importMatches) {
      const modMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (modMatch && !cfg.allowedImports.some(allowed => modMatch[1].startsWith(allowed))) {
        return { success: false, output: '', error: `Import not in allowlist: ${modMatch[1]}`, executionTime: 0, timeout: false };
      }
    }
  }

  // Create sandboxed console
  const logs: string[] = [];
  const sandboxConsole = {
    log: (...args: unknown[]) => { logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); },
    warn: (...args: unknown[]) => { logs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); },
    error: (...args: unknown[]) => { logs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); },
    info: (...args: unknown[]) => { logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); },
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('console', 'setTimeout', 'setInterval', `"use strict";\n${code}\n`);
    const timeoutPromise = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), cfg.timeoutMs));
    const result = await Promise.race([fn(sandboxConsole, () => {}, () => {}), timeoutPromise]);
    if (result === 'timeout') { timedOut = true; error = `Execution timed out after ${cfg.timeoutMs}ms`; }
    output = logs.join('\n').slice(0, cfg.maxOutputLength);
    if (result !== 'timeout' && result !== undefined) {
      const str = String(result);
      if (str && str !== 'undefined') output = (output ? output + '\n' : '') + str.slice(0, cfg.maxOutputLength - output.length);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return { success: !error && !timedOut, output, error, executionTime: Date.now() - startTime, timeout: timedOut };
}

// --- Multi-level Cache ---

export class MultiLevelCache<T> {
  private l1: LRUCache<T>;
  private l2: LRUCache<T>;
  private l1Hits = 0; private l2Hits = 0; private misses = 0;

  constructor(l1Size: number = 100, l2Size: number = 1000) {
    this.l1 = new LRUCache<T>(l1Size);
    this.l2 = new LRUCache<T>(l2Size);
  }

  async get(key: string): Promise<T | undefined> {
    const l1Result = this.l1.get(key);
    if (l1Result !== undefined) { this.l1Hits++; return l1Result; }
    const l2Result = this.l2.get(key);
    if (l2Result !== undefined) { this.l2Hits++; this.l1.set(key, l2Result); return l2Result; }
    this.misses++;
    return undefined;
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> { this.l1.set(key, value, ttlMs); this.l2.set(key, value, ttlMs); }

  async getOrCompute(key: string, compute: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = await this.get(key);
    if (cached !== undefined) return cached;
    const value = await compute();
    await this.set(key, value, ttlMs);
    return value;
  }

  getStats() { return { l1Hits: this.l1Hits, l2Hits: this.l2Hits, misses: this.misses, hitRate: this.l1Hits + this.l2Hits + this.misses > 0 ? (this.l1Hits + this.l2Hits) / (this.l1Hits + this.l2Hits + this.misses) : 0, l1Size: this.l1.size, l2Size: this.l2.size }; }
  clear(): void { this.l1.clear(); this.l2.clear(); this.l1Hits = 0; this.l2Hits = 0; this.misses = 0; }
}

// --- Global instances ---

export const globalMetrics = new MetricsCollector();
export const globalEventBus = new EventBus();
export const globalCache = new MultiLevelCache<any>(200, 2000);
export const llmResponseCache = new LRUCache<string>(500);
