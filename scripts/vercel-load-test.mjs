import { performance } from "node:perf_hooks";

const baseUrl = process.argv[2] ?? "https://nova-chat-khaki.vercel.app";
const concurrency = Math.min(Number(process.argv[3] ?? 20), 50);
const total = Math.min(Number(process.argv[4] ?? 200), 1000);
const targets = ["/", "/api/trpc/ai.providerStatus?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D", "/api/trpc/projects.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"];

const results = [];
let next = 0;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= total) return;
    const target = targets[index % targets.length];
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${target}`, { headers: { "user-agent": "NovaChat-load-test/1.0" } });
      const body = await response.text();
      results.push({ index, target, status: response.status, ms: performance.now() - started, bytes: body.length });
    } catch (error) {
      results.push({ index, target, status: 0, ms: performance.now() - started, bytes: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = performance.now() - started;
const latencies = results.map((item) => item.ms).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] ?? 0;
const statusCounts = Object.fromEntries([...new Set(results.map((item) => item.status))].sort((a, b) => a - b).map((status) => [status, results.filter((item) => item.status === status).length]));
const failures = results.filter((item) => item.status === 0 || item.status >= 500).length;
console.log(JSON.stringify({ baseUrl, total, concurrency, elapsedMs: Math.round(elapsed), requestsPerSecond: Number((results.length / (elapsed / 1000)).toFixed(2)), statusCounts, failures, failureRate: Number((failures / results.length).toFixed(4)), latencyMs: { min: Math.round(latencies[0] ?? 0), p50: Math.round(percentile(0.5)), p95: Math.round(percentile(0.95)), p99: Math.round(percentile(0.99)), max: Math.round(latencies.at(-1) ?? 0) }, bytes: results.reduce((sum, item) => sum + item.bytes, 0) }, null, 2));
