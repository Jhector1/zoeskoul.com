import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { adminLabConfiguration } from "../services/execution/learningAdminGrant.js";
import { adminLabSwitchStatus, setAdminLabSwitch } from "../services/execution/learningAdminSwitch.js";
import { getAllSessions } from "../services/sessions/sessionStore.js";
import { killSession } from "../services/docker/killSession.js";
import { docker } from "../services/docker/dockerClient.js";
import { adminWorkspaceVolumeName, removeAdminWorkspaceVolume } from "../services/execution/adminWorkspaceVolume.js";
import { confirmDockerResourceAbsent } from "../services/execution/adminRevocationVerification.js";

export function validOperatorSecret(submitted: string): boolean {
  const configured = process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET ?? "";
  if (Buffer.byteLength(configured, "utf8") < 32 || submitted.length > 512) return false;
  const expected = Buffer.from(configured, "utf8");
  const received = Buffer.from(submitted, "utf8");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** Invalidate new admin launches and verify every tracked admin resource is absent. */
export async function revokeAdminSessionsAndVerify() {
  // Invalidate in-flight starts before ANY asynchronous Docker operation.
  const state = setAdminLabSwitch(false);
  // Include terminal/tombstone sessions. killSession marks a session terminal
  // before Docker acknowledges teardown, so excluding them loses retries.
  const sessions = getAllSessions().filter((session) => session.labMode === "admin");

  const results = await Promise.allSettled(sessions.map(async (session) => {
    const containerId = session.containerId;
    const volumeName = session.adminVolumeName;
    if (!containerId || !volumeName ||
        volumeName !== adminWorkspaceVolumeName(session.id)) {
      throw new Error("Invalid administrator session resource identity.");
    }

    // This promise may already be in progress following an earlier cancel.
    await killSession(session.id, "canceled");

    // AutoRemove and Docker remove may become visible asynchronously.
    const containerGone = await confirmDockerResourceAbsent(
      () => docker.getContainer(containerId).inspect(),
    );
    if (!containerGone) throw new Error("Administrator container remains after revocation.");

    // Admin sessions also own a separate private tmpfs volume. Only remove
    // through the existing owner/label/driver-verifying helper.
    await removeAdminWorkspaceVolume(volumeName, session.id);
    const volumeGone = await confirmDockerResourceAbsent(
      () => docker.getVolume(volumeName).inspect(),
    );
    if (!volumeGone) throw new Error("Administrator volume remains after revocation.");
  }));

  const verified = results.filter((result) => result.status === "fulfilled").length;
  const completed = verified === sessions.length;
  if (!completed) {
    // Log counts only: do not expose actor keys, Docker IDs, or secrets.
    console.error("RUNNER admin revocation cleanup incomplete", {
      total: sessions.length,
      verified,
      failed: sessions.length - verified,
    });
  }
  return {
    ok: completed, ...state, revoked: verified,
    ...(!completed ? { error: "Some admin resources could not be confirmed removed." } : {}),
  };
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
      adminLabConfiguration();
      return res.status(200).json({ ok: true, ...setAdminLabSwitch(true) });
    } catch {
      return res.status(503).json({ ok: false, error: "Admin labs are not configured." });
    }
  }
  const result = await revokeAdminSessionsAndVerify();
  return res.status(result.ok ? 200 : 503).json(result);
};

/** Status is protected by both secrets too; never expose runtime mode publicly. */
export const adminLabControlStatusRoute: RequestHandler = (req, res) => {
  if (!validOperatorSecret(req.header("x-learning-admin-control") ?? "")) {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
  return res.status(200).json({ ok: true, ...adminLabSwitchStatus() });
};
