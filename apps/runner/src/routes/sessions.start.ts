import type { RequestHandler } from "express";
import { interactiveRunReqSchema } from "@zoeskoul/code-contracts";
import { startDockerSession } from "../services/docker/startDockerSession.js";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";

export const startSessionRoute: RequestHandler = async (req, res) => {
    try {
        const actorKey = getRequiredActorKey(req);
        const body = interactiveRunReqSchema.parse(req.body);

        const out = await startDockerSession(body, actorKey);

        if (out.ok) {
            console.log("RUNNER START stored owner/session", {
                actorKey,
                sessionId: out.sessionId,
            });
            return res.status(200).json(out);
        }

        return res.status(400).json(out);
    } catch (e: any) {
        const message = e?.message ?? "Failed to start session.";
        const status = message === "Unauthorized" ? 401 : 500;

        return res.status(status).json({
            ok: false,
            error: message,
        });
    }
};