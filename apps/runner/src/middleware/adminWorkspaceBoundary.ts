import type { RequestHandler } from "express";
import { getSession } from "../services/sessions/sessionStore.js";
import { getRequiredActorKey } from "./serviceAuth.js";

/** Root lab data lives only in a disposable container, never host workspace API. */
export const blockAdminWorkspaceApis: RequestHandler = (req, res, next) => {
  const session = getSession(String(req.params.sessionId ?? ""));
  if (session?.labMode !== "admin") return next();
  const actorKey = getRequiredActorKey(req);
  if (session.ownerKey !== actorKey) return res.status(404).json({ error: "Not found" });
  return res.status(403).json({ ok: false, error: "Admin lab host workspace access is disabled." });
};
