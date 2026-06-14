import { afterEach, describe, expect, it } from "vitest";
import {
  countActiveSessionsForActor,
  createSession,
  deleteSession,
  pushEvent,
  reserveSessionSlot,
} from "./sessionStore.js";
import { env } from "../../lib/env.js";

const SESSION_IDS = [
  "store-test-active-1",
  "store-test-active-2",
  "store-test-active-3",
  "store-test-active-4",
  "store-test-closed-1",
  "store-test-closed-2",
];

afterEach(() => {
  for (const id of SESSION_IDS) {
    deleteSession(id);
  }
});

describe("sessionStore active counting", () => {
  it("removes closed sessions from the active count", () => {
    createSession({
      id: "store-test-closed-1",
      ownerKey: "actor-a",
      containerId: "container-a",
      workspaceDir: "/tmp/store-test-closed-1",
    });

    expect(countActiveSessionsForActor("actor-a")).toBe(1);

    pushEvent("store-test-closed-1", { type: "status", state: "completed" });

    expect(countActiveSessionsForActor("actor-a")).toBe(0);
  });

  it("rejects only truly active sessions for the per-user limit", () => {
    const ownerKey = "actor-limit";

    createSession({
      id: "store-test-active-1",
      ownerKey,
      containerId: "container-1",
      workspaceDir: "/tmp/store-test-active-1",
    });
    createSession({
      id: "store-test-active-2",
      ownerKey,
      containerId: "container-2",
      workspaceDir: "/tmp/store-test-active-2",
    });
    createSession({
      id: "store-test-active-3",
      ownerKey,
      containerId: "container-3",
      workspaceDir: "/tmp/store-test-active-3",
    });

    createSession({
      id: "store-test-closed-2",
      ownerKey,
      containerId: "container-closed",
      workspaceDir: "/tmp/store-test-closed-2",
    });
    pushEvent("store-test-closed-2", { type: "status", state: "canceled" });

    expect(countActiveSessionsForActor(ownerKey)).toBe(3);

    const release = reserveSessionSlot(ownerKey);
    release();

    createSession({
      id: "store-test-active-4",
      ownerKey,
      containerId: "container-4",
      workspaceDir: "/tmp/store-test-active-4",
    });

    expect(() => reserveSessionSlot(ownerKey)).toThrow(
      `Too many active sessions. Limit is ${env.maxConcurrentPerActor} per user.`,
    );
  });
});
