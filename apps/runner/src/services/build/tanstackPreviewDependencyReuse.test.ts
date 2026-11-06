import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { PreviewDependencyLayerStore } from "./previewDependencyLayerStore.js";
import {
  prepareTanstackPreviewDependencies,
  tanstackPreviewDependencyKey,
} from "./tanstackPreviewDockerDriver.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { PreviewObservability } from "./previewObservability.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function scratch() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zoebuild-reuse-test-"));
  roots.push(root);
  return root;
}

function request(overrides: Partial<ProductionBuildJobRequestV1> = {}): ProductionBuildJobRequestV1 {
  return {
    protocolVersion: 1,
    operation: "production-build",
    buildProjectId: "project-a",
    sourceVersion: 1,
    stackId: "tanstack-start-v1",
    templateId: "tanstack-start-v1",
    files: [
      { path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' },
      { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
      { path: "zoebuild-dependency-approval.json", content: '{"approved":true}' },
      { path: "src/main.tsx", content: "export default 1" },
    ],
    ...overrides,
  };
}

async function writeInstalledTree(workspace: string) {
  const pkg = path.join(workspace, "node_modules", ".pnpm", "react", "node_modules", "react");
  await fs.mkdir(pkg, { recursive: true });
  await fs.writeFile(path.join(pkg, "index.js"), "export const version='19.0.0'\n");
  await fs.symlink(".pnpm/react/node_modules/react", path.join(workspace, "node_modules", "react"));
}

describe("Wave 3 verified TanStack dependency reuse", () => {
  it("installs and publishes once, then performs zero install calls on a verified hit", async () => {
    const root = await scratch();
    const store = new PreviewDependencyLayerStore(root);
    const source = request();
    const identity = createTanstackPreviewIdentity(source, `sha256:${"a".repeat(64)}`);
    const key = tanstackPreviewDependencyKey("owner-a", source, identity);
    let installs = 0;

    const first = path.join(root, "first");
    await fs.mkdir(first);
    const miss = await prepareTanstackPreviewDependencies({
      store, key, workspaceDir: first,
      install: async () => { installs += 1; await writeInstalledTree(first); },
    });
    expect(miss).toEqual({ mode: "private-install", lease: null });
    expect(await fs.readFile(path.join(first, "node_modules", "react", "index.js"), "utf8"))
      .toContain("19.0.0");

    const second = path.join(root, "second");
    await fs.mkdir(second);
    const telemetry = new PreviewObservability(() => 1)
      .beginOperation({ startKind: "cold", reuseCandidate: false });
    const hit = await prepareTanstackPreviewDependencies({
      store, key, workspaceDir: second,
      telemetry,
      install: async () => { installs += 1; throw new Error("cache hit launched install"); },
    });
    expect(hit.mode).toBe("hit");
    expect(hit.lease).not.toBeNull();
    expect(installs).toBe(1);
    telemetry.finish("ok");
    expect(telemetry.snapshot().stages.dependency_install).toEqual({
      outcome: "skipped", reason: "cache_hit",
    });
    expect(await fs.lstat(path.join(second, "node_modules")).catch(() => null)).toBeNull();
    hit.lease!.release();
  });

  it("reuses across source revisions only when the approved dependency identity is exact", () => {
    const original = request();
    const imageA = `sha256:${"a".repeat(64)}`;
    const originalIdentity = createTanstackPreviewIdentity(original, imageA);
    const changedSource = request({ sourceVersion: 2, files: original.files.map(file =>
      file.path === "src/main.tsx" ? { ...file, content: "export default 2" } : file) });
    expect(tanstackPreviewDependencyKey("owner-a", original, originalIdentity)).toBe(
      tanstackPreviewDependencyKey(
        "owner-a", changedSource, createTanstackPreviewIdentity(changedSource, imageA),
      ),
    );

    for (const [pathname, content] of [
      ["package.json", '{"dependencies":{"react":"19.1.0"}}'],
      ["pnpm-lock.yaml", "different-lock"],
      ["zoebuild-dependency-approval.json", '{"approved":false}'],
    ] as const) {
      const changed = request({ files: original.files.map(file =>
        file.path === pathname ? { ...file, content } : file) });
      expect(tanstackPreviewDependencyKey(
        "owner-a", changed, createTanstackPreviewIdentity(changed, imageA),
      )).not.toBe(tanstackPreviewDependencyKey("owner-a", original, originalIdentity));
    }
    expect(tanstackPreviewDependencyKey("owner-b", original, originalIdentity))
      .not.toBe(tanstackPreviewDependencyKey("owner-a", original, originalIdentity));
    expect(tanstackPreviewDependencyKey(
      "owner-a", request({ buildProjectId: "project-b" }), originalIdentity,
    )).not.toBe(tanstackPreviewDependencyKey("owner-a", original, originalIdentity));
    const imageB = `sha256:${"b".repeat(64)}`;
    expect(tanstackPreviewDependencyKey(
      "owner-a", original, createTanstackPreviewIdentity(original, imageB),
    )).not.toBe(tanstackPreviewDependencyKey("owner-a", original, originalIdentity));
  });

  it("falls back to the authorized private install when the cache root is unavailable", async () => {
    const root = await scratch();
    await fs.writeFile(path.join(root, ".zoebuild-preview-dependency-layers-v1"), "blocked");
    const store = new PreviewDependencyLayerStore(root);
    const workspace = path.join(root, "workspace");
    await fs.mkdir(workspace);
    let installs = 0;
    const result = await prepareTanstackPreviewDependencies({
      store, key: "c".repeat(64), workspaceDir: workspace,
      install: async () => { installs += 1; await writeInstalledTree(workspace); },
    });
    expect(result).toEqual({ mode: "private-install", lease: null });
    expect(installs).toBe(1);
    expect(store.snapshot()).toMatchObject({ unavailable: 1, publishSkipped: 1 });
  });
});
