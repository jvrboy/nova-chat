import type { InvokeParams, InvokeResult, Message } from "./llm";

type ProviderId = "gemini" | "groq" | "ollama-cloud" | "openrouter";
type ConnectionId = "kaggle" | "firecrawl" | "e2b";

type ProviderConfig = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  keys: string[];
};

type ProviderTelemetry = {
  requests: number;
  successes: number;
  failures: number;
  tokensUsed: number;
  lastUsedAt: number | null;
  lastError: string | null;
};

const providerTelemetry = new Map<ProviderId, ProviderTelemetry>();
const telemetryFor = (id: ProviderId): ProviderTelemetry => {
  const current = providerTelemetry.get(id) ?? { requests: 0, successes: 0, failures: 0, tokensUsed: 0, lastUsedAt: null, lastError: null };
  providerTelemetry.set(id, current);
  return current;
};

type ConnectionStatus = {
  id: ConnectionId;
  label: string;
  configured: boolean;
  keyCount: number;
};

const splitKeys = (value: string | undefined) =>
  (value ?? "")
    .split(/[\n,;]+/)
    .map(key => key.trim())
    .filter(Boolean);

const indexedKeys = (prefix: string) => {
  const keys: string[] = [];
  for (let index = 1; index <= 50; index += 1) {
    const key = process.env[`${prefix}_${index}`];
    if (key?.trim()) keys.push(key.trim());
  }
  return keys;
};

const getKeys = (prefix: string) => [
  ...splitKeys(process.env[`${prefix}_API_KEYS`]),
  ...splitKeys(process.env[`${prefix}_KEYS`]),
  ...splitKeys(process.env[`${prefix}_API_KEY`]),
  ...indexedKeys(prefix),
].filter((key, index, all) => all.indexOf(key) === index);

const configuredOrder = () =>
  (process.env.NOVA_PROVIDER_ORDER ?? "gemini,groq,ollama-cloud,openrouter")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter((item): item is ProviderId =>
      ["gemini", "groq", "ollama-cloud", "openrouter"].includes(item)
    );

const providerConfigs = (): ProviderConfig[] => {
  const all: Record<ProviderId, ProviderConfig> = {
    gemini: {
      id: "gemini",
      label: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      defaultModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      keys: getKeys("GEMINI"),
    },
    groq: {
      id: "groq",
      label: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      keys: getKeys("GROQ"),
    },
    "ollama-cloud": {
      id: "ollama-cloud",
      label: "Ollama Cloud",
      baseUrl: process.env.OLLAMA_CLOUD_BASE_URL ?? "https://ollama.com/v1",
      defaultModel: process.env.OLLAMA_CLOUD_MODEL ?? "llama3.2",
      keys: getKeys("OLLAMA_CLOUD"),
    },
    openrouter: {
      id: "openrouter",
      label: "OpenRouter",
      baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      defaultModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
      keys: getKeys("OPENROUTER"),
    },
  };
  const order = configuredOrder();
  return [...order, ...Object.keys(all).filter(id => !order.includes(id as ProviderId))].map(id => all[id as ProviderId]);
};

const keyCursor = new Map<string, number>();
const failedUntil = new Map<string, number>();
const RETRYABLE_STATUS = new Set([401, 403, 408, 409, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const nextKey = (provider: { id: string; keys: string[] }) => {
  if (provider.keys.length === 0) return undefined;
  const start = keyCursor.get(provider.id) ?? 0;
  for (let offset = 0; offset < provider.keys.length; offset += 1) {
    const index = (start + offset) % provider.keys.length;
    const key = provider.keys[index];
    if ((failedUntil.get(`${provider.id}:${key}`) ?? 0) <= Date.now()) {
      keyCursor.set(provider.id, (index + 1) % provider.keys.length);
      return key;
    }
  }
  return undefined;
};

const markKeyFailed = (provider: { id: string }, key: string) => {
  failedUntil.set(`${provider.id}:${key}`, Date.now() + 30_000);
};

const availableKeyCount = (provider: ProviderConfig) => provider.keys.filter((key) => (failedUntil.get(`${provider.id}:${key}`) ?? 0) <= Date.now()).length;

const textFromContent = (content: unknown) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => typeof part === "string" ? part : (part as { text?: string }).text ?? "").join("\n");
  return "";
};

const normalizeMessages = (messages: Message[]) => messages.map(message => ({
  role: message.role === "function" ? "tool" : message.role,
  content: textFromContent(message.content),
}));

async function invokeOpenAICompatible(provider: ProviderConfig, key: string, params: InvokeParams): Promise<InvokeResult> {
  const payload: Record<string, unknown> = {
    model: params.model ?? provider.defaultModel,
    messages: normalizeMessages(params.messages),
  };
  if (params.tools?.length) payload.tools = params.tools;
  if (params.toolChoice ?? params.tool_choice) payload.tool_choice = params.toolChoice ?? params.tool_choice;
  if (params.maxTokens ?? params.max_tokens) payload.max_tokens = params.maxTokens ?? params.max_tokens;
  if (params.responseFormat ?? params.response_format) payload.response_format = params.responseFormat ?? params.response_format;
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw Object.assign(new Error(`${provider.label} returned ${response.status}: ${await response.text()}`), { status: response.status });
  return (await response.json()) as InvokeResult;
}

async function invokeGemini(provider: ProviderConfig, key: string, params: InvokeParams): Promise<InvokeResult> {
  const contents = normalizeMessages(params.messages).filter(message => message.role !== "system");
  const system = normalizeMessages(params.messages).find(message => message.role === "system")?.content;
  const response = await fetch(`${provider.baseUrl}/models/${params.model ?? provider.defaultModel}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: contents.map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
      generationConfig: params.maxTokens || params.max_tokens ? { maxOutputTokens: params.maxTokens ?? params.max_tokens } : undefined,
    }),
  });
  if (!response.ok) throw Object.assign(new Error(`Gemini returned ${response.status}: ${await response.text()}`), { status: response.status });
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const content = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("\n") ?? "";
  return { id: crypto.randomUUID(), created: Math.floor(Date.now() / 1000), model: params.model ?? provider.defaultModel, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] };
}

export async function invokeWithProviderFailover(params: InvokeParams & { provider?: ProviderId }) {
  const providers = providerConfigs().filter(provider => !params.provider || provider.id === params.provider);
  const errors: string[] = [];
  for (const provider of providers) {
    if (provider.keys.length === 0) continue;
    for (let attempt = 0; attempt < provider.keys.length; attempt += 1) {
      const key = nextKey(provider);
      if (!key) break;
      try {
        const telemetry = telemetryFor(provider.id);
        telemetry.requests += 1;
        const result = provider.id === "gemini" ? await invokeGemini(provider, key, params) : await invokeOpenAICompatible(provider, key, params);
        telemetry.successes += 1;
        telemetry.lastUsedAt = Date.now();
        const usage = (result as InvokeResult & { usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } }).usage;
        telemetry.tokensUsed += usage?.total_tokens ?? ((usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0));
        telemetry.lastError = null;
        return { ...result, provider: provider.id, providerLabel: provider.label };
      } catch (error) {
        const status = (error as { status?: number }).status;
        const telemetry = telemetryFor(provider.id);
        telemetry.requests += 1;
        telemetry.failures += 1;
        telemetry.lastUsedAt = Date.now();
        telemetry.lastError = error instanceof Error ? error.message.slice(0, 240) : "request failed";
        errors.push(`${provider.label}: ${error instanceof Error ? error.message : "request failed"}`);
        if (status === undefined || RETRYABLE_STATUS.has(status)) markKeyFailed(provider, key);
        if (status !== undefined && !RETRYABLE_STATUS.has(status)) break;
        await sleep(100 * Math.min(attempt + 1, 3));
      }
    }
  }
  throw new Error(`All configured AI providers failed. ${errors.join(" | ") || "Add provider API keys in the server environment."}`);
}

export function listProviderStatus() {
  return providerConfigs().map(provider => {
    const telemetry = telemetryFor(provider.id);
    return {
      id: provider.id,
      label: provider.label,
      configured: provider.keys.length > 0,
      keyCount: provider.keys.length,
      availableKeyCount: availableKeyCount(provider),
      defaultModel: provider.defaultModel,
      requests: telemetry.requests,
      successes: telemetry.successes,
      failures: telemetry.failures,
      tokensUsed: telemetry.tokensUsed,
      quotaRemaining: "Provider quota not exposed by API",
      lastUsedAt: telemetry.lastUsedAt ? new Date(telemetry.lastUsedAt).toISOString() : null,
      lastError: telemetry.lastError,
    };
  });
}

export function listConnectionStatus(): ConnectionStatus[] {
  return ([
    ["kaggle", "Kaggle", "KAGGLE"],
    ["firecrawl", "Firecrawl", "FIRECRAWL"],
    ["e2b", "E2B", "E2B"],
  ] as const).map(([id, label, prefix]) => {
    const keys = getKeys(prefix);
    return { id, label, configured: keys.length > 0, keyCount: keys.length };
  });
}

async function requestWithConnectionFailover<T>(id: ConnectionId, keys: string[], request: (key: string) => Promise<Response>, missingMessage: string): Promise<T> {
  if (keys.length === 0) throw new Error(missingMessage);
  const errors: string[] = [];
  const connection = { id, keys };
  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const key = nextKey(connection);
    if (!key) break;
    try {
      const response = await request(key);
      if (response.ok) return await response.json() as T;
      const body = await response.text();
      errors.push(`${id} returned ${response.status}: ${body}`);
      if (RETRYABLE_STATUS.has(response.status)) markKeyFailed(connection, key);
      else break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${id} request failed`);
      markKeyFailed(connection, key);
    }
  }
  throw new Error(`${id} integration failed after trying all configured keys. ${errors.join(" | ")}`);
}

export async function firecrawlScrape(url: string) {
  return requestWithConnectionFailover("firecrawl", getKeys("FIRECRAWL"), key => fetch("https://api.firecrawl.dev/v1/scrape", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ url, formats: ["markdown"] }) }), "FIRECRAWL_API_KEYS is not configured");
}

export async function e2bRunCode(code: string, language = "python") {
  return requestWithConnectionFailover("e2b", getKeys("E2B"), key => fetch("https://api.e2b.dev/code-interpreter/v1/sandboxes", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ code, language }) }), "E2B_API_KEYS is not configured");
}

export async function kaggleListDatasets(search: string) {
  return requestWithConnectionFailover("kaggle", getKeys("KAGGLE"), key => fetch(`https://www.kaggle.com/api/v1/datasets/list?search=${encodeURIComponent(search)}`, { headers: { authorization: `Bearer ${key}` } }), "KAGGLE_API_KEYS is not configured");
}

export type { ConnectionId, ProviderId };

