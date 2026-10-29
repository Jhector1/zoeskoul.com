import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapLockCacheKey } from "./dependencyLockBootstrapCache.js";
import { readPersistedBootstrapLock, persistBootstrapLock } from "./bootstrapPersistentLockCache.js";

const roots: string[] = [];
function privateWorkspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), "zoebuild-lock-test-"));
  roots.push(root);
  return root;
}
const key = bootstrapLockCacheKey({
  projectId: "owner-scoped-project",
  files: [{ path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' }],
  command: ["pnpm", "install", "--lockfile-only", "--ignore-scripts"],
  image: `sha256:${"a".repeat(64)}`,
});
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("K20D3D private durable trusted lock bootstrap", () => {
  it("survives an independent read without another container and preserves exact lock bytes", async () => {
    const root = privateWorkspace();
    const lock = "lockfileVersion: '9.0'\nimporters:\n  .: {}\n";
    expect(await persistBootstrapLock(root, key, lock)).toBe(true);
    expect(await readPersistedBootstrapLock(root, key)).toBe(lock);
  });

  it("cannot cross runtime image, project, or input-byte identity", async () => {
    const root = privateWorkspace();
    await persistBootstrapLock(root, key, "lock-valid");
    const otherKey = bootstrapLockCacheKey({
      projectId: "owner-scoped-project",
      files: [{ path: "package.json", content: '{"dependencies":{"react":"20.0.0"}}' }],
      command: ["pnpm", "install", "--lockfile-only", "--ignore-scripts"],
      image: `sha256:${"b".repeat(64)}`,
    });
    expect(await readPersistedBootstrapLock(root, otherKey)).toBeNull();
    expect(await readPersistedBootstrapLock(root, "../unsafe")).toBeNull();
  });

  it("fails closed on altered bytes, stale records or a symlinked entry", async () => {
    const root = privateWorkspace();
    expect(await persistBootstrapLock(root, key, "lock-original", 1000)).toBe(true);
    expect(await readPersistedBootstrapLock(root, key, 1001)).toBe("lock-original");
    expect(await readPersistedBootstrapLock(root, key, 8 * 24 * 60 * 60_000)).toBeNull();
    const dir = path.join(root, ".zoebuild-trusted-bootstrap-locks-v1");
    const file = path.join(dir, `${key}.json`);
    const record = JSON.parse(await fs.readFile(file, "utf8"));
    record.lock = "lock-tampered";
    await fs.writeFile(file, JSON.stringify(record));
    expect(await readPersistedBootstrapLock(root, key, 1001)).toBeNull();
    await fs.unlink(file);
    await fs.symlink("/etc/passwd", file);
    expect(await readPersistedBootstrapLock(root, key, 1001)).toBeNull();
  });

  it("rejects cache directories writable to other users", async () => {
    const root = privateWorkspace();
    const dir = path.join(root, ".zoebuild-trusted-bootstrap-locks-v1");
    await fs.mkdir(dir, { mode: 0o777 });
    await fs.chmod(dir, 0o777);
    expect(await persistBootstrapLock(root, key, "trusted")).toBe(false);
    expect(await readPersistedBootstrapLock(root, key)).toBeNull();
  });
});
