import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The feature is disabled by default; simulate the dedicated ZoeBuild pool
// without altering the process environment or the installed runner config.
vi.mock("../../lib/env.js", () => ({
  env: { workspaceFilesystemPolicy: "legacy", workspaceRoot: "" },
}));

import { env } from "../../lib/env.js";
import {
  ensureManagedWorkspaceDirectory,
  managedWorkspaceFileMode,
  sharedGroupWorkspaceEnabled,
  verifyPrivateWorkspaceRoot,
  workspaceDirectoryMode,
  workspaceFileMode,
  workspaceRuntimeEnvironment,
} from "./workspaceFilesystemPolicy.js";

const mutableEnv = env as unknown as { workspaceFilesystemPolicy: "legacy" | "shared-group-v1"; workspaceRoot: string };

describe("ZoeBuild rootless shared-group workspace filesystem policy", () => {
  let root: string;

  beforeEach(async () => {
    mutableEnv.workspaceFilesystemPolicy = "legacy";
    root = await fs.mkdtemp(path.join(os.tmpdir(), "zoebuild-p3b4a-policy-"));
    mutableEnv.workspaceRoot = root;
  });

  afterEach(async () => {
    mutableEnv.workspaceFilesystemPolicy = "legacy";
    await fs.rm(root, { recursive: true, force: true });
  });

  it("preserves the accepted legacy mode without the feature flag", async () => {
    expect(sharedGroupWorkspaceEnabled()).toBe(false);
    expect(workspaceDirectoryMode()).toBe(0o777);
    expect(workspaceFileMode()).toBe(0o666);
    expect(managedWorkspaceFileMode(0o755)).toBe(0o755);
    expect(managedWorkspaceFileMode(null)).toBe(0o666);
    expect(workspaceRuntimeEnvironment()).toEqual([]);
  });

  it("uses setgid private directories, group-writable files and a private process umask", async () => {
    mutableEnv.workspaceFilesystemPolicy = "shared-group-v1";
    expect(workspaceDirectoryMode()).toBe(0o2770);
    expect(workspaceFileMode()).toBe(0o660);
    expect(managedWorkspaceFileMode(null)).toBe(0o660);
    expect(managedWorkspaceFileMode(0o644)).toBe(0o660);
    expect(managedWorkspaceFileMode(0o755)).toBe(0o770);
    expect(workspaceRuntimeEnvironment()).toEqual([
      "RUNNER_WORKSPACE_FS_POLICY=shared-group-v1",
      "UMASK=007",
    ]);

    await ensureManagedWorkspaceDirectory(root);
    // Linux requires setgid. macOS may retain or clear it.
    const assertManagedDirectoryMode = async (directory: string) => {
      const actualMode = (await fs.stat(directory)).mode & 0o7777;
      if (process.platform === "linux") {
        expect(actualMode).toBe(0o2770);
      } else {
        expect([0o770, 0o2770]).toContain(actualMode);
      }
    };
    await assertManagedDirectoryMode(root);
    const child = path.join(root, "nested", "components");
    await ensureManagedWorkspaceDirectory(child);
    await assertManagedDirectoryMode(path.join(root, "nested"));
    await assertManagedDirectoryMode(child);
    // Verification depends on persisted permissions, not OS name.
    // A directory with the required setgid bit must be accepted.
    // A directory missing that bit must fail closed.
    const persistedRootMode = (await fs.stat(root)).mode & 0o7777;

    if (persistedRootMode === 0o2770) {
      await expect(verifyPrivateWorkspaceRoot(root)).resolves.toBeUndefined();
    } else {
      expect(persistedRootMode).toBe(0o770);
      await expect(verifyPrivateWorkspaceRoot(root)).rejects.toThrow(/not private/);
    }
  });

  it("fails closed for a symlinked existing directory and non-private workspace root", async () => {
    mutableEnv.workspaceFilesystemPolicy = "shared-group-v1";
    const link = path.join(root, "link");
    await fs.symlink(root, link);
    await expect(ensureManagedWorkspaceDirectory(link)).rejects.toThrow();

    await fs.chmod(root, 0o777);
    await expect(verifyPrivateWorkspaceRoot(root)).rejects.toThrow(/not private/);
    await expect(ensureManagedWorkspaceDirectory(path.join(os.tmpdir(), "unrelated")))
      .rejects.toThrow(/escapes/);
  });

  it("fails closed before filesystem writes when the host lacks POSIX identity APIs", async () => {
    mutableEnv.workspaceFilesystemPolicy = "shared-group-v1";
    const getuidDescriptor = Object.getOwnPropertyDescriptor(process, "getuid");
    const target = path.join(root, "must-not-create");
    try {
      Object.defineProperty(process, "getuid", {
        configurable: true,
        writable: true,
        value: undefined,
      });
      await expect(ensureManagedWorkspaceDirectory(target)).rejects.toThrow(/requires POSIX host identity APIs/);
      await expect(verifyPrivateWorkspaceRoot(root)).rejects.toThrow(/requires POSIX host identity APIs/);
      await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (getuidDescriptor) {
        Object.defineProperty(process, "getuid", getuidDescriptor);
      } else {
        Reflect.deleteProperty(process, "getuid");
      }
    }
  });
});
