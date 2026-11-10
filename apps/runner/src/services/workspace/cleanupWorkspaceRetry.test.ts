import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../execution/adminWorkspaceVolume.js", () => ({
  removeAdminWorkspaceVolume: vi.fn(),
}));
vi.mock("../docker/runnerWorkspaceReclamation.js", () => ({
  removeRunnerWorkspaceWithRecovery: vi.fn(),
}));

import { removeRunnerWorkspaceWithRecovery } from "../docker/runnerWorkspaceReclamation.js";
import { removeAdminWorkspaceVolume } from "../execution/adminWorkspaceVolume.js";
import { createSession, deleteSession, getSession, pushEvent } from "../sessions/sessionStore.js";
import { runSessionCleanupSweep } from "../sessions/timeoutManager.js";
import {
  cancelScheduledWorkspaceCleanup,
  runScheduledWorkspaceCleanupNow,
  scheduleWorkspaceCleanup,
} from "./cleanupWorkspace.js";

const remove = vi.mocked(removeRunnerWorkspaceWithRecovery);
const removeAdmin = vi.mocked(removeAdminWorkspaceVolume);
const ids = ["p3b5d-retry", "p3b5d-same-a", "p3b5d-same-b", "p3b5d-pending", "sess_11111111-1111-4111-8111-111111111111"];

describe("P3B5D retryable session workspace cleanup", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "p3b5d-cleanup-"));
    remove.mockReset();
    removeAdmin.mockReset();
    removeAdmin.mockResolvedValue(undefined);
    remove.mockImplementation(async (dir) => fs.rm(dir, { recursive: true, force: true }));
  });

  afterEach(async () => {
    for (const id of ids) {
      cancelScheduledWorkspaceCleanup(id);
      deleteSession(id);
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  it("retains the session after a failed removal and retries after bounded backoff", async () => {
    const id = ids[0];
    const workspaceDir = path.join(root, "workspace");
    await fs.mkdir(workspaceDir);
    createSession({ id, workspaceDir, containerId: "not-running", ownerKey: "owner" });
    scheduleWorkspaceCleanup(id, workspaceDir, 100_000);

    remove.mockRejectedValueOnce(new Error("/private/path/secret: EACCES"));
    await expect(runScheduledWorkspaceCleanupNow(id)).rejects.toThrow("deferred for retry");
    const retained = getSession(id);
    expect(retained?.cleanupFailures).toBe(1);
    expect(retained?.cleanupRetryAt).toBeGreaterThan(Date.now());
    await expect(fs.access(workspaceDir)).resolves.toBeUndefined();

    await runScheduledWorkspaceCleanupNow(id); // Backoff: no redundant deletion.
    expect(remove).toHaveBeenCalledTimes(1);
    await runScheduledWorkspaceCleanupNow(id, retained!.cleanupRetryAt! + 1);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(getSession(id)).toBeNull();
    await expect(fs.access(workspaceDir)).rejects.toThrow();
  });

  it("coalesces concurrent requests and deletes a shared directory only once", async () => {
    const workspaceDir = path.join(root, "shared");
    await fs.mkdir(workspaceDir);
    for (const id of ids.slice(1, 3)) {
      createSession({ id, workspaceDir, containerId: `container-${id}`, ownerKey: "owner" });
      scheduleWorkspaceCleanup(id, workspaceDir, 100_000);
    }
    await runScheduledWorkspaceCleanupNow(ids[1]);
    expect(getSession(ids[1])).toBeNull();
    expect(getSession(ids[2])).not.toBeNull();
    expect(remove).toHaveBeenCalledTimes(0);

    let finish!: () => void;
    remove.mockImplementationOnce(async (dir) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      await fs.rm(dir, { recursive: true, force: true });
    });
    const first = runScheduledWorkspaceCleanupNow(ids[2]);
    const second = runScheduledWorkspaceCleanupNow(ids[2]);
    expect(remove).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(getSession(ids[2])).toBeNull();
  });

  it("retains administrator volume ownership when removal fails, then retries",async()=>{
    const id = ids[4];
    const volume = `zoeskoul-admin-ws-${id}`;
    createSession({id, containerId:"container", workspaceDir:"", labMode:"admin",adminVolumeName:volume});
    scheduleWorkspaceCleanup(id,"",100_000);
    removeAdmin.mockRejectedValueOnce(new Error("volume still in use"));
    await expect(runScheduledWorkspaceCleanupNow(id)).rejects.toThrow("deferred for retry");
    const retained=getSession(id)!;
    expect(retained.adminVolumeName).toBe(volume);
    expect(retained.cleanupFailures).toBe(1);
    await runScheduledWorkspaceCleanupNow(id,retained.cleanupRetryAt!+1);
    expect(getSession(id)).toBeNull();
    expect(removeAdmin).toHaveBeenCalledTimes(2);
  });

  it("keeps sweeping unrelated finalized sessions when one cleanup fails", async () => {
    const firstId = ids[0];
    const secondId = ids[3];
    const failedDir = path.join(root, "failed");
    const otherDir = path.join(root, "successful");
    await fs.mkdir(failedDir);
    await fs.mkdir(otherDir);
    createSession({ id: firstId, workspaceDir: failedDir, containerId: "none" });
    createSession({ id: secondId, workspaceDir: otherDir, containerId: "none" });
    pushEvent(firstId, { type: "status", state: "completed" });
    pushEvent(secondId, { type: "status", state: "completed" });
    const first = scheduleWorkspaceCleanup(firstId, failedDir, 100_000);
    const second = scheduleWorkspaceCleanup(secondId, otherDir, 100_000);

    remove.mockRejectedValueOnce(new Error("private source path"));
    await runSessionCleanupSweep(Math.max(first.expiresAt, second.expiresAt) + 1);
    expect(getSession(firstId)).not.toBeNull();
    expect(getSession(firstId)?.cleanupFailures).toBe(1);
    expect(getSession(secondId)).toBeNull();
    await expect(fs.access(failedDir)).resolves.toBeUndefined();
    await expect(fs.access(otherDir)).rejects.toThrow();
  });

  it("does not delete a workspace while another session still owns it", async () => {
    const workspaceDir = path.join(root, "active-shared");
    await fs.mkdir(workspaceDir);
    for (const id of ids.slice(1, 3)) {
      createSession({ id, workspaceDir, containerId: `container-${id}` });
    }
    scheduleWorkspaceCleanup(ids[1], workspaceDir, 100_000);
    await runScheduledWorkspaceCleanupNow(ids[1]);
    expect(getSession(ids[1])).toBeNull();
    expect(getSession(ids[2])).not.toBeNull();
    expect(remove).not.toHaveBeenCalled();
    await expect(fs.access(workspaceDir)).resolves.toBeUndefined();
  });
});
