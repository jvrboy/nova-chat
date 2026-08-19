import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashSessionToken } from "./db";

describe("persistent realtime sessions", () => {
  it("stores a deterministic one-way token hash", () => {
    const first = hashSessionToken("session-token");
    expect(first).toHaveLength(64);
    expect(first).toBe(hashSessionToken("session-token"));
    expect(first).not.toContain("session-token");
  });

  it("has an additive migration for session and connection records", () => {
    const sql = readFileSync(new URL("../drizzle/0003_cuddly_archangel.sql", import.meta.url), "utf8");
    expect(sql).toContain("CREATE TABLE `userSessions`");
    expect(sql).toContain("CREATE TABLE `realtimeConnections`");
    expect(sql).toContain("user_sessions_active_idx");
    expect(sql).not.toContain("CREATE TABLE `memoryEmbeddings`");
  });
});
