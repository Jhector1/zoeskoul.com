import { describe, expect, it } from "vitest";
import type { SessionRecord } from "./sessionStore.js";
import { resolveOwnedShellSession } from "./ownedShellSession.js";

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-a",
    ownerKey: "actor-a",
    kind: "shell",
    workspaceKey: "runner-workspace-a",
    clientHostKey: "host-a",
    clientOwnerKey: "terminal-a",
    clientWorkspaceKey: "lesson-a",
    containerId: "container-a",
    workspaceDir: "/workspaces/a",
    state: "waiting_for_input",
    seq: 0,
    events: [],
    createdAt: 1,
    lastActivityAt: 1,
    ...overrides,
  };
}

describe("resolveOwnedShellSession", () => {
  it("reattaches the exact live terminal owner without replacing it", () => {
    const existing = session();
    const result = resolveOwnedShellSession({
      sessions: [existing],
      clientHostKey: "host-a",
      clientOwnerKey: "terminal-a",
      clientWorkspaceKey: "lesson-a",
      workspaceKey: "runner-workspace-a",
    });

    expect(result.reusable?.id).toBe(existing.id);
    expect(result.sessionsToCancel).toEqual([]);
  });

  it("replaces the same terminal owner when the authored workspace changes", () => {
    const existing = session();
    const result = resolveOwnedShellSession({
      sessions: [existing],
      clientHostKey: "host-a",
      clientOwnerKey: "terminal-a",
      clientWorkspaceKey: "lesson-b",
      workspaceKey: "runner-workspace-b",
    });

    expect(result.reusable).toBeNull();
    expect(result.sessionsToCancel.map((item) => item.id)).toEqual([existing.id]);
  });

  it("honors an explicit fresh-terminal restart", () => {
    const existing = session();
    const result = resolveOwnedShellSession({
      sessions: [existing],
      clientHostKey: "host-a",
      clientOwnerKey: "terminal-a",
      clientWorkspaceKey: "lesson-a",
      workspaceKey: "runner-workspace-a",
      forceNew: true,
    });

    expect(result.reusable).toBeNull();
    expect(result.sessionsToCancel.map((item) => item.id)).toEqual([existing.id]);
  });
});
