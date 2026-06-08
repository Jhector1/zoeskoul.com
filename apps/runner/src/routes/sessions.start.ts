import type { RequestHandler } from "express";
import { interactiveRunReqSchema } from "@zoeskoul/code-contracts";
import { startDockerSession } from "../services/docker/startDockerSession.js";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { consumeStartToken } from "../services/sessions/startRateLimit.js";

function statusForError(message: string) {
  if (message === "Unauthorized") return 401;
  if (message.includes("Too many") || message.includes("Runner is busy"))
    return 429;
  if (
    message.includes("Workspace limit") ||
    message.includes("Unsafe path") ||
    message.includes("Unsupported file type") ||
    message.includes("Duplicate path")
  ) {
    return 400;
  }
  if (
    message.includes("disk is low") ||
    message.includes("workspace root is over quota")
  )
    return 503;
  return 500;
}

export const startSessionRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    consumeStartToken(actorKey);

    const body = interactiveRunReqSchema.parse(req.body);
    const out = await startDockerSession(body, actorKey);

    if (out.ok) {
      return res.status(200).json(out);
    }

    return res.status(400).json(out);
  } catch (e: any) {
    const message = e?.message ?? "Failed to start session.";

    return res.status(statusForError(message)).json({
      ok: false,
      error: message,
    });
  }
};
