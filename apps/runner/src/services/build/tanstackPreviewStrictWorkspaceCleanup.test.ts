import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../docker/runnerWorkspaceReclamation.js", () => ({
  removeRunnerWorkspaceWithRecovery: vi.fn(),
}));

import { removeRunnerWorkspaceWithRecovery } from "../docker/runnerWorkspaceReclamation.js";
import { removeTanstackWorkspaceStrict } from "./tanstackPreviewDurableRecovery.js";

const UUID = "12345678-1234-4234-8234-123456789abc";
const recovery = vi.mocked(removeRunnerWorkspaceWithRecovery);
let root: string;
let workspace: string;

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "p3b3-strict-cleanup-")));
  workspace = path.join(root, `zoeskoul-run-${UUID}`);
  await fs.mkdir(workspace);
  recovery.mockReset();
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("TanStack strict workspace cleanup with shared rootless reclamation", () => {
  it("delegates to the canonical rootless recovery helper and verifies deletion", async () => {
    await fs.mkdir(path.join(workspace, "node_modules"));
    await fs.writeFile(path.join(workspace, "node_modules", "sample"), "private fixture");
    recovery.mockImplementation(async dir => fs.rm(dir, { recursive: true, force: true }));

    await removeTanstackWorkspaceStrict(root, workspace);

    expect(recovery).toHaveBeenCalledTimes(1);
    expect(recovery).toHaveBeenCalledWith(workspace);
    await expect(fs.lstat(workspace)).rejects.toMatchObject({ code: "ENOENT" });
    await removeTanstackWorkspaceStrict(root, workspace);
    expect(recovery).toHaveBeenCalledTimes(1);
  });

  it("keeps a surviving workspace quarantined if the repair helper fails", async () => {
    recovery.mockRejectedValue(Object.assign(new Error("fixture permission refused"), { code: "EPERM" }));

    await expect(removeTanstackWorkspaceStrict(root, workspace)).rejects.toThrow("fixture permission refused");
    expect(recovery).toHaveBeenCalledTimes(1);
    expect((await fs.lstat(workspace)).isDirectory()).toBe(true);
  });

  it("fails closed if recovery reports success without removing the directory", async () => {
    recovery.mockResolvedValue(undefined);

    await expect(removeTanstackWorkspaceStrict(root, workspace)).rejects.toThrow("unverified");
    expect((await fs.lstat(workspace)).isDirectory()).toBe(true);
  });

  it("rejects unsafe paths and symlinks before invoking the privileged helper", async () => {
    const unrelated = path.join(root, "unrelated");
    await fs.mkdir(unrelated);
    const symlink = path.join(root, "zoeskoul-run-22222222-2222-4222-8222-222222222222");
    await fs.symlink(workspace, symlink);

    await expect(removeTanstackWorkspaceStrict(root, unrelated)).rejects.toThrow("identity");
    await expect(removeTanstackWorkspaceStrict(root, symlink)).rejects.toThrow("Unsafe");
    expect(recovery).not.toHaveBeenCalled();
    expect((await fs.lstat(workspace)).isDirectory()).toBe(true);
  });
});
