import { describe, expect, it } from "vitest";
import { executeSandboxedCode, normalizeSandboxTimeout, SANDBOX_MAX_TIMEOUT_MS } from "./_core/performanceTools";

describe("production sandbox policy", () => {
  it("injects a controlled fetch capability without exposing host globals", async () => {
    const result = await executeSandboxedCode("return typeof fetch;", {
      timeoutMs: 1_000,
      allowNetwork: true,
      allowedHosts: ["example.com"],
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain("function");
  });

  it("rejects non-allowlisted and non-HTTPS hosts", async () => {
    const hostResult = await executeSandboxedCode("return fetch('https://not-allowed.example');", {
      timeoutMs: 1_000,
      allowNetwork: true,
      allowedHosts: ["example.com"],
    });
    expect(hostResult.success).toBe(false);
    expect(hostResult.error).toContain("not allowlisted");

    const protocolResult = await executeSandboxedCode("return fetch('http://example.com');", {
      timeoutMs: 1_000,
      allowNetwork: true,
      allowedHosts: ["example.com"],
    });
    expect(protocolResult.success).toBe(false);
    expect(protocolResult.error).toContain("requires HTTPS");
  });

  it("caps requested execution time at the production maximum", () => {
    expect(normalizeSandboxTimeout(3_600_000)).toBe(SANDBOX_MAX_TIMEOUT_MS);
    expect(normalizeSandboxTimeout(50)).toBe(100);
  });
});
