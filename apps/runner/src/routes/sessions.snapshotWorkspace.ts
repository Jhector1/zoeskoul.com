import fs from "node:fs/promises";
import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession } from "../services/sessions/sessionStore.js";
import { snapshotWorkspaceFiles } from "../services/workspace/snapshotWorkspaceFiles.js";
import { withWorkspaceSyncLock } from "../services/workspace/workspaceSyncLock.js";

async function pathExists(path: string) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

export const snapshotWorkspaceRoute: RequestHandler = async (req, res) => {
    try {
        const actorKey = getRequiredActorKey(req);
        const sessionId = String(req.params.sessionId);

        const session = getSession(sessionId);

        if (!session) {
            return res.status(404).json({
                ok: false,
                error: "Session not found or expired.",
            });
        }

        if (session.ownerKey !== actorKey) {
            return res.status(403).json({
                ok: false,
                error: "Forbidden.",
            });
        }

        if (!session.workspaceDir) {
            return res.status(400).json({
                ok: false,
                error: "Session has no workspace.",
            });
        }

        if (!(await pathExists(session.workspaceDir))) {
            return res.status(410).json({
                ok: false,
                error:
                    "Workspace expired before snapshot. Run again to recreate the workspace.",
            });
        }

        const files = await withWorkspaceSyncLock(session.workspaceDir, () =>
            snapshotWorkspaceFiles(session.workspaceDir!),
        );

        return res.status(200).json({
            ok: true,
            files,
            expiresAt: session.expiresAt ?? null,
        });
    } catch (e: unknown) {
        const code = (e as NodeJS.ErrnoException | null)?.code;
        if (code === "EACCES" || code === "EPERM") {
            // Linux permissions are part of the training exercise. Fail
            // closed: never silently omit unreadable folders/files from a
            // snapshot, which could erase learner data during a later merge.
            // Do not expose the host's absolute filesystem paths to clients.
            return res.status(409).json({
                ok: false,
                code: "WORKSPACE_SNAPSHOT_ACCESS_RESTRICTED",
                error: "Workspace snapshot is unavailable while paths have restricted access. No files were synchronized.",
            });
        }
        return res.status(500).json({
            ok: false,
            error: "Failed to snapshot workspace.",
        });
    }
};