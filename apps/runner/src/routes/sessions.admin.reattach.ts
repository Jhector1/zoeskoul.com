import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession } from "../services/sessions/sessionStore.js";
import { adminLabSwitchStatus } from "../services/execution/learningAdminSwitch.js";
import { renewalEligible } from "../services/execution/adminEgressRenewal.js";
import { mayAttachGlobalAdminShell } from "../services/execution/adminReattachPolicy.js";

/** Service-authenticated authorization only. The Web service mints a fresh
 * single-use attach token after this check. No start, touch or Docker operation. */
export const reattachAdminSessionRoute: RequestHandler = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const actorKey = getRequiredActorKey(req);
    const sid = String(req.params.sessionId);
    const session = getSession(sid);
    if (!renewalEligible(process.env) ||
        !mayAttachGlobalAdminShell(session, actorKey, adminLabSwitchStatus().enabled, Date.now())) {
      return res.status(403).json({ ok: false, error: "Administrative lab unavailable." });
    }
    return res.status(200).json({ ok: true, sessionId: sid, state: session!.state });
  } catch {
    return res.status(403).json({ ok: false, error: "Administrative lab unavailable." });
  }
};
