import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession, touchSession } from "../services/sessions/sessionStore.js";
import { isGlobalAdminShell, mayAttachGlobalAdminShell } from "../services/execution/adminReattachPolicy.js";
import { adminLabSwitchStatus } from "../services/execution/learningAdminSwitch.js";

function visibleInput(s: string) {
    return s.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

export const inputSessionRoute: RequestHandler = async (req, res) => {
    try {
        const actorKey = getRequiredActorKey(req);
        const sessionId = String(req.params.sessionId);
        let input = String(req.body?.input ?? "");

        const session = getSession(sessionId);



        if (!session) {
            return res.status(404).json({
                ok: false,
                error: "Session not found.",
            });
        }

        if (session.ownerKey !== actorKey) {
            return res.status(403).json({
                ok: false,
                error: "Forbidden.",
            });
        }

        if (isGlobalAdminShell(session) && !mayAttachGlobalAdminShell(session, actorKey,
            process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED === "true" && adminLabSwitchStatus().enabled, Date.now())) {
            return res.status(403).json({ ok: false, error: "Administrative lab unavailable." });
        }
        if (!session.attachStream) {
            return res.status(400).json({
                ok: false,
                error: "Session is not accepting input.",
            });
        }

        input = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        session.attachStream.write(Buffer.from(input, "utf8"));
        touchSession(sessionId);

        return res.status(200).json({ ok: true });
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            error: e?.message ?? "Failed to send input.",
        });
    }
};