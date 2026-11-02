import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readTanstackWorkerArtifact } from "./tanstackWorkerArtifact";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-worker-artifact-"));
  roots.push(root);
  await fs.mkdir(path.join(root, "dist/server"), { recursive: true });
  await fs.mkdir(path.join(root, "dist/client/assets"), { recursive: true });
  await fs.writeFile(path.join(root, "dist/server/index.js"), "export default {fetch:()=>new Response('ok')}\n");
  await fs.writeFile(path.join(root, "dist/server/wrangler.json"), '{"name":"test-worker"}');
  await fs.writeFile(path.join(root, "dist/client/assets/app.js"), "console.log('hello')");
  return root;
}
describe("TanStack Worker artifact attestation", () => {
  it("attests and labels client/server outputs without calling them static", async () => {
    const root = await fixture();
    const first = await readTanstackWorkerArtifact(root);
    const second = await readTanstackWorkerArtifact(root);
    expect(first).toEqual(second);
    expect(first.type).toBe("worker-bundle");
    expect(first.entrypoint).toBe("index.js");
    expect(first.files.map((f) => f.path)).toContain("server/index.js");
    expect(first.files.map((f) => f.path)).toContain("client/assets/app.js");
    await fs.writeFile(path.join(root, "dist/server/index.js"), "export default 'changed'");
    expect((await readTanstackWorkerArtifact(root)).sha256).not.toBe(first.sha256);
  });
  it("rejects symlinked content or directories", async () => {
    const root = await fixture();
    await fs.symlink(path.join(root, "dist/server/index.js"), path.join(root, "dist/client/assets/leak"));
    await expect(readTanstackWorkerArtifact(root)).rejects.toThrow(/symlink/);
  });
  it("rejects missing server entry and invalid generated metadata", async () => {
    const root = await fixture();
    await fs.rm(path.join(root, "dist/server/index.js"));
    await expect(readTanstackWorkerArtifact(root)).rejects.toThrow(/entrypoint/);
    await fs.writeFile(path.join(root, "dist/server/index.js"), "x");
    await fs.writeFile(path.join(root, "dist/server/wrangler.json"), "bad-json");
    await expect(readTanstackWorkerArtifact(root)).rejects.toThrow(/metadata/);
  });
  it("refuses environment credential files in Worker output", async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, "dist/server/.dev.vars"), "SECRET=test");
    await expect(readTanstackWorkerArtifact(root)).rejects.toThrow(/unsafe path/);
  });
  it("rejects oversized artifacts before reading their bytes", async () => {
    const root = await fixture();
    await fs.truncate(path.join(root, "dist/client/assets/app.js"), 13 * 1024 * 1024);
    await expect(readTanstackWorkerArtifact(root)).rejects.toThrow(/limits/);
  });
});
