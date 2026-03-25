import type { RequestHandler } from "express";
import { writeInput } from "../services/docker/writeInput";

export const inputSessionRoute: RequestHandler = async (req, res) => {
    try {
        const sessionId = String(req.params.sessionId);
        await writeInput(sessionId, String(req.body?.input ?? ""));
        res.status(200).json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message ?? "Failed to send input." });
    }
};