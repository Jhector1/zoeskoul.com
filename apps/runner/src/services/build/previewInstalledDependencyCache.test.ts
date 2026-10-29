import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PreviewInstalledDependencyCache,
  previewInstalledDependencyKey,
} from "./previewInstalledDependencyCache.js";

const active: Array<{ root: string; cache: PreviewInstalledDependencyCache }> = [];
afterEach(async () => {
  await Promise.all(active.splice(0).map(async ({ root, cache }) => {
    await cache.clear();
    await fs.rm(root, { force: true, recursive: true });
  }));
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "preview-installed-cache-test-"));
  const cache = new PreviewInstalledDependencyCache();
  active.push({ root, cache });
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  await fs.mkdir(path.join(first, "node_modules", ".pnpm", "foo", "node_modules", "foo"), { recursive: true });
  await fs.writeFile(path.join(first, "node_modules", ".pnpm", "foo", "node_modules", "foo", "index.js"), "export default 123");
  await fs.symlink(".pnpm/foo/node_modules/foo", path.join(first, "node_modules", "foo"));
  await fs.mkdir(second);
  return { root, first, second, cache };
}

const key = () => previewInstalledDependencyKey({
  actorKey: "user-a", projectId: "project-a", dependencyFingerprint: "digest-a",
  command: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
  imageId: `sha256:${"a".repeat(64)}`,
});

describe("K20D2D installed dependency cache", () => {
  it("copies exact installed modules without sharing writable directories", async () => {
    const { first, second, cache } = await fixture();
    expect(await cache.remember(key(), first)).toBe(true);
    expect(await cache.restore(key(), second)).toBe(true);
    expect(await fs.readFile(path.join(second, "node_modules", "foo", "index.js"), "utf8"))
      .toBe("export default 123");
    await fs.writeFile(path.join(second, "node_modules", ".pnpm", "foo", "node_modules", "foo", "index.js"), "mutated");
    expect(await fs.readFile(path.join(first, "node_modules", "foo", "index.js"), "utf8"))
      .toBe("export default 123");
  });

  it("accepts safe pnpm links through a symlinked workspace parent", async () => {
    // Reproduces macOS /var -> /private/var without depending on macOS.
    const { root, first, second, cache } = await fixture();
    const alias = path.join(root, "workspace-alias");
    await fs.symlink(path.basename(first), alias, "dir");
    expect(await cache.remember(key(), alias)).toBe(true);
    expect(await cache.restore(key(), second)).toBe(true);
    expect(await fs.readFile(path.join(second, "node_modules", "foo", "index.js"), "utf8"))
      .toBe("export default 123");
  });

  it("still rejects escaping relative symlinks through aliased paths", async () => {
    const { root, first, second, cache } = await fixture();
    const alias = path.join(root, "workspace-alias");
    await fs.symlink(path.basename(first), alias, "dir");
    await fs.mkdir(path.join(root, "outside"));
    await fs.symlink("../../outside", path.join(first, "node_modules", "escape"));
    expect(await cache.remember(key(), alias)).toBe(false);
    expect(await cache.restore(key(), second)).toBe(false);
  });

  it("cannot match another actor, project, dependency fingerprint, command or image", () => {
    const original = { actorKey: "user-a", projectId: "project-a", dependencyFingerprint: "digest-a", command: ["pnpm", "install"], imageId: `sha256:${"a".repeat(64)}` };
    const encode = (next: typeof original) => previewInstalledDependencyKey(next);
    for (const variant of [
      { ...original, actorKey: "user-b" },
      { ...original, projectId: "project-b" },
      { ...original, dependencyFingerprint: "digest-b" },
      { ...original, command: ["pnpm", "install", "--offline"] },
      { ...original, imageId: `sha256:${"b".repeat(64)}` },
    ]) expect(encode(variant)).not.toBe(encode(original));
  });

  it("rejects an escaping symlink and never creates an entry", async () => {
    const { first, second, cache } = await fixture();
    await fs.symlink("/etc/passwd", path.join(first, "node_modules", randomUUID()));
    expect(await cache.remember(key(), first)).toBe(false);
    expect(await cache.restore(key(), second)).toBe(false);
  });

  it("does not replace an existing installed dependency tree", async () => {
    const { first, second, cache } = await fixture();
    expect(await cache.remember(key(), first)).toBe(true);
    await fs.mkdir(path.join(second, "node_modules"));
    expect(await cache.restore(key(), second)).toBe(false);
  });
});
