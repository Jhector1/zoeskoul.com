import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { AdminGrantError, verifyAdminGrant } from "../services/execution/learningAdminGrant.js";
import { startDockerAdminSession } from "../services/docker/startDockerSession.js";
import { validLearningWindow } from "../services/sessions/learningWindowOwnership.js";
import { statusForError } from "./sessions.start.js";

/** Operator/trusted-backend endpoint. The public web PTY API never calls it. */
export const startAdminSessionRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        !(Object.keys(body).length === 1 && body.windowId === undefined ||
          Object.keys(body).length === 2 && validLearningWindow(body.windowId)) || typeof body.grant !== "string") {
      return res.status(400).json({ ok: false, error: "A signed admin lab grant is required." });
    }
    const grant = verifyAdminGrant(body.grant, actorKey);
    if (body.windowId !== undefined && grant.topicSlug !== "full-privileges") {
      return res.status(403).json({ ok: false, error: "Administrative lab ownership unavailable." });
    }
    const out = await startDockerAdminSession(ownerKeyOrReject(actorKey), grant, body.windowId);
    return res.status(out.ok ? 200 : statusForError(out.error)).json(out);
  } catch (error) {
    const status = error instanceof AdminGrantError ? error.status : 500;
    return res.status(status).json({ ok: false,
      error: error instanceof Error ? error.message : "Unable to start admin lab." });
  }
};

function ownerKeyOrReject(value: string): string {
  if (!value || value.length > 512) throw new AdminGrantError(403, "Invalid learner identity.");
  return value;
}
