import { describe, expect, it } from "vitest";
import {
  buildAuditEvent,
  buildCachePolicy,
  chunkText,
  createIdempotencyKey,
  createRunbook,
  evaluateCircuitBreaker,
  evaluateFeatureFlag,
  evaluateServiceHealth,
  evaluateSlo,
  evaluateTokenBucket,
  generateFeatureCatalog,
  planCapacity,
  planWorkflowExecution,
  redactSensitiveText,
  scoreDataQuality,
} from "./_core/backendTools";

describe("advanced backend tools", () => {
  it("generates deterministic large feature catalogs", () => {
    const catalog = generateFeatureCatalog(3, 7999);
    expect(catalog).toHaveLength(3);
    expect(catalog[0].id).toMatch(/^nova-/);
    expect(catalog[0].readinessChecklist).toContain("typed API contract");
  });

  it("redacts common sensitive values", () => {
    const result = redactSensitiveText(
      "Email ops@example.com or call 555-123-4567 with sk-abcdefghijklmnopqrstuvwxyz"
    );
    expect(result.redacted).toContain("[REDACTED_EMAIL]");
    expect(result.redacted).toContain("[REDACTED_PHONE]");
    expect(result.redacted).toContain("[REDACTED_API_KEY]");
    expect(result.findings.map(finding => finding.type)).toEqual([
      "email",
      "phone",
      "api_key",
    ]);
  });

  it("chunks text with hashes", () => {
    const text = "a".repeat(250);
    const result = chunkText(text, 100, 10);
    expect(result.count).toBe(3);
    expect(result.chunks[0].sha256).toHaveLength(64);
  });

  it("scores service health and generates runbooks", () => {
    expect(
      evaluateServiceHealth({ latencyMs: 20, errorRate: 0, saturation: 0.1 })
        .status
    ).toBe("excellent");
    expect(
      createRunbook({
        service: "api",
        symptom: "high latency",
        severity: "high",
      }).steps
    ).toHaveLength(5);
  });

  it("evaluates rate limits, circuit breakers, cache policies, and feature flags", () => {
    expect(
      evaluateTokenBucket({
        capacity: 10,
        refillPerSecond: 1,
        currentTokens: 0,
        elapsedMs: 5000,
        requestedTokens: 3,
      }).allowed
    ).toBe(true);
    expect(
      buildCachePolicy({ resource: "Projects", volatility: "daily" })
        .cacheControl
    ).toContain("max-age=21600");
    expect(
      evaluateCircuitBreaker({ successes: 1, failures: 9, minimumSamples: 10 })
        .state
    ).toBe("open");
    expect(
      evaluateFeatureFlag({
        flagKey: "beta",
        subjectId: "user-1",
        rolloutPercent: 100,
      }).enabled
    ).toBe(true);
  });

  it("plans workflows and capacity, computes idempotency, audits, SLOs, and data quality", () => {
    const workflow = planWorkflowExecution([
      { id: "extract", durationMs: 100 },
      { id: "transform", dependsOn: ["extract"], durationMs: 200 },
      { id: "notify", dependsOn: ["transform"], durationMs: 50 },
    ]);
    expect(workflow.order).toEqual(["extract", "transform", "notify"]);
    expect(
      createIdempotencyKey({ method: "post", path: "/jobs", body: { a: 1 } })
    ).toHaveLength(64);
    expect(
      scoreDataQuality([
        { id: 1, name: "A" },
        { id: 1, name: "" },
      ]).issues.length
    ).toBeGreaterThan(0);
    expect(
      buildAuditEvent({ actorId: "u1", action: "create", resource: "project" })
        .signature
    ).toHaveLength(64);
    expect(
      planCapacity({
        currentRps: 100,
        peakMultiplier: 2,
        targetCpuUtilization: 0.5,
        rpsPerInstance: 100,
      }).recommendedInstances
    ).toBe(4);
    expect(
      evaluateSlo({ target: 0.99, goodEvents: 990, totalEvents: 1000 }).status
    ).toBe("within_budget");
  });
});
