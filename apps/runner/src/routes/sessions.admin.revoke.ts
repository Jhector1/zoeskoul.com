import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { getAllSessions } from "../services/sessions/sessionStore.js";
import { killSession } from "../services/docker/killSession.js";
import { setAdminLabSwitch } from "../services/execution/learningAdminSwitch.js";

/** Explicit operator revocation. Requires independent control secret. */
export const revokeAdminSessionsRoute: RequestHandler = async (req, res) => {
  const secret = process.env.ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET ?? "";
  const submitted = req.header("x-learning-admin-control") ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(submitted);
  if (secret.length < 32 || b.length !== a.length || !crypto.timingSafeEqual(a,b)) {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
  setAdminLabSwitch(false);
  const active = getAllSessions().filter(s => s.labMode === "admin" &&
    !["completed", "failed", "canceled", "timed_out"].includes(s.state));
  await Promise.all(active.map(s => killSession(s.id, "canceled")));
  return res.status(200).json({ ok: true, revoked: active.length });
};
