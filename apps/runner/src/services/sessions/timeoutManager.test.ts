import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countActiveSessionsForActor,
  createSession,
  deleteSession,
  getSession,
  pushEvent,
} from "./sessionStore.js";
import { runSessionCleanupSweep } from "./timeoutManager.js";

vi.mock("../docker/killSession.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../docker/killSession.js");
  return {
    ...actual,
    killSession: vi.fn(async (sessionId: string, finalState = "timed_out") => {
      pushEvent(sessionId, { type: "status", state: finalState as any });
    }),
  };
});

const SESSION_ID = "timeout-test-idle";

afterEach(() => {
  deleteSession(SESSION_ID);
  vi.clearAllMocks();
});

describe("runSessionCleanupSweep", () => {
  it("removes an idle session from the active count", async () => {
    createSession({
      id: SESSION_ID,
      ownerKey: "idle-actor",
      containerId: "idle-container",
      workspaceDir: "/tmp/timeout-test-idle",
      idleTimeoutMs: 1_000,
      hardLifetimeMs: 10_000,
    });

    const session = getSession(SESSION_ID);
    expect(session).not.toBeNull();
    if (!session) {
      throw new Error("Expected session to exist.");
    }

    session.lastActivityAt = Date.now() - 5_000;

    await runSessionCleanupSweep(Date.now());

    expect(countActiveSessionsForActor("idle-actor")).toBe(0);
    expect(getSession(SESSION_ID)?.state).toBe("timed_out");
  });
});


describe("extended administrator session lifetime", () => {
  const idle = 30 * 60_000;
  const hard = 120 * 60_000;
  function adminSession(now: number, age: number, inactivity: number) {
    createSession({id: SESSION_ID, ownerKey: "idle-actor", containerId: "idle-container", workspaceDir: "", labMode: "admin", idleTimeoutMs: idle, hardLifetimeMs: hard});
    const session = getSession(SESSION_ID)!;
    session.createdAt = now - age;
    session.lastActivityAt = now - inactivity;
  }
  it("does not close a 90 minute lab with recent activity", async () => {
    const now = Date.now(); adminSession(now, 90 * 60_000, 60_000);
    await runSessionCleanupSweep(now);
    expect(getSession(SESSION_ID)?.state).not.toBe("timed_out");
  });
  it("still closes an inactive lab at 30 minutes", async () => {
    const now = Date.now(); adminSession(now, idle, idle);
    await runSessionCleanupSweep(now);
    expect(getSession(SESSION_ID)?.state).toBe("timed_out");
  });
  it("cannot extend the two-hour hard limit through activity", async () => {
    const now = Date.now(); adminSession(now, hard, 0);
    await runSessionCleanupSweep(now);
    expect(getSession(SESSION_ID)?.state).toBe("timed_out");
  });
});
