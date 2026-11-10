import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { adminLabConfiguration } from "../services/execution/learningAdminGrant.js";
import { adminLabSwitchStatus, setAdminLabSwitch } from "../services/execution/learningAdminSwitch.js";
import { getAllSessions } from "../services/sessions/sessionStore.js";
import { killSession } from "../services/docker/killSession.js";
import { docker } from "../services/docker/dockerClient.js";

function validOperatorSecret(submitted: string): boolean {
  const configured = process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET ?? "";
  if (Buffer.byteLength(configured, "utf8") < 32 || submitted.length > 512) return false;
  const expected = Buffer.from(configured, "utf8");
  const received = Buffer.from(submitted, "utf8");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function activeAdminSessions() {
  return getAllSessions().filter((s) => s.labMode === "admin" &&
    !["completed", "failed", "canceled", "timed_out"].includes(s.state));
}

/** Operator-only; requires service auth AND a separate control-plane secret. */
export const adminLabControlRoute: RequestHandler = async (req, res) => {
  if (!validOperatorSecret(req.header("x-learning-admin-control") ?? "")) {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.enabled !== "boolean") {
    return res.status(400).json({ ok: false, error: "Expected { enabled: boolean }." });
  }
  if (body.enabled) {
    try {
      // Verify static opt-in, pinned image, learning-only pool and grant key.
      adminLabConfiguration();
      return res.status(200).json({ ok: true, ...setAdminLabSwitch(true) });
    } catch {
      return res.status(503).json({ ok: false, error: "Admin labs are not configured." });
    }
  }
  // Revoke synchronously BEFORE any await: in-flight starts detect epoch drift.
  const state = setAdminLabSwitch(false);
  const sessions = activeAdminSessions();
  const results = await Promise.allSettled(sessions.map((s) => killSession(s.id, "canceled")));
  const removal = await Promise.allSettled(sessions.map(async (session) => {
    try {
      await docker.getContainer(session.containerId).inspect();
      // Any remaining container, including stopped instances, is an incomplete teardown.
      return false;
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode === 404) return true;
      throw error;
    }
  }));
  const removed = removal.filter((item) => item.status === "fulfilled" && item.value).length;
  const completed = results.every((item) => item.status === "fulfilled") && removed === sessions.length;
  return res.status(completed ? 200 : 503).json({
    ok: completed, ...state, revoked: removed,
    ...(!completed ? { error: "Some admin containers could not be confirmed removed." } : {}),
  });
};

/** Status is protected by both secrets too; never expose runtime mode publicly. */
export const adminLabControlStatusRoute: RequestHandler = (req, res) => {
  if (!validOperatorSecret(req.header("x-learning-admin-control") ?? "")) {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
  return res.status(200).json({ ok: true, ...adminLabSwitchStatus() });
};
