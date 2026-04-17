import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession, touchSession } from "../services/sessions/sessionStore.js";
import { docker } from "../services/docker/dockerClient.js";

export const resizeSessionRoute: RequestHandler = async (req, res) => {
    try {
        const actorKey = getRequiredActorKey(req);
        const sessionId = String(req.params.sessionId);
        const cols = Math.max(1, Math.floor(Number(req.body?.cols ?? 80)));
        const rows = Math.max(1, Math.floor(Number(req.body?.rows ?? 24)));

        const session = getSession(sessionId);

        if (!session) {
            console.log("resize auth", {
                actorKey,
                sessionOwnerKey: null,
                sessionId,
            });

            return res.status(404).json({
                ok: false,
                error: "Session not found.",
            });
        }

        console.log("resize auth", {
            actorKey,
            sessionOwnerKey: session.ownerKey ?? null,
            sessionId,
        });

        if (session.ownerKey !== actorKey) {
            return res.status(403).json({
                ok: false,
                error: "Forbidden.",
            });
        }

        const container = docker.getContainer(session.containerId);
        await container.resize({ w: cols, h: rows });

        touchSession(sessionId);

        return res.json({ ok: true });
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            error: e?.message ?? "Failed to resize session.",
        });
    }
};