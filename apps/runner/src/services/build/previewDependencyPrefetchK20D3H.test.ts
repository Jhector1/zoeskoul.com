import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewDependencyLayerStore } from "./previewDependencyLayerStore.js";

const scratch: string[] = [];
afterEach(async () => {
  for (const root of scratch.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zoebuild-prefetch-v1-"));
  scratch.push(root);
  const workspace = path.join(root, "project");
  const nodeModules = path.join(workspace, "node_modules");
  await fs.mkdir(path.join(nodeModules, "nested"), { recursive: true });
  for (let i = 0; i < 28; i++) {
    await fs.writeFile(path.join(nodeModules, `entry-${String(i).padStart(2, "0")}.js`),
      `export default ${i};\n`.repeat(512));
  }
  // Keep at least one file larger than the bounded prefetch window. It must
  // still be streamed and covered by the same byte-identical digest.
  await fs.writeFile(path.join(nodeModules, "nested", "large.bin"), Buffer.alloc(500_000, 0x4a));
  await fs.symlink("nested", path.join(nodeModules, "nested-link"));
  return { root, workspace, nodeModules };
}

async function referenceV1Digest(nodeModules: string) {
  const sha = createHash("sha256");
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const children = (await fs.readdir(dir, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const relative = prefix ? `${prefix}/${child.name}` : child.name;
      const full = path.join(dir, child.name);
      const info = await fs.lstat(full);
      if (info.isSymbolicLink()) {
        sha.update(`L\0${relative}\0${await fs.readlink(full)}\0`);
      } else if (info.isDirectory()) {
        sha.update(`D\0${relative}\0`);
        await walk(full, relative);
      } else if (info.isFile()) {
        sha.update(`F\0${relative}\0${info.mode & 0o111}\0${info.size}\0`);
        sha.update(await fs.readFile(full));
      } else throw new Error("Unexpected test fixture entry");
    }
  };
  await walk(nodeModules, "");
  return sha.digest("hex");
}

describe("K20D3H bounded pipelined layer verification", () => {
  it("preserves the exact v1 byte digest with small, large and symlinked files", async () => {
    const { root, workspace } = await fixture();
    const key = "d".repeat(64);
    const store = new PreviewDependencyLayerStore(root);
    const first = await store.publish(key, workspace);
    expect(first).not.toBeNull();
    const layerRoot = path.dirname(first!.nodeModulesDir);
    const manifest = JSON.parse(await fs.readFile(path.join(layerRoot, "manifest.json"), "utf8"));
    expect(manifest.schema).toBe("zoebuild-preview-dependency-layer-v1");
    expect(manifest.digest).toBe(await referenceV1Digest(first!.nodeModulesDir));
    first!.release();
    const second = await new PreviewDependencyLayerStore(root).acquire(key);
    expect(second).not.toBeNull();
    second!.release();
  }, 30_000);

  it("does not accept a one-byte change in a prefetched package", async () => {
    const { root, workspace } = await fixture();
    const key = "e".repeat(64);
    const store = new PreviewDependencyLayerStore(root);
    const lease = await store.publish(key, workspace);
    expect(lease).not.toBeNull();
    lease!.release();
    await fs.appendFile(path.join(lease!.nodeModulesDir, "entry-03.js"), "X");
    expect(await store.acquire(key)).toBeNull();
  }, 30_000);
});
