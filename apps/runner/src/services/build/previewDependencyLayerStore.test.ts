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
};
const key = () => previewDependencyLayerKey(keyInput);

describe("K20D3F persistent verified dependency layers", () => {
  it("publishes by moving rather than copying and survives a store restart", async () => {
    const { root, first, store } = await fixture();
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    expect(await fs.lstat(path.join(first, "node_modules")).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(lease!.nodeModulesDir, "foo", "index.js"), "utf8"))
      .toBe("export default 123");
    expect(PreviewDependencyLayerStore.bind(lease!)).toBe(`${lease!.nodeModulesDir}:/workspace/node_modules:ro`);
    const restarted = new PreviewDependencyLayerStore(root);
    const next = await restarted.acquire(key());
    expect(next).not.toBeNull();
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
    ]) expect(await store.acquire(previewDependencyLayerKey(item))).toBeNull();
  });

  it("accepts safe relative pnpm links reached via a workspace path alias", async () => {
    const { root, first, store } = await fixture();
    await fs.symlink(path.basename(first), path.join(root, "alias"));
    const lease = await store.publish(key(), path.join(root, "alias"));
    expect(lease).not.toBeNull();
    lease!.release();
  });

  it("rejects hardlinks to writable files outside the layer", async () => {
    const { root, first, store } = await fixture();
    const outside = path.join(root, "shared.js");
    await fs.writeFile(outside, "external writable content");
    await fs.link(outside, path.join(first, "node_modules", "hardlink.js"));
    expect(await store.publish(key(), first)).toBeNull();
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
});
