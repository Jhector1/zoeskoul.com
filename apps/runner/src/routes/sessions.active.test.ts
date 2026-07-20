import { afterEach, describe, expect, it, vi } from "vitest";
import { activeSessionsRoute } from "./sessions.active.js";
import {
  createSession,
  deleteSession,
  pushEvent,
  reserveSessionSlot,
} from "../services/sessions/sessionStore.js";
import { env } from "../lib/env.js";

const IDS = ["active-route-a", "active-route-b", "active-route-closed"];

function makeReq(actorKey: string) {
  return {
    header: vi.fn((name: string) =>
      String(name).toLowerCase() === "x-actor-key" ? actorKey : "",
    ),
  } as any;
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };

  return res;
}

afterEach(() => {
  for (const id of IDS) deleteSession(id);
});

describe("activeSessionsRoute", () => {
  it("returns runner-authoritative capacity and browser ownership metadata", () => {
    createSession({
      id: "active-route-a",
      ownerKey: "actor-a",
      kind: "shell",
      workspaceKey: "runner-workspace",
      clientHostKey: "browser-host",
      clientOwnerKey: "terminal-owner",
      clientWorkspaceKey: "lesson-workspace",
      containerId: "container-a",
      workspaceDir: "/tmp/active-route-a",
    });
    createSession({
      id: "active-route-b",
      ownerKey: "actor-b",
      kind: "shell",
      containerId: "container-b",
      workspaceDir: "/tmp/active-route-b",
    });
    createSession({
      id: "active-route-closed",
      ownerKey: "actor-a",
      kind: "shell",
      containerId: "container-closed",
      workspaceDir: "/tmp/active-route-closed",
    });
    pushEvent("active-route-closed", { type: "status", state: "canceled" });

    const releasePending = reserveSessionSlot("actor-a");
    const res = makeRes();

    try {
      activeSessionsRoute(makeReq("actor-a"), res, vi.fn());
    } finally {
      releasePending();
    }

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      ok: true,
      activeCount: 2,
      activeSessionCount: 1,
      pendingStartCount: 1,
      maxActiveSessions: env.maxConcurrentPerActor,
      sessions: [
        expect.objectContaining({
          sessionId: "active-route-a",
          state: "queued",
          kind: "shell",
          workspaceKey: "runner-workspace",
          clientHostKey: "browser-host",
          clientOwnerKey: "terminal-owner",
          clientWorkspaceKey: "lesson-workspace",
        }),
      ],
    });
  });
});
