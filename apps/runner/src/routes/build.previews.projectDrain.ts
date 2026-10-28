import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import {
  drainReactPreviewsForProject,
  releaseReactPreviewProjectDrain,
} from "../services/build/reactPreviewRuntime.js";

function input(reqBody: unknown, release: boolean): { buildProjectId: string; drainId?: string } | null {
  if (typeof reqBody !== "object" || reqBody === null || Array.isArray(reqBody)) return null;
  const body = reqBody as Record<string, unknown>;
  const expected = release ? ["buildProjectId", "drainId"] : ["buildProjectId"];
  if (Object.keys(body).length !== expected.length ||
      Object.keys(body).some(key => !expected.includes(key))) return null;
  if (typeof body.buildProjectId !== "string" ||
      !/^[a-zA-Z0-9_-]{5,128}$/.test(body.buildProjectId)) return null;
  if (release && (typeof body.drainId !== "string" ||
      !/^drain_[a-f0-9-]{36}$/.test(body.drainId))) return null;
  return { buildProjectId: body.buildProjectId, drainId: release ? body.drainId as string : undefined };
}

export const drainBuildProjectPreviewsRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const validated = input(req.body, false);
    if (!validated) return res.status(400).json({ ok: false, error: "Invalid project." });
    const result = await drainReactPreviewsForProject({ ownerKey: actorKey, buildProjectId: validated.buildProjectId });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview cleanup unavailable.";
    const conflict = message.includes("in progress");
    return res.status(conflict ? 409 : 503).json({ ok: false, error: conflict ? message : "Preview cleanup unavailable." });
  }
};

export const releaseBuildProjectPreviewDrainRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const validated = input(req.body, true);
    if (!validated?.drainId) return res.status(400).json({ ok: false, error: "Invalid release." });
    const released = releaseReactPreviewProjectDrain({
      ownerKey: actorKey, buildProjectId: validated.buildProjectId, drainId: validated.drainId,
    });
    return res.status(released ? 200 : 409).json({ ok: released });
  } catch {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
};
