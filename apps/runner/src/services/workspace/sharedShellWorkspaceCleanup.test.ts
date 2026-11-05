import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./createWorkspace.js", () => ({ createWorkspace: vi.fn() }));
import { createWorkspace } from "./createWorkspace.js";
import {
  __resetSharedShellWorkspacesForTests,
  acquireSharedShellWorkspace,
  releaseSharedShellWorkspaceReservation,
  retireSharedShellWorkspaceForCleanup,
} from "./sharedShellWorkspace.js";

const create = vi.mocked(createWorkspace);

describe("P3B5D shared workspace retirement", () => {
  let root: string;
  let count: number;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "p3b5d-reservation-"));
    count = 0;
    __resetSharedShellWorkspacesForTests();
    create.mockReset();
    create.mockImplementation(async () => {
      const dir = path.join(root, `workspace-${++count}`);
      await fs.mkdir(dir);
      return dir;
    });
  });

  afterEach(async () => {
    __resetSharedShellWorkspacesForTests();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("refuses retirement with a pending start and allocates new space after retirement", async () => {
    const request = { ownerKey: "owner", workspaceKey: "project", files: [] };
    const first = await acquireSharedShellWorkspace(request);
    expect(retireSharedShellWorkspaceForCleanup(first.workspaceDir)).toBe(false);
    await releaseSharedShellWorkspaceReservation({ reservation: first, keepWorkspace: true });
    expect(retireSharedShellWorkspaceForCleanup(first.workspaceDir)).toBe(true);
    const second = await acquireSharedShellWorkspace(request);
    expect(second.workspaceDir).not.toBe(first.workspaceDir);
    expect(create).toHaveBeenCalledTimes(2);
    await releaseSharedShellWorkspaceReservation({ reservation: second, keepWorkspace: true });
  });
});
