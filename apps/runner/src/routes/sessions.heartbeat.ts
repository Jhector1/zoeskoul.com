import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import {
  getSession,
  isTerminalState,
  touchSession,
} from "../services/sessions/sessionStore.js";

export const heartbeatSessionRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const sessionId = String(req.params.sessionId);
    const session = getSession(sessionId);

    if (!session) {
      return res.status(404).json({ ok: false, error: "Session not found." });
    }

    if (session.ownerKey !== actorKey) {
      return res.status(403).json({ ok: false, error: "Forbidden." });
    }

    if (isTerminalState(session.state)) {
      return res.status(410).json({
        ok: false,
        error: "Session is no longer active.",
        state: session.state,
      });
    }

    touchSession(sessionId);
    return res.status(200).json({ ok: true, state: session.state });
  } catch (error: any) {
    const message = error?.message ?? "Failed to heartbeat session.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({
      ok: false,
      error: message,
    });
  }
};
