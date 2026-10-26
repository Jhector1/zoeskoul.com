import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("handoff Redis isolation", () => {
  it("routes every handoff store operation through the dedicated client", () => {
    const source = readFileSync(resolve(root, "auth/buildHandoffStore.ts"), "utf8");
    expect(source).toContain('import { getBuildHandoffRedisReady } from "./buildHandoffRedis"');
    expect(source.match(/await getBuildHandoffRedisReady\(\)/g)?.length).toBe(5);
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
