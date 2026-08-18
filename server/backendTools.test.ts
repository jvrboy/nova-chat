import { describe, expect, it } from "vitest";
import {
  analyzeDependencyRisk,
  buildAuditEvent,
  buildCachePolicy,
  chunkText,
  createIdempotencyKey,
  createRunbook,
  buildRetryPolicy,
  compareApiVersions,
  evaluateAccessPolicy,
  evaluateCircuitBreaker,
  evaluateFeatureFlag,
  evaluateServiceHealth,
  evaluateSlo,
  evaluateTokenBucket,
  forecastUsageCost,
  generateFeatureCatalog,
  planCapacity,
  planMaintenanceWindow,
  planPagination,
  planWorkflowExecution,
  redactSensitiveText,
  scanSecrets,
  scoreDataQuality,
  summarizeEventStream,
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

  it("builds retry, access, pagination, API compatibility, and maintenance plans", () => {
    expect(
      buildRetryPolicy({ maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 })
        .schedule
    ).toHaveLength(3);
    expect(
      evaluateAccessPolicy({
        subject: { id: "user-1", roles: ["editor"] },
        action: "update",
        resource: { id: "doc-1", requiredRoles: ["editor"] },
      }).allowed
    ).toBe(true);
    expect(
      planPagination({ totalItems: 101, page: 2, pageSize: 25 }).offset
    ).toBe(25);
    expect(
      compareApiVersions({
        previous: [
          { method: "GET", path: "/items", responseFields: ["id", "name"] },
        ],
        next: [{ method: "GET", path: "/items", responseFields: ["id"] }],
      }).breaking
    ).toBe(true);
    expect(
      planMaintenanceWindow({
        durationMinutes: 60,
        impactedUsers: 1000,
        regions: ["us"],
      }).phases
    ).toHaveLength(4);
  });

  it("scans secrets, forecasts costs, scores dependencies, and summarizes streams", () => {
    expect(scanSecrets("password='super-secret-token'").safe).toBe(false);
    expect(
      forecastUsageCost({
        unitCost: 0.5,
        currentUnits: 10,
        growthRate: 0.1,
        months: 2,
      }).totalCost
    ).toBe(10.5);
    expect(
      analyzeDependencyRisk([
        {
          name: "critical-lib",
          version: "1.0.0",
          daysSinceUpdate: 400,
          criticalVulnerabilities: 1,
          direct: true,
        },
      ]).requiresAction
    ).toBe(true);
    expect(
      summarizeEventStream([
        {
          type: "deploy",
          timestamp: "2026-08-18T00:00:00.000Z",
          severity: "info",
        },
        {
          type: "error",
          timestamp: "2026-08-18T00:01:00.000Z",
          severity: "critical",
        },
      ]).bySeverity.critical
    ).toBe(1);
  });

  it("computes workflow critical paths across dependency chains", () => {
    const workflow = planWorkflowExecution([
      { id: "slow-independent", durationMs: 100 },
      { id: "extract", durationMs: 1 },
      { id: "transform", dependsOn: ["extract"], durationMs: 1 },
    ]);

    expect(workflow.criticalPathMs).toBe(100);
  });

  it("handles empty workflows", () => {
    expect(planWorkflowExecution([])).toEqual({
      order: [],
      waves: [],
      criticalPathMs: 0,
      parallelism: 0,
    });
  });
});
