import type { RequestHandler } from "express";
import { batchRunReqSchema } from "@zoeskoul/code-contracts";

import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { runDockerBatch } from "../services/docker/runDockerBatch.js";

function statusForError(message: string) {
  if (message === "Unauthorized" || message === "Forbidden.") return 403;
  if (message.includes("Too many") || message.includes("Runner is busy")) return 429;
  if (
    message.includes("Unsafe") ||
    message.includes("Workspace limit") ||
    message.includes("requires") ||
    message.includes("Unsupported")
  ) return 400;
  if (message.includes("disk is low") || message.includes("over quota")) return 503;
  return 500;
}

export const executeRunRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const parsed = batchRunReqSchema.parse(req.body);
    const result = await runDockerBatch(parsed, actorKey);
    return res.status(200).json(result);
  } catch (error: any) {
    const message = error?.message ?? "Runner batch execution failed.";
    return res.status(statusForError(message)).json({ ok: false, error: message });
  }
};
