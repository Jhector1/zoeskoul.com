import type { RequestHandler } from "express";
import { killSession } from "../services/docker/killSession.js";

export const cancelSessionRoute: RequestHandler = async (req, res) => {
    try {
        const sessionId = String(req.params.sessionId);
        await killSession(sessionId);
        res.status(200).json({ ok: true });
    } catch (e: any) {
        res.status(500).json({
            ok: false,
            error: e?.message ?? "Failed to cancel session.",
        });
    }
};