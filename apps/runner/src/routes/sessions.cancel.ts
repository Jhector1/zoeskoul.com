import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession, pushEvent } from "../services/sessions/sessionStore.js";
import { killContainer } from "../services/executor/dockerCliExecutor.js";

export const cancelSessionRoute: RequestHandler = async (req, res) => {
    try {
        const actorKey = getRequiredActorKey(req);
        const sessionId = String(req.params.sessionId);

        const session = getSession(sessionId);
        if (!session) return res.json({ ok: true });
        if (session.ownerKey !== actorKey) throw new Error("Forbidden.");

        pushEvent(sessionId, { type: "status", state: "canceled" });
        await killContainer(session.containerId);

        return res.json({ ok: true });
    } catch (e: any) {
        const message = e?.message ?? "Failed to cancel.";
        return res.status(message === "Forbidden." ? 403 : 500).json({
            ok: false,
            error: message,
        });
    }
};