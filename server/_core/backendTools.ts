import { createHash, randomUUID } from "node:crypto";

export type Priority = "low" | "normal" | "high" | "critical";

export interface FeatureIdea {
  id: string;
  category: string;
  title: string;
  capability: string;
  priority: Priority;
  readinessChecklist: string[];
}

const categories = [
  "security",
  "observability",
  "automation",
  "data",
  "ai",
  "collaboration",
  "integration",
  "compliance",
  "performance",
  "reliability",
  "developer-experience",
  "workflow",
  "analytics",
  "governance",
  "storage",
  "messaging",
  "billing",
  "admin",
];

const capabilityTemplates = [
  "policy-aware orchestration",
  "adaptive workflow routing",
  "tenant-scoped auditability",
  "predictive anomaly detection",
  "self-healing operations",
  "privacy-preserving summarization",
  "event-driven automation",
  "semantic retrieval",
  "cost-aware optimization",
  "zero-trust access control",
  "data quality scoring",
  "real-time collaboration",
  "change-impact simulation",
  "release readiness validation",
  "resilience testing",
];

const readinessChecklist = [
  "typed API contract",
  "input validation",
  "tenant isolation",
  "audit events",
  "operational metrics",
  "error handling",
  "documentation",
  "automated tests",
];

export function generateFeatureCatalog(
  count: number,
  offset = 0
): FeatureIdea[] {
  if (!Number.isInteger(count) || count < 1 || count > 20_000) {
    throw new Error("count must be an integer from 1 to 20000");
  }

  return Array.from({ length: count }, (_, index) => {
    const n = offset + index + 1;
    const category = categories[n % categories.length];
    const capability = capabilityTemplates[n % capabilityTemplates.length];
    const priority: Priority =
      n % 37 === 0
        ? "critical"
        : n % 11 === 0
          ? "high"
          : n % 3 === 0
            ? "low"
            : "normal";
    return {
      id: `nova-${category}-${String(n).padStart(5, "0")}`,
      category,
      title: `${category.replace(/-/g, " ")} ${capability} capability ${n}`,
      capability: `Adds ${capability} for ${category} use cases with production controls and measurable rollout criteria.`,
      priority,
      readinessChecklist: readinessChecklist.slice(
        0,
        4 + (n % (readinessChecklist.length - 3))
      ),
    };
  });
}

export interface RedactionResult {
  redacted: string;
  findings: Array<{ type: string; count: number }>;
}

const redactPatterns: Array<[string, RegExp]> = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["phone", /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g],
  ["api_key", /\b(?:sk|pk|rk|api)[-_]?[A-Za-z0-9]{20,}\b/g],
  ["credit_card", /\b(?:\d[ -]*?){13,19}\b/g],
];

export function redactSensitiveText(text: string): RedactionResult {
  let redacted = text;
  const findings: Array<{ type: string; count: number }> = [];
  for (const [type, pattern] of redactPatterns) {
    let count = 0;
    redacted = redacted.replace(pattern, () => {
      count += 1;
      return `[REDACTED_${type.toUpperCase()}]`;
    });
    if (count > 0) findings.push({ type, count });
  }
  return { redacted, findings };
}

export function chunkText(text: string, maxChars = 1200, overlap = 120) {
  if (maxChars < 100 || maxChars > 8000)
    throw new Error("maxChars must be between 100 and 8000");
  if (overlap < 0 || overlap >= maxChars)
    throw new Error("overlap must be non-negative and smaller than maxChars");
  const chunks: Array<{
    id: string;
    index: number;
    text: string;
    sha256: string;
  }> = [];
  let cursor = 0;
  while (cursor < text.length) {
    const end = Math.min(cursor + maxChars, text.length);
    const chunk = text.slice(cursor, end);
    chunks.push({
      id: randomUUID(),
      index: chunks.length,
      text: chunk,
      sha256: createHash("sha256").update(chunk).digest("hex"),
    });
    if (end === text.length) break;
    cursor = end - overlap;
  }
  return { chunks, count: chunks.length, totalChars: text.length };
}

export function evaluateServiceHealth(metrics: {
  latencyMs: number;
  errorRate: number;
  saturation: number;
  queueDepth?: number;
}) {
  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        metrics.latencyMs / 20 -
        metrics.errorRate * 400 -
        metrics.saturation * 30 -
        (metrics.queueDepth ?? 0) / 50
    )
  );
  const status =
    score >= 90
      ? "excellent"
      : score >= 75
        ? "healthy"
        : score >= 55
          ? "degraded"
          : "critical";
  const recommendations = [
    metrics.latencyMs > 1000
      ? "Add caching, query optimization, or asynchronous processing for high-latency paths."
      : null,
    metrics.errorRate > 0.02
      ? "Inspect recent deployments and upstream dependencies because error rate is above 2%."
      : null,
    metrics.saturation > 0.75
      ? "Scale workers or reduce concurrency because saturation is above 75%."
      : null,
    (metrics.queueDepth ?? 0) > 500
      ? "Drain or shard queues because backlog is above 500 items."
      : null,
  ].filter((item): item is string => Boolean(item));
  return { score: Math.round(score), status, recommendations };
}

export function createRunbook(input: {
  service: string;
  symptom: string;
  severity: Priority;
}) {
  return {
    id: `runbook-${createHash("sha1").update(`${input.service}:${input.symptom}`).digest("hex").slice(0, 10)}`,
    service: input.service,
    severity: input.severity,
    objective: `Restore ${input.service} when ${input.symptom} is observed.`,
    steps: [
      "Confirm customer impact and declare incident ownership.",
      "Inspect health, logs, traces, dependency status, and recent deploys.",
      "Apply the safest mitigation: rollback, feature flag disablement, queue pause, or capacity increase.",
      "Validate recovery with synthetic checks and user-visible metrics.",
      "Publish a post-incident review with root cause, timeline, and prevention tasks.",
    ],
  };
}
