import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("handoff Redis isolation", () => {
  it("routes every handoff store operation through the dedicated client", () => {
    const source = readFileSync(resolve(root, "auth/buildHandoffStore.ts"), "utf8");
    expect(source).toContain('import { getBuildHandoffRedisReady } from "./buildHandoffRedis"');
    // Verify every exported handoff operation uses the dedicated client.
    // This includes session renewal; an exact total is fragile when operations grow.
    const expectedOperations = [
      "issueBuildHandoff",
      "exchangeBuildHandoff",
      "readBuildHandoffSession",
      "revokeBuildHandoffSession",
      "revokeUserBuildSessions",
      "renewBuildHandoffSession",
    ];
    const operations = [...source.matchAll(/export async function (\w+)\s*\(/g)];
    expect(operations.map((match) => match[1])).toEqual(
      expect.arrayContaining(expectedOperations),
    );
    for (const [index, operation] of operations.entries()) {
      const body = source.slice(operation.index, operations[index + 1]?.index ?? source.length);
      expect(body, `operation ${operation[1]} must use dedicated handoff Redis`).toContain(
        "const redis = await getBuildHandoffRedisReady();",
      );
      expect(body).not.toMatch(/\bgetServerRedis(?:Ready)?\b/);
    }
    expect(source).not.toMatch(/from ["']ioredis["']/);
    expect(source).not.toContain("process.env.PTY_REDIS_URL");
    expect(source).not.toContain("process.env.REDIS_URL");
    expect(source).not.toContain("getServerRedisReady");
  });
  it("requires dedicated env without PTY or generic Redis fallback", () => {
    const source = readFileSync(resolve(root, "auth/buildHandoffRedis.ts"), "utf8");
    expect(source).toContain('"ZOESKOUL_BUILD_HANDOFF_REDIS_URL"');
    expect(source).not.toContain("process.env.PTY_REDIS_URL");
    expect(source).not.toContain("process.env.REDIS_URL");
    expect(source).toContain("enableOfflineQueue: false");
  });
});
