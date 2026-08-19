import { ENV } from "./env";

const present = (value: string | undefined) => Boolean(value?.trim());
const countKeys = (prefix: string) => {
  const values = [process.env[`${prefix}_API_KEYS`], process.env[`${prefix}_KEYS`], process.env[`${prefix}_API_KEY`]];
  for (let index = 1; index <= 50; index += 1) values.push(process.env[`${prefix}_${index}`]);
  return [...new Set(values.flatMap(value => (value ?? "").split(/[\n,;]+/).map(item => item.trim()).filter(Boolean)))].length;
};

export function runtimeConfigurationStatus() {
  const providers = [
    { id: "gemini", label: "Gemini", keyCount: countKeys("GEMINI"), model: ENV.geminiModel, baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
    { id: "groq", label: "Groq", keyCount: countKeys("GROQ"), model: ENV.groqModel, baseUrl: "https://api.groq.com/openai/v1" },
    { id: "ollama-cloud", label: "Ollama Cloud", keyCount: countKeys("OLLAMA_CLOUD"), model: ENV.ollamaCloudModel, baseUrl: ENV.ollamaCloudBaseUrl },
    { id: "openrouter", label: "OpenRouter", keyCount: countKeys("OPENROUTER"), model: ENV.openrouterModel, baseUrl: ENV.openrouterBaseUrl },
  ].map(item => ({ ...item, configured: item.keyCount > 0 }));
  const connections = [
    { id: "kaggle", label: "Kaggle", keyCount: countKeys("KAGGLE") },
    { id: "firecrawl", label: "Firecrawl", keyCount: countKeys("FIRECRAWL") },
    { id: "e2b", label: "E2B", keyCount: countKeys("E2B") },
  ].map(item => ({ ...item, configured: item.keyCount > 0 }));
  const checks = {
    authentication: present(ENV.cookieSecret) && present(ENV.passwordHash),
    aiRouting: providers.some(provider => provider.configured) || present(ENV.forgeApiKey),
    persistence: present(ENV.databaseUrl) || (present(ENV.supabaseUrl) && present(ENV.supabaseAnonKey)),
    optionalConnections: connections.some(connection => connection.configured),
  };
  return {
    environment: { production: ENV.isProduction, vercel: present(process.env.VERCEL), nodeVersion: process.version },
    providers,
    connections,
    data: {
      database: present(ENV.databaseUrl),
      supabase: present(ENV.supabaseUrl) && present(ENV.supabaseAnonKey),
      cloudflareWorker: present(ENV.cloudflareWorkerUrl) && present(ENV.cloudflareWorkerToken),
      massiveMarketData: present(ENV.massiveWsUrl) && present(ENV.massiveApiKey),
    },
    auth: { passwordOnly: present(ENV.passwordHash), sessionSecret: present(ENV.cookieSecret) },
    routing: { providerOrder: ENV.providerOrder },
    readiness: { overall: Object.values(checks).every(Boolean) ? "ready" : "degraded", checks },
  };
}

export function runtimeReadinessSnapshot() {
  const status = runtimeConfigurationStatus();
  return { ok: status.readiness.overall === "ready", service: "nova-chat", timestamp: new Date().toISOString(), environment: status.environment, readiness: status.readiness, providerCount: status.providers.filter(provider => provider.configured).length, connectionCount: status.connections.filter(connection => connection.configured).length };
}