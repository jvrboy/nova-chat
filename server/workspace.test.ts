import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("workspace router", () => {
  it("returns the current user through the upgraded router", async () => {
    const user = {
      id: 7,
      openId: "workspace-user",
      email: "workspace@example.com",
      name: "Workspace User",
      loginMethod: "test",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const caller = appRouter.createCaller(context(user));
    await expect(caller.auth.me()).resolves.toMatchObject({ id: 7, openId: "workspace-user" });
  });

  it("rejects project listing for signed-out callers", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
