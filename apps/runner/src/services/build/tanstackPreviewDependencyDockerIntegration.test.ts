import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";

const state = vi.hoisted(() => ({
  workspaceDir: "",
  options: null as any,
  removalFailures: 0,
  removeCalls: 0,
}));

vi.mock("../docker/dockerClient.js", () => ({
  docker: {
    createContainer: vi.fn(async (options: unknown) => {
      state.options = options;
      return { id: "container-cache-hit", start: vi.fn(async () => undefined) };
    }),
    getContainer: vi.fn(() => ({
      remove: vi.fn(async () => {
        state.removeCalls += 1;
        if (state.removalFailures > 0) {
          state.removalFailures -= 1;
          throw new Error("Docker teardown unavailable");
        }
      }),
    })),
  },
}));

vi.mock("../workspace/createWorkspace.js", () => ({
  createWorkspace: vi.fn(async (_files: unknown, options: any) => {
    await options?.onWorkspaceAllocated?.(state.workspaceDir);
    return state.workspaceDir;
  }),
}));

vi.mock("./tanstackPreviewDurableRecovery.js", () => ({
  createTanstackRecoveryJournal: vi.fn(() => {
    const current = { workspaceDir: null as string | null, containerId: null as string | null };
    return {
      runId: "11111111-1111-1111-1111-111111111111",
      current,
      write: vi.fn(async (update: Record<string, unknown> = {}) => Object.assign(current, update)),
      clear: vi.fn(async () => undefined),
    };
  }),
  removeTanstackWorkspaceStrict: vi.fn(async () => undefined),
}));

vi.mock("../workspace/workspacePermissions.js", () => ({
  ensureWorkspaceWritableForShellUser: vi.fn(async () => undefined),
}));

vi.mock("./executeProductionBuild.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./executeProductionBuild.js")>();
  return { ...actual, executeBuildStep: vi.fn(async () => undefined) };
});

import { executeBuildStep } from "./executeProductionBuild.js";
import { PreviewDependencyLayerStore } from "./previewDependencyLayerStore.js";
import {
  makeTanstackPreviewDockerDriver,
  tanstackPreviewDependencyKey,
} from "./tanstackPreviewDockerDriver.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
beforeEach(() => {
  state.options = null;
  state.removalFailures = 0;
  state.removeCalls = 0;
  vi.mocked(executeBuildStep).mockClear();
});

function request(): ProductionBuildJobRequestV1 {
  return {
    protocolVersion: 1, operation: "production-build", buildProjectId: "project-a",
    sourceVersion: 1, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
    files: [
      { path: "package.json", content: JSON.stringify({
        packageManager: "pnpm@10.33.0", scripts: { build: "vite build && tsc --noEmit" },
      }) },
      { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
      { path: "vite.config.ts", content: "export default {}" },
      { path: "wrangler.jsonc", content: "{}" },
      { path: "src/router.tsx", content: "export {}" },
      { path: "src/routes/__root.tsx", content: "export {}" },
      { path: "zoebuild-dependency-approval.json", content: "approval" },
    ],
  };
}

async function cachedDriver() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zoebuild-driver-cache-"));
  roots.push(root);
  const installed = path.join(root, "installed");
  state.workspaceDir = path.join(root, "live");
  await fs.mkdir(path.join(installed, "node_modules", "pkg"), { recursive: true });
  await fs.writeFile(path.join(installed, "node_modules", "pkg", "index.js"), "export default 1");
  await fs.mkdir(state.workspaceDir);
  const store = new PreviewDependencyLayerStore(root);
  const source = request();
  const identity = createTanstackPreviewIdentity(source, `sha256:${"a".repeat(64)}`);
  const published = await store.publish(
    tanstackPreviewDependencyKey("owner-a", source, identity), installed,
  );
  expect(published).not.toBeNull();
  published!.release();
  const basePath = `/api/build/projects/project-a/preview/preview_11111111-1111-1111-1111-111111111111/content/${"x".repeat(32)}/`;
  return {
    store,
    driver: makeTanstackPreviewDockerDriver(
      "owner-a", source, basePath, identity, undefined, store,
    ),
  };
}

describe("Wave 3 Docker dependency mount ownership", () => {
  it("launches a cache hit without an install container and mounts only private writable Vite caches", async () => {
    const { store, driver } = await cachedDriver();
    const workspace = await driver.prepare();
    expect(vi.mocked(executeBuildStep)).not.toHaveBeenCalled();
    expect(store.snapshot().activeLeases).toBe(1);
    const containerId = await driver.launch(workspace);
    expect(state.options.HostConfig.Binds).toHaveLength(2);
    expect(state.options.HostConfig.Binds[1]).toMatch(/node_modules:\/workspace\/node_modules:ro$/);
    expect(state.options.HostConfig.Tmpfs).toMatchObject({
      "/workspace/node_modules/.vite": expect.stringMatching(
        /^rw,noexec,nosuid,nodev,size=64m,uid=\d+,gid=\d+,mode=0700$/,
      ),
      "/workspace/node_modules/.vite-temp": expect.stringMatching(
        /^rw,noexec,nosuid,nodev,size=16m,uid=\d+,gid=\d+,mode=0700$/,
      ),
    });
    expect(state.options.HostConfig.NetworkMode).toBe("none");
    await driver.destroy(containerId);
    expect(store.snapshot().activeLeases).toBe(0);
    await driver.cleanup(workspace);
  });

  it("retains the dependency lease across failed container teardown and releases after retry", async () => {
    const { store, driver } = await cachedDriver();
    const workspace = await driver.prepare();
    const containerId = await driver.launch(workspace);
    state.removalFailures = 1;
    await expect(driver.destroy(containerId)).rejects.toThrow("teardown unavailable");
    expect(store.snapshot().activeLeases).toBe(1);
    await driver.cleanup(workspace);
    expect(store.snapshot().activeLeases).toBe(1);
    await expect(driver.destroy(containerId)).resolves.toBeUndefined();
    expect(store.snapshot().activeLeases).toBe(0);
  });

  it("releases a prepared hit when cancellation occurs before container creation", async () => {
    const { store, driver } = await cachedDriver();
    const workspace = await driver.prepare();
    expect(store.snapshot().activeLeases).toBe(1);
    await driver.cleanup(workspace);
    expect(store.snapshot().activeLeases).toBe(0);
  });
});
