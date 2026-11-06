import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewDependencyLayerStore, previewDependencyLayerKey } from "./previewDependencyLayerStore.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zoebuild-layer-test-"));
  roots.push(root);
  const first = path.join(root, "first");
  await fs.mkdir(path.join(first, "node_modules", ".pnpm", "foo", "node_modules", "foo"), { recursive: true });
  await fs.writeFile(path.join(first, "node_modules", ".pnpm", "foo", "node_modules", "foo", "index.js"), "export default 123");
  await fs.symlink(".pnpm/foo/node_modules/foo", path.join(first, "node_modules", "foo"));
  return { root, first, store: new PreviewDependencyLayerStore(root) };
}
const keyInput = {
  actorKey: "owner-1", projectId: "project-1", dependencyFingerprint: "frozen-exact-1",
  command: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
  imageId: `sha256:${"a".repeat(64)}`,
  installPolicyFingerprint: "install-policy-v1",
};
const key = () => previewDependencyLayerKey(keyInput);

describe("K20D3F persistent verified dependency layers", () => {
  it("publishes a verified detached layer and survives a store restart", async () => {
    const { root, first, store } = await fixture();
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    expect((await fs.lstat(path.join(first, "node_modules"))).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(lease!.nodeModulesDir, "foo", "index.js"), "utf8"))
      .toBe("export default 123");
    expect(PreviewDependencyLayerStore.bind(lease!)).toBe(`${lease!.nodeModulesDir}:/workspace/node_modules:ro`);
    const restarted = new PreviewDependencyLayerStore(root);
    const next = await restarted.acquire(key());
    expect(next).not.toBeNull();
    expect(restarted.snapshot()).toMatchObject({lookups:1,hits:1,misses:0,activeKeys:1,activeLeases:1});
    expect(store.snapshot()).toMatchObject({publishAttempts:1,published:1,activeLeases:1});
    expect(await restarted.storageSnapshot()).toMatchObject({available:true,entries:1});
    expect((await restarted.storageSnapshot()).bytes).toBeGreaterThan(0);
    next!.release(); lease!.release();
  });

  it("rejects tampered file contents on every acquire", async () => {
    const { first, store } = await fixture();
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    lease!.release();
    await fs.writeFile(path.join(lease!.nodeModulesDir, "foo", "index.js"), "malicious edit");
    expect(await store.acquire(key())).toBeNull();
  });

  it("rejects tampered manifests and a symlink replaced layer root", async () => {
    const { root, first, store } = await fixture();
    const lease = await store.publish(key(), first);
    lease!.release();
    const layerRoot = path.dirname(lease!.nodeModulesDir);
    await fs.writeFile(path.join(layerRoot, "manifest.json"), "{}");
    expect(await store.acquire(key())).toBeNull();
    await fs.rm(layerRoot, { recursive: true });
    await fs.symlink(root, layerRoot);
    expect(await store.acquire(key())).toBeNull();
  });

  it("rejects escaping relative and absolute links instead of publishing", async () => {
    const { root, first, store } = await fixture();
    await fs.mkdir(path.join(root, "outside"));
    await fs.symlink("../../outside", path.join(first, "node_modules", "escape"));
    expect(await store.publish(key(), first)).toBeNull();
    await fs.unlink(path.join(first, "node_modules", "escape"));
    await fs.symlink("/etc/passwd", path.join(first, "node_modules", "absolute"));
    expect(await store.publish(key(), first)).toBeNull();
    expect(await fs.lstat(path.join(first, "node_modules"))).toHaveProperty("mode");
  });

  it("rejects wrong owner, project, dependencies, install command or runtime image", async () => {
    const { first, store } = await fixture();
    const lease = await store.publish(key(), first);
    lease!.release();
    for (const item of [
      { ...keyInput, actorKey: "someone-else" },
      { ...keyInput, projectId: "another-project" },
      { ...keyInput, dependencyFingerprint: "different-lock" },
      { ...keyInput, command: ["pnpm", "install"] },
      { ...keyInput, imageId: `sha256:${"b".repeat(64)}` },
      { ...keyInput, installPolicyFingerprint: "install-policy-v2" },
    ]) expect(await store.acquire(previewDependencyLayerKey(item))).toBeNull();
  });

  it("accepts safe relative pnpm links reached via a workspace path alias", async () => {
    const { root, first, store } = await fixture();
    await fs.symlink(path.basename(first), path.join(root, "alias"));
    const lease = await store.publish(key(), path.join(root, "alias"));
    expect(lease).not.toBeNull();
    lease!.release();
  });

  it("detaches pnpm-style external hardlinks once and never shares their inode", async () => {
    const { root, first, store } = await fixture();
    const outside = path.join(root, "shared.js");
    await fs.writeFile(outside, "original external content");
    await fs.link(outside, path.join(first, "node_modules", "hardlink.js"));
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    const detached = path.join(lease!.nodeModulesDir, "hardlink.js");
    expect((await fs.stat(detached)).ino).not.toBe((await fs.stat(outside)).ino);
    await fs.writeFile(outside, "externally mutated");
    expect(await fs.readFile(detached, "utf8")).toBe("original external content");
    lease!.release();
    const restarted = new PreviewDependencyLayerStore(root);
    const again = await restarted.acquire(key());
    expect(again).not.toBeNull();
    again!.release();
  });

  it("does not modify the rootless-installed source or require mkdir permission inside it", async () => {
    const { first, store } = await fixture();
    const original = path.join(first, "node_modules");
    await fs.chmod(original, 0o555);
    let lease: Awaited<ReturnType<PreviewDependencyLayerStore["publish"]>> = null;
    try {
      lease = await store.publish(key(), first);
      expect(lease).not.toBeNull();
      // Publication may change modes on its PRIVATE detached copy only.
      expect((await fs.stat(original)).mode & 0o777).toBe(0o555);
      expect(await fs.lstat(path.join(original, ".vite")).catch(() => null)).toBeNull();
      expect((await fs.lstat(path.join(lease!.nodeModulesDir, ".vite"))).isDirectory()).toBe(true);
      expect((await fs.stat(lease!.nodeModulesDir)).mode & 0o200).toBe(0o200);
    } finally {
      lease?.release();
      // Test teardown must not leave a 0555 source directory on macOS.
      await fs.chmod(original, 0o755);
    }
  });

  it("keeps private source intact and reports bounded skip reasons on invalid trees", async () => {
    const { root, first, store } = await fixture();
    await fs.symlink("/etc/passwd", path.join(first, "node_modules", "escape"));
    const lease = await store.publish(key(), first);
    expect(lease).toBeNull();
    expect((await fs.lstat(path.join(first, "node_modules"))).isDirectory()).toBe(true);
    expect(await fs.readdir(path.join(root, ".zoebuild-preview-dependency-layers-v1")))
      .not.toContain(key());
  });

  it("rejects a symlink workspace dependency root", async () => {
    const { root, first, store } = await fixture();
    await fs.rename(path.join(first, "node_modules"), path.join(root, "modules"));
    await fs.symlink(path.join(root, "modules"), path.join(first, "node_modules"));
    expect(await store.publish(key(), first)).toBeNull();
  });

  it("a layer only exports its node_modules as an explicit read-only bind", async () => {
    const { root, first, store } = await fixture();
    const lease = await store.publish(key(), first);
    expect(lease!.nodeModulesDir).toContain("/.zoebuild-preview-dependency-layers-v1/");
    expect(PreviewDependencyLayerStore.bind(lease!)).not.toContain(":rw");
    expect(PreviewDependencyLayerStore.bind(lease!)).not.toContain("docker.sock");
    expect(PreviewDependencyLayerStore.bind(lease!)).not.toBe(`${root}:/workspace:ro`);
    lease!.release();
  });

  it("rejects expired layers and reports corrupt content distinctly", async () => {
    let now = 10_000_000_000;
    const { first, root } = await fixture();
    const store = new PreviewDependencyLayerStore(root, { now: () => now });
    const lease = await store.publish(key(), first);
    lease!.release();
    now += 24 * 60 * 60_000 + 1;
    expect((await store.lookup(key())).outcome).toBe("rejected");
    now -= 24 * 60 * 60_000 + 1;
    await fs.appendFile(path.join(lease!.nodeModulesDir, "foo", "index.js"), "tamper");
    expect((await store.lookup(key())).outcome).toBe("corrupt");
    expect(store.snapshot()).toMatchObject({ rejected: 1, corrupt: 1 });
  });

  it("falls back without publishing when prospective disk headroom is unavailable", async () => {
    const { first, root } = await fixture();
    const store = new PreviewDependencyLayerStore(root, {
      reserveCapacity: async () => { throw new Error("disk reserve unavailable"); },
    });
    expect(await store.publish(key(), first)).toBeNull();
    expect((await fs.lstat(path.join(first, "node_modules"))).isDirectory()).toBe(true);
    expect(store.snapshot()).toMatchObject({ publishAttempts: 1, publishSkipped: 1 });
  });

  it("atomically resolves concurrent identical publications", async () => {
    const { first, root, store } = await fixture();
    const results = await Promise.all([
      store.publish(key(), first),
      store.publish(key(), first),
      store.publish(key(), first),
    ]);
    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    for (const lease of results) lease?.release();
    const entries = (await fs.readdir(path.join(root, ".zoebuild-preview-dependency-layers-v1")))
      .filter(name => /^[a-f0-9]{64}$/.test(name));
    expect(entries).toEqual([key()]);
    const acquired = await store.acquire(key());
    expect(acquired).not.toBeNull();
    acquired!.release();
  });

  it("evicts deterministically without removing a leased layer", async () => {
    let now = 20_000_000_000;
    const { first, root } = await fixture();
    const store = new PreviewDependencyLayerStore(root, { now: () => now });
    let held: Awaited<ReturnType<PreviewDependencyLayerStore["publish"]>> = null;
    const keys: string[] = [];
    for (let i = 0; i < 24; i++) {
      const itemKey = previewDependencyLayerKey({
        ...keyInput, dependencyFingerprint: `dependencies-${String(i).padStart(2, "0")}`,
      });
      keys.push(itemKey);
      const lease = await store.publish(itemKey, first);
      expect(lease).not.toBeNull();
      if (i === 0) held = lease;
      else lease!.release();
      now += 1;
    }
    now += 76 * 60_000;
    const newest = previewDependencyLayerKey({ ...keyInput, dependencyFingerprint: "dependencies-24" });
    const added = await store.publish(newest, first);
    expect(added).not.toBeNull();
    const remaining = await fs.readdir(path.join(root, ".zoebuild-preview-dependency-layers-v1"));
    expect(remaining).toContain(keys[0]);
    expect(remaining).not.toContain(keys[1]);
    expect(remaining).toContain(newest);
    added!.release();
    held!.release();
  }, 30_000);

  it("cleans only old incomplete staging directories during a later publication", async () => {
    const { first, root } = await fixture();
    const storeRoot = path.join(root, ".zoebuild-preview-dependency-layers-v1");
    await fs.mkdir(storeRoot);
    const abandoned = path.join(storeRoot, ".pending-11111111-1111-1111-1111-111111111111");
    await fs.mkdir(abandoned);
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    await fs.utimes(abandoned, old, old);
    const store = new PreviewDependencyLayerStore(root);
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    expect(await fs.lstat(abandoned).catch(() => null)).toBeNull();
    lease!.release();
  });
});
