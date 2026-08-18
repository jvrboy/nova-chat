import { describe, expect, it } from "vitest";
import {
  chunkText,
  createRunbook,
  evaluateServiceHealth,
  generateFeatureCatalog,
  redactSensitiveText,
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
});
