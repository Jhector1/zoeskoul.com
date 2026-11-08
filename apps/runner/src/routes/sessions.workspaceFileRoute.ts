import type { RequestHandler } from "express";
import { env } from "../lib/env.js";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession } from "../services/sessions/sessionStore.js";
import { withWorkspaceSyncLock } from "../services/workspace/workspaceSyncLock.js";
import { runWorkspaceFileWorker, WorkspaceFileUnavailableError } from "../services/workspace/workspaceFileDockerExec.js";
import { parseWorkspaceFileRequest, WorkspaceFileInputError } from "../services/workspace/workspaceFileProtocol.js";

/**
 * V6A internal canary endpoint. Off by default. There is deliberately no
 * Student/Web proxy or browser usage yet; V5 remains the active protocol.
 */
export const sessionsWorkspaceFileRoute: RequestHandler = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!env.workspaceFileApiEnabled || process.env.RUNNER_EXECUTION_POOL !== "zoeskoul-learning") {
    return res.status(404).json({ ok: false, error: "Not found." });
  }
  try {
    const actorKey = getRequiredActorKey(req);
    const session = getSession(String(req.params.sessionId));
    if (!session) return res.status(404).json({ ok: false, error: "Session not found." });
    if (session.ownerKey !== actorKey) return res.status(403).json({ ok: false, error: "Forbidden." });
    if (session.kind !== "shell" || !session.workspaceDir || session.state !== "waiting_for_input") {
      return res.status(409).json({ ok: false, error: "Active shell workspace required." });
    }
    const request = parseWorkspaceFileRequest(req.body);
    const result = await withWorkspaceSyncLock(session.workspaceDir, () => {
      // A request can wait behind an earlier workspace mutation. The session
      // may expire or be replaced while it waits. Reauthorize at execution
      // time, not just before acquiring the queue.
      const active = getSession(session.id);
      if (active !== session || active.ownerKey !== actorKey ||
          active.kind !== "shell" || active.state !== "waiting_for_input" ||
          active.workspaceDir !== session.workspaceDir) {
        return Promise.resolve({ ok: false as const, code: "SESSION_INACTIVE" });
      }
      return runWorkspaceFileWorker(session, request);
    });
    if (result.ok) return res.status(200).json(result);
    const status = result.code === "CONFLICT" || result.code === "DIRECTORY_NOT_EMPTY" ? 409 :
      result.code === "NOT_FOUND" ? 404 :
      result.code === "PRECONDITION_REQUIRED" ? 428 :
      result.code === "TOO_LARGE" || result.code === "TOO_MANY_ENTRIES" ? 413 :
      result.code === "READ_ONLY" ? 403 :
      result.code === "SESSION_INACTIVE" ? 409 :
      result.code === "TIMEOUT" || result.code === "UNSUPPORTED_OPERATION" ? 503 :
      result.code.startsWith("INVALID_") ? 400 : 500;
    return res.status(status).json(result);
  } catch (error: unknown) {
    if (error instanceof WorkspaceFileInputError) {
      return res.status(error.code === "PRECONDITION_REQUIRED" ? 428 :
        error.code === "TOO_LARGE" ? 413 : 400).json({ ok: false, code: error.code });
    }
    if (error instanceof WorkspaceFileUnavailableError) {
      return res.status(503).json({ ok: false, code: "WORKER_UNAVAILABLE" });
    }
    return res.status(500).json({ ok: false, code: "WORKSPACE_FILE_ERROR" });
  }
};
