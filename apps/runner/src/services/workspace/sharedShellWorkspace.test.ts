import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSession, deleteSession } from "../sessions/sessionStore.js";
import {
  __resetSharedShellWorkspacesForTests,
  acquireSharedShellWorkspace,
  releaseSharedShellWorkspaceReservation,
} from "./sharedShellWorkspace.js";

const SESSION_IDS = ["shared-workspace-a", "shared-workspace-b"];

afterEach(async () => {
  for (const id of SESSION_IDS) deleteSession(id);
  __resetSharedShellWorkspacesForTests();
});

describe("shared shell workspaces", () => {
  it("gives terminals in one IDE workspace the same filesystem", async () => {
    const first = await acquireSharedShellWorkspace({
      ownerKey: "actor",
      workspaceKey: "host-a::project-a",
      files: [{ kind: "file", path: "main.py", content: "print('one')\n" }],
    });

    createSession({
      id: "shared-workspace-a",
      ownerKey: "actor",
      kind: "shell",
      workspaceKey: "host-a::project-a",
      containerId: "container-a",
      workspaceDir: first.workspaceDir,
    });
    await releaseSharedShellWorkspaceReservation({
      reservation: first,
      keepWorkspace: true,
    });

    await fs.writeFile(path.join(first.workspaceDir, "from-terminal-one.txt"), "hello");

    const second = await acquireSharedShellWorkspace({
      ownerKey: "actor",
      workspaceKey: "host-a::project-a",
      files: [{ kind: "file", path: "main.py", content: "should not overwrite" }],
    });

    expect(second.workspaceDir).toBe(first.workspaceDir);
    await expect(
      fs.readFile(path.join(second.workspaceDir, "from-terminal-one.txt"), "utf8"),
    ).resolves.toBe("hello");
    await expect(
      fs.readFile(path.join(second.workspaceDir, "main.py"), "utf8"),
    ).resolves.toBe("print('one')\n");

    await releaseSharedShellWorkspaceReservation({
      reservation: second,
      keepWorkspace: true,
    });
    await fs.rm(first.workspaceDir, { recursive: true, force: true });
  });

  it("keeps separate browser hosts in separate filesystems", async () => {
    const first = await acquireSharedShellWorkspace({
      ownerKey: "actor",
      workspaceKey: "host-a::project-a",
      files: [{ kind: "file", path: "main.py", content: "host a" }],
    });
    const second = await acquireSharedShellWorkspace({
      ownerKey: "actor",
      workspaceKey: "host-b::project-a",
      files: [{ kind: "file", path: "main.py", content: "host b" }],
    });

    expect(second.workspaceDir).not.toBe(first.workspaceDir);

    await releaseSharedShellWorkspaceReservation({ reservation: first, keepWorkspace: false });
    await releaseSharedShellWorkspaceReservation({ reservation: second, keepWorkspace: false });
  });
});
