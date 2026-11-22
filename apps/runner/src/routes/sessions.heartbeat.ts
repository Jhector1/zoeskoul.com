import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { isGlobalAdminShell, mayAttachGlobalAdminShell } from "../services/execution/adminReattachPolicy.js";
import { adminLabSwitchStatus } from "../services/execution/learningAdminSwitch.js";
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

    if (isGlobalAdminShell(session)) {
      if (!mayAttachGlobalAdminShell(session, actorKey,
          process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED === "true" && adminLabSwitchStatus().enabled, Date.now())) {
        return res.status(403).json({ ok: false, error: "Administrative lab unavailable." });
      }
    } else touchSession(sessionId);
    return res.status(200).json({ ok: true, state: session.state });
  } catch (error: any) {
    const message = error?.message ?? "Failed to heartbeat session.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({
      ok: false,
      error: message,
    });
  }
};
