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

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterMs: number;
}

export function evaluateTokenBucket(input: {
  capacity: number;
  refillPerSecond: number;
  currentTokens: number;
  requestedTokens?: number;
  elapsedMs: number;
  now?: Date;
}): RateLimitDecision & { nextTokens: number } {
  const requestedTokens = input.requestedTokens ?? 1;
  if (input.capacity < 1) throw new Error("capacity must be positive");
  if (input.refillPerSecond <= 0)
    throw new Error("refillPerSecond must be positive");
  if (requestedTokens < 1) throw new Error("requestedTokens must be positive");
  const now = input.now ?? new Date();
  const refilled = Math.min(
    input.capacity,
    Math.max(0, input.currentTokens) +
      (input.elapsedMs / 1000) * input.refillPerSecond
  );
  const allowed = refilled >= requestedTokens;
  const nextTokens = allowed ? refilled - requestedTokens : refilled;
  const missing = Math.max(0, requestedTokens - refilled);
  const retryAfterMs = allowed
    ? 0
    : Math.ceil((missing / input.refillPerSecond) * 1000);
  return {
    allowed,
    limit: input.capacity,
    remaining: Math.floor(nextTokens),
    resetAt: new Date(now.getTime() + retryAfterMs).toISOString(),
    retryAfterMs,
    nextTokens,
  };
}

export interface CachePolicy {
  ttlSeconds: number;
  staleWhileRevalidateSeconds: number;
  cacheControl: string;
  surrogateKey: string;
  vary: string[];
}

export function buildCachePolicy(input: {
  resource: string;
  volatility: "static" | "daily" | "hourly" | "realtime";
  userScoped?: boolean;
  tags?: string[];
}): CachePolicy {
  const ttlByVolatility = {
    static: 86_400,
    daily: 21_600,
    hourly: 900,
    realtime: 15,
  } as const;
  const ttlSeconds = input.userScoped
    ? Math.min(300, ttlByVolatility[input.volatility])
    : ttlByVolatility[input.volatility];
  const staleWhileRevalidateSeconds = Math.max(30, Math.round(ttlSeconds / 2));
  const visibility = input.userScoped ? "private" : "public";
  const tags = [input.resource, ...(input.tags ?? [])]
    .map(tag => tag.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))
    .filter(Boolean);
  return {
    ttlSeconds,
    staleWhileRevalidateSeconds,
    cacheControl: `${visibility}, max-age=${ttlSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`,
    surrogateKey: tags.join(" "),
    vary: input.userScoped ? ["authorization", "cookie"] : ["accept-encoding"],
  };
}

export interface CircuitBreakerDecision {
  state: "closed" | "open" | "half_open";
  allowRequest: boolean;
  failureRate: number;
  nextCheckAt?: string;
  reason: string;
}

export function evaluateCircuitBreaker(input: {
  successes: number;
  failures: number;
  minimumSamples?: number;
  failureThreshold?: number;
  openedAt?: string;
  cooldownMs?: number;
  now?: Date;
}): CircuitBreakerDecision {
  const minimumSamples = input.minimumSamples ?? 20;
  const failureThreshold = input.failureThreshold ?? 0.5;
  const cooldownMs = input.cooldownMs ?? 30_000;
  const total = input.successes + input.failures;
  const failureRate = total === 0 ? 0 : input.failures / total;
  const now = input.now ?? new Date();
  if (input.openedAt) {
    const openedAt = new Date(input.openedAt);
    const nextCheck = new Date(openedAt.getTime() + cooldownMs);
    if (now < nextCheck) {
      return {
        state: "open",
        allowRequest: false,
        failureRate,
        nextCheckAt: nextCheck.toISOString(),
        reason: "Circuit is cooling down after crossing the failure threshold.",
      };
    }
    return {
      state: "half_open",
      allowRequest: true,
      failureRate,
      reason: "Cooldown elapsed; allow a limited probe request.",
    };
  }
  if (total >= minimumSamples && failureRate >= failureThreshold) {
    return {
      state: "open",
      allowRequest: false,
      failureRate,
      nextCheckAt: new Date(now.getTime() + cooldownMs).toISOString(),
      reason: "Observed failure rate crossed the configured threshold.",
    };
  }
  return {
    state: "closed",
    allowRequest: true,
    failureRate,
    reason: "Failure rate is within policy.",
  };
}

export interface WorkflowStep {
  id: string;
  dependsOn?: string[];
  durationMs?: number;
  retryable?: boolean;
}

export function planWorkflowExecution(steps: WorkflowStep[]) {
  const byId = new Map(steps.map(step => [step.id, step]));
  if (byId.size !== steps.length)
    throw new Error("workflow step ids must be unique");
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const step of steps) {
    indegree.set(step.id, step.dependsOn?.length ?? 0);
    for (const dependency of step.dependsOn ?? []) {
      if (!byId.has(dependency))
        throw new Error(`unknown dependency: ${dependency}`);
      outgoing.set(dependency, [...(outgoing.get(dependency) ?? []), step.id]);
    }
  }
  const ready = Array.from(indegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  const order: string[] = [];
  const waves: string[][] = [];
  while (ready.length > 0) {
    const wave = ready.splice(0).sort();
    waves.push(wave);
    for (const id of wave) {
      order.push(id);
      for (const child of outgoing.get(id) ?? []) {
        indegree.set(child, (indegree.get(child) ?? 0) - 1);
        if (indegree.get(child) === 0) ready.push(child);
      }
    }
  }
  if (order.length !== steps.length)
    throw new Error("workflow contains a cycle");
  const criticalPathMs = waves.reduce((total, wave) => {
    const slowest = Math.max(...wave.map(id => byId.get(id)?.durationMs ?? 0));
    return total + slowest;
  }, 0);
  return {
    order,
    waves,
    criticalPathMs,
    parallelism: Math.max(...waves.map(wave => wave.length)),
  };
}

export function evaluateFeatureFlag(input: {
  flagKey: string;
  subjectId: string;
  rolloutPercent: number;
  enabled?: boolean;
  allowList?: string[];
  denyList?: string[];
}) {
  if (input.rolloutPercent < 0 || input.rolloutPercent > 100)
    throw new Error("rolloutPercent must be between 0 and 100");
  if (input.denyList?.includes(input.subjectId))
    return { enabled: false, bucket: 0, reason: "subject is deny-listed" };
  if (input.allowList?.includes(input.subjectId))
    return { enabled: true, bucket: 0, reason: "subject is allow-listed" };
  if (input.enabled === false)
    return { enabled: false, bucket: 0, reason: "flag is globally disabled" };
  const hash = createHash("sha256")
    .update(`${input.flagKey}:${input.subjectId}`)
    .digest("hex");
  const bucket = Number.parseInt(hash.slice(0, 8), 16) % 100;
  return {
    enabled: bucket < input.rolloutPercent,
    bucket,
    reason: "deterministic percentage rollout",
  };
}

export function createIdempotencyKey(input: {
  method: string;
  path: string;
  body: unknown;
  tenantId?: string;
}) {
  const payload = JSON.stringify({
    method: input.method.toUpperCase(),
    path: input.path,
    tenantId: input.tenantId ?? null,
    body: input.body,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function scoreDataQuality(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0)
    return { score: 100, rowCount: 0, columns: [], issues: [] as string[] };
  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const issues: string[] = [];
  let penalties = 0;
  for (const column of columns) {
    const values = rows.map(row => row[column]);
    const missing = values.filter(
      value => value === null || value === undefined || value === ""
    ).length;
    if (missing > 0) {
      const rate = missing / rows.length;
      penalties += rate * 20;
      issues.push(`${column} is missing in ${Math.round(rate * 100)}% of rows`);
    }
    const uniqueTypes = new Set(
      values
        .filter(value => value !== null && value !== undefined)
        .map(value => (Array.isArray(value) ? "array" : typeof value))
    );
    if (uniqueTypes.size > 1) {
      penalties += 10;
      issues.push(
        `${column} has mixed types: ${Array.from(uniqueTypes).join(", ")}`
      );
    }
  }
  const duplicateRows =
    rows.length - new Set(rows.map(row => JSON.stringify(row))).size;
  if (duplicateRows > 0) {
    penalties += (duplicateRows / rows.length) * 15;
    issues.push(`${duplicateRows} duplicate row(s) detected`);
  }
  return {
    score: Math.max(0, Math.round(100 - penalties)),
    rowCount: rows.length,
    columns,
    issues,
  };
}

export function buildAuditEvent(input: {
  actorId: string;
  action: string;
  resource: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const event = {
    id: randomUUID(),
    actorId: input.actorId,
    action: input.action,
    resource: input.resource,
    metadata: input.metadata ?? {},
    occurredAt: occurredAt.toISOString(),
  };
  return {
    ...event,
    signature: createHash("sha256").update(JSON.stringify(event)).digest("hex"),
  };
}

export function planCapacity(input: {
  currentRps: number;
  peakMultiplier: number;
  targetCpuUtilization: number;
  rpsPerInstance: number;
  minimumInstances?: number;
}) {
  if (input.targetCpuUtilization <= 0 || input.targetCpuUtilization > 1)
    throw new Error("targetCpuUtilization must be > 0 and <= 1");
  const requiredRps = input.currentRps * input.peakMultiplier;
  const effectiveRpsPerInstance =
    input.rpsPerInstance * input.targetCpuUtilization;
  const instances = Math.max(
    input.minimumInstances ?? 1,
    Math.ceil(requiredRps / effectiveRpsPerInstance)
  );
  return {
    requiredRps,
    effectiveRpsPerInstance,
    recommendedInstances: instances,
    headroomRps: instances * effectiveRpsPerInstance - requiredRps,
  };
}

export function evaluateSlo(input: {
  target: number;
  goodEvents: number;
  totalEvents: number;
  windowDays?: number;
}) {
  if (input.target <= 0 || input.target >= 1)
    throw new Error("target must be between 0 and 1");
  if (input.totalEvents < input.goodEvents)
    throw new Error("totalEvents cannot be smaller than goodEvents");
  const actual =
    input.totalEvents === 0 ? 1 : input.goodEvents / input.totalEvents;
  const errorBudget = 1 - input.target;
  const consumed =
    input.totalEvents === 0
      ? 0
      : (input.totalEvents - input.goodEvents) /
        (input.totalEvents * errorBudget);
  const status = actual >= input.target ? "within_budget" : "breached";
  return {
    target: input.target,
    actual,
    status,
    errorBudgetConsumedPercent: Math.round(consumed * 100),
    windowDays: input.windowDays ?? 30,
  };
}

export function buildRetryPolicy(input: {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio?: number;
}) {
  if (input.maxAttempts < 1) throw new Error("maxAttempts must be positive");
  if (input.baseDelayMs < 1 || input.maxDelayMs < input.baseDelayMs) {
    throw new Error("delay bounds are invalid");
  }
  const jitterRatio = input.jitterRatio ?? 0.2;
  const schedule = Array.from({ length: input.maxAttempts }, (_, index) => {
    const delayMs = Math.min(input.maxDelayMs, input.baseDelayMs * 2 ** index);
    return {
      attempt: index + 1,
      delayMs: index === 0 ? 0 : delayMs,
      minDelayMs:
        index === 0 ? 0 : Math.max(0, Math.round(delayMs * (1 - jitterRatio))),
      maxDelayMs: index === 0 ? 0 : Math.round(delayMs * (1 + jitterRatio)),
    };
  });
  return { maxAttempts: input.maxAttempts, schedule };
}

export function evaluateAccessPolicy(input: {
  subject: {
    id: string;
    roles: string[];
    attributes?: Record<string, string | number | boolean>;
  };
  action: string;
  resource: {
    id: string;
    ownerId?: string;
    requiredRoles?: string[];
    attributes?: Record<string, string | number | boolean>;
  };
}) {
  const reasons: string[] = [];
  if (input.resource.ownerId && input.resource.ownerId === input.subject.id)
    reasons.push("subject owns resource");
  const matchingRoles = (input.resource.requiredRoles ?? []).filter(role =>
    input.subject.roles.includes(role)
  );
  if (matchingRoles.length > 0)
    reasons.push(`subject has required role(s): ${matchingRoles.join(", ")}`);
  if (input.subject.roles.includes("admin")) reasons.push("subject is admin");
  const allowed = reasons.length > 0;
  return {
    allowed,
    effect: allowed ? "allow" : "deny",
    action: input.action,
    reasons: allowed
      ? reasons
      : ["no ownership, admin role, or required role matched"],
  };
}

export function scanSecrets(text: string) {
  const patterns: Array<[string, RegExp]> = [
    ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/g],
    ["jwt", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g],
    ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    [
      "generic_token",
      /\b(?:token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/gi,
    ],
  ];
  const findings = patterns.flatMap(([type, pattern]) => {
    const matches = Array.from(text.matchAll(pattern));
    return matches.map(match => ({
      type,
      index: match.index ?? 0,
      preview: `${match[0].slice(0, 6)}…${match[0].slice(-4)}`,
    }));
  });
  return { safe: findings.length === 0, findings, count: findings.length };
}

export function planPagination(input: {
  totalItems: number;
  page: number;
  pageSize: number;
  maxPageSize?: number;
}) {
  const maxPageSize = input.maxPageSize ?? 500;
  const pageSize = Math.min(Math.max(1, input.pageSize), maxPageSize);
  const totalPages = Math.max(1, Math.ceil(input.totalItems / pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    totalItems: input.totalItems,
    totalPages,
    offset,
    limit: pageSize,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

export function compareApiVersions(input: {
  previous: Array<{ path: string; method: string; responseFields: string[] }>;
  next: Array<{ path: string; method: string; responseFields: string[] }>;
}) {
  const key = (endpoint: { path: string; method: string }) =>
    `${endpoint.method.toUpperCase()} ${endpoint.path}`;
  const previous = new Map(
    input.previous.map(endpoint => [key(endpoint), endpoint])
  );
  const next = new Map(input.next.map(endpoint => [key(endpoint), endpoint]));
  const removedEndpoints = Array.from(previous.keys()).filter(
    endpointKey => !next.has(endpointKey)
  );
  const addedEndpoints = Array.from(next.keys()).filter(
    endpointKey => !previous.has(endpointKey)
  );
  const fieldChanges = Array.from(next.entries()).flatMap(
    ([endpointKey, endpoint]) => {
      const oldEndpoint = previous.get(endpointKey);
      if (!oldEndpoint) return [];
      const removedFields = oldEndpoint.responseFields.filter(
        field => !endpoint.responseFields.includes(field)
      );
      const addedFields = endpoint.responseFields.filter(
        field => !oldEndpoint.responseFields.includes(field)
      );
      return removedFields.length || addedFields.length
        ? [{ endpoint: endpointKey, removedFields, addedFields }]
        : [];
    }
  );
  return {
    breaking:
      removedEndpoints.length > 0 ||
      fieldChanges.some(change => change.removedFields.length > 0),
    removedEndpoints,
    addedEndpoints,
    fieldChanges,
  };
}

export function forecastUsageCost(input: {
  unitCost: number;
  currentUnits: number;
  growthRate: number;
  months: number;
}) {
  if (input.months < 1 || input.months > 60)
    throw new Error("months must be between 1 and 60");
  const forecast = Array.from({ length: input.months }, (_, index) => {
    const month = index + 1;
    const units = input.currentUnits * (1 + input.growthRate) ** index;
    return {
      month,
      units: Math.round(units),
      cost: Number((units * input.unitCost).toFixed(2)),
    };
  });
  const totalCost = Number(
    forecast.reduce((sum, item) => sum + item.cost, 0).toFixed(2)
  );
  return {
    forecast,
    totalCost,
    averageMonthlyCost: Number((totalCost / input.months).toFixed(2)),
  };
}

export function analyzeDependencyRisk(
  dependencies: Array<{
    name: string;
    version: string;
    daysSinceUpdate: number;
    criticalVulnerabilities?: number;
    direct?: boolean;
  }>
) {
  const results = dependencies.map(dependency => {
    const vulnerabilityPenalty = (dependency.criticalVulnerabilities ?? 0) * 35;
    const freshnessPenalty =
      dependency.daysSinceUpdate > 365
        ? 25
        : dependency.daysSinceUpdate > 180
          ? 15
          : dependency.daysSinceUpdate > 90
            ? 5
            : 0;
    const transitivePenalty = dependency.direct === false ? 5 : 0;
    const riskScore = Math.min(
      100,
      vulnerabilityPenalty + freshnessPenalty + transitivePenalty
    );
    const risk =
      riskScore >= 70
        ? "critical"
        : riskScore >= 35
          ? "high"
          : riskScore >= 15
            ? "medium"
            : "low";
    return { ...dependency, riskScore, risk };
  });
  return {
    dependencies: results,
    highestRisk: results.reduce(
      (max, item) => Math.max(max, item.riskScore),
      0
    ),
    requiresAction: results.some(item => item.riskScore >= 35),
  };
}

export function planMaintenanceWindow(input: {
  durationMinutes: number;
  impactedUsers: number;
  regions: string[];
  canaryPercent?: number;
}) {
  const canaryPercent = input.canaryPercent ?? 5;
  const canaryUsers = Math.ceil(input.impactedUsers * (canaryPercent / 100));
  return {
    durationMinutes: input.durationMinutes,
    regions: input.regions,
    phases: [
      {
        name: "preflight",
        durationMinutes: Math.max(5, Math.round(input.durationMinutes * 0.15)),
        users: 0,
      },
      {
        name: "canary",
        durationMinutes: Math.max(5, Math.round(input.durationMinutes * 0.25)),
        users: canaryUsers,
      },
      {
        name: "regional_rollout",
        durationMinutes: Math.max(5, Math.round(input.durationMinutes * 0.45)),
        users: input.impactedUsers - canaryUsers,
      },
      {
        name: "validation",
        durationMinutes: Math.max(5, Math.round(input.durationMinutes * 0.15)),
        users: input.impactedUsers,
      },
    ],
    rollbackTrigger:
      "Rollback if error rate doubles, p95 latency increases by 50%, or canary health checks fail twice.",
  };
}

export function summarizeEventStream(
  events: Array<{
    type: string;
    timestamp: string;
    severity?: "info" | "warning" | "error" | "critical";
  }>
) {
  const byType = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {});
  const bySeverity = events.reduce<Record<string, number>>((acc, event) => {
    const severity = event.severity ?? "info";
    acc[severity] = (acc[severity] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
  return {
    total: events.length,
    byType,
    bySeverity,
    firstEventAt: sorted[0]?.timestamp ?? null,
    lastEventAt: sorted.at(-1)?.timestamp ?? null,
  };
}
