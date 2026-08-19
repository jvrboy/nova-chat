import { ENV } from "./env";

export type CloudflareJob = { id: string; type: string; payload: unknown; status: string; createdAt: string };

const workerRequest = async <T>(path: string, init: RequestInit = {}) => {
  if (!ENV.cloudflareWorkerUrl) throw new Error("CLOUDFLARE_WORKER_URL is not configured");
  if (!ENV.cloudflareWorkerToken) throw new Error("CLOUDFLARE_WORKER_TOKEN is not configured");
  const response = await fetch(new URL(path, ENV.cloudflareWorkerUrl), {
    ...init,
    headers: { authorization: `Bearer ${ENV.cloudflareWorkerToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Cloudflare Worker returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
};

export const cloudflareWorker = {
  health: () => fetch(new URL("/health", ENV.cloudflareWorkerUrl), { signal: AbortSignal.timeout(4_000) }).then((response) => ({ healthy: response.ok, status: response.status })),
  createJob: (type: string, payload: unknown) => workerRequest<CloudflareJob>("/jobs", { method: "POST", body: JSON.stringify({ type, payload }) }),
  getJob: (id: string) => workerRequest<CloudflareJob>(`/jobs/${encodeURIComponent(id)}`),
  deleteJob: (id: string) => workerRequest<{ ok: boolean }>(`/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
