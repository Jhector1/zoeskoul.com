import { describe, expect, it } from "vitest";
import {
  bootstrapLockCacheKey, cachedBootstrapLock, rememberBootstrapLock, resolveBootstrapLockOnce,
} from "./dependencyLockBootstrapCache.js";
import { classifyDependencyBootstrapFailure } from "./executeDependencyLockBootstrap.js";

const input = { projectId: "project-a", image: "trusted-runtime:v1",
  command: ["pnpm", "install", "--lockfile-only", "--ignore-scripts"],
  files: [{ path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' }],
} as const;

describe("K20D2C1 safe bootstrap result memoization", () => {
  it("keys by project, exact source bytes, runtime image and trusted argv", () => {
    const key = bootstrapLockCacheKey(input);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(bootstrapLockCacheKey({ ...input, projectId: "project-b" })).not.toBe(key);
    expect(bootstrapLockCacheKey({ ...input, image: "trusted-runtime:v2" })).not.toBe(key);
    expect(bootstrapLockCacheKey({ ...input, command: ["pnpm", "other"] })).not.toBe(key);
    expect(bootstrapLockCacheKey({ ...input,
      files: [{ path: "package.json", content: '{"dependencies":{"react":"20.0.0"}}' }],
    })).not.toBe(key);
  });
  it("caches successful lockfile output within bounded TTL without changing identity", () => {
    const key = bootstrapLockCacheKey(input);
    expect(cachedBootstrapLock(key, 100)).toBeNull();
    rememberBootstrapLock(key, "lockfileVersion: '9.0'\n", 100);
    expect(cachedBootstrapLock(key, 101)).toContain("lockfileVersion");
    expect(cachedBootstrapLock(key, 100 + 60 * 60_000)).toBeNull();
  });
  it("does not cache blank or oversized output", () => {
    const key = bootstrapLockCacheKey({ ...input, projectId: "oversize" });
    rememberBootstrapLock(key, " ", 1);
    expect(cachedBootstrapLock(key, 2)).toBeNull();
    rememberBootstrapLock(key, "X".repeat(2 * 1024 * 1024 + 1), 1);
    expect(cachedBootstrapLock(key, 2)).toBeNull();
  });
  it("classifies error codes without exposing raw pnpm logs", () => {
    expect(classifyDependencyBootstrapFailure({timedOut: true, oomKilled: false,
      exitCode: null, output: ""})).toBe("timeout");
    expect(classifyDependencyBootstrapFailure({timedOut: false, oomKilled: false,
      exitCode: 1, output: "ERR_PNPM_META_FETCH_FAIL EAI_AGAIN private data"})).toBe("registry-network");
    expect(classifyDependencyBootstrapFailure({timedOut: false, oomKilled: true,
      exitCode: 137, output: ""})).toBe("out-of-memory");
    expect(classifyDependencyBootstrapFailure({timedOut: false, oomKilled: false,
      exitCode: 1, output: "ERR_PNPM_NO_MATCHING_VERSION"})).toBe("package-resolution");
  });
});


describe("K20D2C2 same-input in-flight bootstrap coalescing", () => {
  it("shares one in-flight resolution while returning the same exact lock bytes", async () => {
    const key = bootstrapLockCacheKey({ ...input, projectId: "concurrent-1" });
    let count = 0;
    let complete!: (value: string) => void;
    const pending = new Promise<string>(resolve => { complete = resolve; });
    const work = async () => { count++; return pending; };
    const first = resolveBootstrapLockOnce(key, work);
    const second = resolveBootstrapLockOnce(key, work);
    expect(count).toBe(1);
    complete("lockfileVersion: '9.0'\n");
    const results = await Promise.all([first, second]);
    expect(results.map(item => item.mode)).toEqual(["resolved", "joined"]);
    expect(results[0].lock).toBe(results[1].lock);
    const third = await resolveBootstrapLockOnce(key, work);
    expect(third.mode).toBe("hit");
    expect(count).toBe(1);
  });
  it("does not retain a rejected resolution or share it with another project", async () => {
    const a = bootstrapLockCacheKey({ ...input, projectId: "concurrent-fail-a" });
    const b = bootstrapLockCacheKey({ ...input, projectId: "concurrent-fail-b" });
    const fail = async () => { throw new Error("simulated unavailable registry"); };
    await expect(resolveBootstrapLockOnce(a, fail)).rejects.toThrow("unavailable registry");
    expect(cachedBootstrapLock(a)).toBeNull();
    await expect(resolveBootstrapLockOnce(a, async () => "lock-a")).resolves.toMatchObject({mode: "resolved", lock:"lock-a"});
    await expect(resolveBootstrapLockOnce(b, async () => "lock-b")).resolves.toMatchObject({mode: "resolved", lock:"lock-b"});
  });
});
