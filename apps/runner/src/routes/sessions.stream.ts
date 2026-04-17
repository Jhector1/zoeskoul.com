import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession } from "../services/sessions/sessionStore.js";

function isTerminalState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

export const streamSessionRoute: RequestHandler = async (req, res) => {
    try {
        const actorKey = getRequiredActorKey(req);
        const sessionId = String(req.params.sessionId);

        const session = getSession(sessionId);

        console.log("RUNNER STREAM auth", {
            actorKey,
            sessionId,
            ownerKey: session?.ownerKey ?? null,
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

        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        let lastSeq = 0;

        const flush = () => {
            const current = getSession(sessionId);

            if (!current) {
                cleanup();
                res.end();
                return;
            }

            if (current.ownerKey !== actorKey) {
                cleanup();
                res.end();
                return;
            }

            const unseen = current.events.filter((ev) => ev.seq > lastSeq);
            for (const ev of unseen) {
                lastSeq = ev.seq;
                res.write(`data: ${JSON.stringify(ev)}\n\n`);
            }

            if (isTerminalState(current.state)) {
                cleanup();
                res.end();
            }
        };

        const pollTimer = setInterval(flush, 100);
        const heartbeatTimer = setInterval(() => {
            res.write(": keepalive\n\n");
        }, 15000);

        function cleanup() {
            clearInterval(pollTimer);
            clearInterval(heartbeatTimer);
        }

        flush();

        req.on("close", () => {
            cleanup();
        });
    } catch (e: any) {
        const message = e?.message ?? "Failed to stream session.";
        const status = message === "Unauthorized" ? 401 : 500;

        return res.status(status).json({
            ok: false,
            error: message,
        });
    }
};