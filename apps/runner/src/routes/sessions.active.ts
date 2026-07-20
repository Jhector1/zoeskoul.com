import type { RequestHandler } from "express";
import type { RunSessionState } from "@zoeskoul/code-contracts";
import { env } from "../lib/env.js";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import {
  countActiveSessionsForActor,
  getActiveSessionsForActor,
} from "../services/sessions/sessionStore.js";

export type ActiveRunnerSession = {
  sessionId: string;
  state: RunSessionState;
  kind: "code" | "shell" | null;
  workspaceKey: string | null;
  clientHostKey: string | null;
  clientOwnerKey: string | null;
  clientWorkspaceKey: string | null;
  createdAt: number;
  lastActivityAt: number;
};

export type ActiveRunnerSessionsResult = {
  ok: true;
  activeCount: number;
  activeSessionCount: number;
  pendingStartCount: number;
  maxActiveSessions: number;
  sessions: ActiveRunnerSession[];
};

export const activeSessionsRoute: RequestHandler = (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const sessions = getActiveSessionsForActor(actorKey);
    const activeCount = countActiveSessionsForActor(actorKey);

    return res.status(200).json({
      ok: true,
      activeCount,
      activeSessionCount: sessions.length,
      pendingStartCount: Math.max(0, activeCount - sessions.length),
      maxActiveSessions: env.maxConcurrentPerActor,
      sessions: sessions.map((session) => ({
        sessionId: session.id,
        state: session.state,
        kind: session.kind ?? null,
        workspaceKey: session.workspaceKey ?? null,
        clientHostKey: session.clientHostKey ?? null,
        clientOwnerKey: session.clientOwnerKey ?? null,
        clientWorkspaceKey: session.clientWorkspaceKey ?? null,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      })),
    } satisfies ActiveRunnerSessionsResult);
  } catch (error: any) {
    const status = error?.message === "Forbidden." ? 403 : 500;
    return res.status(status).json({
      ok: false,
      error: error?.message ?? "Failed to read active sessions.",
    });
  }
};
