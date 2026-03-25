import type { RequestHandler } from "express";
import { getSession } from "../services/sessions/sessionStore";

export const streamSessionRoute: RequestHandler = async (req, res) => {
    const sessionId = String(req.params.sessionId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("Connection", "keep-alive");

    let lastSeq = 0;

    const timer = setInterval(() => {
        const session = getSession(sessionId);

        if (!session) {
            res.write(`event: error\ndata: ${JSON.stringify({ message: "Session not found." })}\n\n`);
            clearInterval(timer);
            res.end();
            return;
        }

        const unseen = session.events.filter((ev) => ev.seq > lastSeq);
        for (const ev of unseen) {
            lastSeq = ev.seq;
            res.write(`data: ${JSON.stringify(ev)}\n\n`);
        }

        if (
            session.state === "completed" ||
            session.state === "failed" ||
            session.state === "canceled" ||
            session.state === "timed_out"
        ) {
            clearInterval(timer);
            res.end();
        }
    }, 100);

    req.on("close", () => {
        clearInterval(timer);
    });
};