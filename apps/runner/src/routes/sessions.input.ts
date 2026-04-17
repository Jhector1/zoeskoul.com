import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession, touchSession } from "../services/sessions/sessionStore.js";

function visibleInput(s: string) {
    return s.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

export const inputSessionRoute: RequestHandler = async (req, res) => {
    try {
        const actorKey = getRequiredActorKey(req);
        const sessionId = String(req.params.sessionId);
        let input = String(req.body?.input ?? "");

        const session = getSession(sessionId);

        console.log("RUNNER INPUT", {
            actorKey,
            sessionId,
            input: visibleInput(input),
            hasSession: Boolean(session),
            ownerKey: session?.ownerKey ?? null,
            hasAttachStream: Boolean(session?.attachStream),
        });

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