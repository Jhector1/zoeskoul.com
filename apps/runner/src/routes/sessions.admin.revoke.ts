import type { RequestHandler } from "express";
import { validOperatorSecret, revokeAdminSessionsAndVerify } from "./sessions.admin.control.js";

/** Explicit operator revocation uses the same verified cleanup as control OFF. */
export const revokeAdminSessionsRoute: RequestHandler = async (req, res) => {
  if (!validOperatorSecret(req.header("x-learning-admin-control") ?? "")) {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
  const result = await revokeAdminSessionsAndVerify();
  return res.status(result.ok ? 200 : 503).json(result);
};
