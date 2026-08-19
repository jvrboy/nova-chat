import { describe, expect, it } from "vitest";
import { runtimeConfigurationStatus, runtimeReadinessSnapshot } from "./_core/runtimeConfig";

describe("runtime configuration status", () => {
  it("returns only safe metadata and stable readiness groups", () => {
    const status = runtimeConfigurationStatus();
    expect(status).toHaveProperty("providers");
    expect(status).toHaveProperty("connections");
    expect(status).toHaveProperty("data");
    expect(status).toHaveProperty("auth");
    expect(JSON.stringify(status)).not.toMatch(/sk-[A-Za-z0-9]{10,}|AIza[A-Za-z0-9_-]{10,}/);
    expect(status.providers.every(provider => typeof provider.keyCount === "number")).toBe(true);
  });
  it("returns a safe readiness snapshot for monitoring", () => {
    const snapshot = runtimeReadinessSnapshot();
    expect(snapshot.service).toBe("nova-chat");
    expect(typeof snapshot.ok).toBe("boolean");
    expect(snapshot.readiness).toHaveProperty("checks");
    expect(snapshot.timestamp).toMatch(/^20/);
  });
});
