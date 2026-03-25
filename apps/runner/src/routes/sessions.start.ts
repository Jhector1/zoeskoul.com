import type { RequestHandler } from "express";
import { interactiveRunReqSchema } from "@zoeskoul/code-contracts";
import { startDockerSession } from "../services/docker/startDockerSession.js";

export const startSessionRoute: RequestHandler = async (req, res) => {
    try {
        console.log("RUNNER /sessions/start BODY", JSON.stringify(req.body, null, 2));

        const body = interactiveRunReqSchema.parse(req.body);
        const out = await startDockerSession(body);
        res.status(out.ok ? 200 : 400).json(out);
    } catch (e: any) {
        res.status(500).json({
            ok: false,
            error: e?.message ?? "Failed to start session.",
        });
    }
};