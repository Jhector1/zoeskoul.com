import type { RequestHandler } from "express";
import type { InteractiveRunReq } from "@zoeskoul/code-contracts";
import { startDockerSession } from "../services/docker/startDockerSession";

export const startSessionRoute: RequestHandler = async (req, res) => {
    try {
        const body = req.body as InteractiveRunReq;
        const out = await startDockerSession(body);
        res.status(out.ok ? 200 : 400).json(out);
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e?.message ?? "Failed to start session." });
    }
};