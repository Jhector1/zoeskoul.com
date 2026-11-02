import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  root: "/tmp/reclamation-test",
  createContainer: vi.fn(),
}));
vi.mock("../../lib/env.js", () => ({
  env: {
    get workspaceRoot() { return fixture.root; },
    runnerImage: "ghcr.io/test/zoeskoul-runtime@sha256:" + "a".repeat(64),
  },
}));
vi.mock("./dockerClient.js", () => ({
  docker: { createContainer: (...args: unknown[]) => fixture.createContainer(...args) },
}));

import {
  buildRunnerReclamationOptions,
  removeRunnerWorkspaceWithRecovery,
  repairRunnerWorkspaceForRemoval,
} from "./runnerWorkspaceReclamation.js";

const UUID = "12345678-1234-4234-8234-123456789abc";
let root: string;
const getWorkspace = () => path.join(root, `zoeskoul-run-${UUID}`);

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "zoeskoul-reclaim-")));
  fixture.root = root;
  fixture.createContainer.mockReset();
  fixture.createContainer.mockImplementation(async () => ({
    start: async () => undefined,
    wait: async () => ({ StatusCode: 0 }),
    remove: async () => undefined,
  }));
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("Runner rootless orphan workspace reclamation", () => {
  it("runs only on permission errors and retries exactly once", async () => {
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    const remove = vi.fn().mockRejectedValueOnce(denied).mockResolvedValue(undefined);
    const repair = vi.fn().mockResolvedValue(undefined);
    await removeRunnerWorkspaceWithRecovery(getWorkspace(), { remove, repair });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("does not repair unrelated errors", async () => {
    const remove = vi.fn().mockRejectedValue(Object.assign(new Error("no space"), { code: "ENOSPC" }));
    const repair = vi.fn();
    await expect(removeRunnerWorkspaceWithRecovery(getWorkspace(), { remove, repair })).rejects.toThrow("no space");
    expect(repair).not.toHaveBeenCalled();
  });

  it("fails closed if the repair fails or the retry cannot delete", async () => {
    const error = Object.assign(new Error("denied"), { code: "EPERM" });
    await expect(removeRunnerWorkspaceWithRecovery(getWorkspace(), {
      remove: vi.fn().mockRejectedValue(error), repair: vi.fn().mockRejectedValue(new Error("helper failed")),
    })).rejects.toThrow("helper failed");
    const remove = vi.fn().mockRejectedValue(error);
    await expect(removeRunnerWorkspaceWithRecovery(getWorkspace(), {
      remove, repair: vi.fn().mockResolvedValue(undefined),
    })).rejects.toThrow("denied");
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("confines the helper to one read-only-rootfs, networkless workspace bind", async () => {
    const workspace = getWorkspace();
    await fs.mkdir(workspace);
    await repairRunnerWorkspaceForRemoval(workspace);
    expect(fixture.createContainer).toHaveBeenCalledTimes(1);
    const opts = fixture.createContainer.mock.calls[0][0];
    expect(opts.HostConfig.Binds).toEqual([`${workspace}:/workspace:rw`]);
    expect(opts.HostConfig.NetworkMode).toBe("none");
    expect(opts.HostConfig.Privileged).toBe(false);
    expect(opts.HostConfig.ReadonlyRootfs).toBe(true);
    expect(opts.HostConfig.CapDrop).toEqual(["ALL"]);
    expect(opts.HostConfig.CapAdd).toEqual(["CHOWN", "DAC_OVERRIDE", "FOWNER"]);
    expect(opts.HostConfig.SecurityOpt).toEqual(["no-new-privileges:true"]);
    expect(opts.Cmd[1]).toContain("find /workspace -xdev -type d");
    expect(opts.Cmd[1]).not.toContain("chmod -R 777");
    expect(opts.User).toBe("0:0");
  });

  it("rejects non-workspace paths, symlinked workspaces and nested paths before Docker", async () => {
    const unrelated = path.join(root, "other");
    await fs.mkdir(unrelated);
    await expect(repairRunnerWorkspaceForRemoval(unrelated)).rejects.toThrow("non-allocated");
    const link = getWorkspace();
    await fs.symlink(unrelated, link);
    await expect(repairRunnerWorkspaceForRemoval(link)).rejects.toThrow("symlink");
    await expect(repairRunnerWorkspaceForRemoval(path.join(link, "node_modules"))).rejects.toThrow("non-allocated");
    expect(fixture.createContainer).not.toHaveBeenCalled();
  });

  it("fails closed if the trusted helper exits unsuccessfully", async () => {
    await fs.mkdir(getWorkspace());
    fixture.createContainer.mockImplementation(async () => ({
      start: async () => undefined,
      wait: async () => ({ StatusCode: 31 }),
      remove: async () => undefined,
    }));
    await expect(repairRunnerWorkspaceForRemoval(getWorkspace())).rejects.toThrow("exit 31");
  });

  it("builds a bounded helper with no learner access", () => {
    const opts = buildRunnerReclamationOptions(getWorkspace());
    expect(opts.OpenStdin).toBe(false);
    expect(opts.Tty).toBe(false);
    expect(opts.HostConfig.PidsLimit).toBe(16);
    expect(opts.HostConfig.Memory).toBe(128 * 1024 * 1024);
    expect(opts.Labels["com.zoeskoul.runner.purpose"]).toBe("workspace-reclamation");
  });
});
