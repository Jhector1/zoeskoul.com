import type { RequestHandler } from "express";
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
    const sessionId = String(req.params.sessionId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders?.();

    let lastSeq = 0;

    const flush = () => {
        const session = getSession(sessionId);

        if (!session) {
            res.write(
                `event: error\ndata: ${JSON.stringify({ message: "Session not found." })}\n\n`,
            );
            cleanup();
            res.end();
            return;
        }

        const unseen = session.events.filter((ev) => ev.seq > lastSeq);
        for (const ev of unseen) {
            lastSeq = ev.seq;
            res.write(`data: ${JSON.stringify(ev)}\n\n`);
        }

        if (isTerminalState(session.state)) {
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
};