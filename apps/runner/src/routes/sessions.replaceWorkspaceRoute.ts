import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession } from "../services/sessions/sessionStore.js";
import { replaceWorkspaceFiles, WorkspaceSyncConflictError } from "../services/workspace/replaceWorkspaceFiles.js";
import { withWorkspaceSyncLock } from "../services/workspace/workspaceSyncLock.js";
import { repairSandboxWorkspaceOwnership } from "../services/workspace/workspaceOwnershipRepair.js";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";

type ReplaceWorkspaceBody = {
    files?: WorkspaceSyncEntry[];
    baselineFiles?: WorkspaceSyncEntry[];
};

export const sessionsReplaceWorkspaceRoute: RequestHandler = async (req, res) => {
    try {
        const actorKey = getRequiredActorKey(req);
        const sessionId = String(req.params.sessionId);
        const body = (req.body ?? {}) as ReplaceWorkspaceBody;

        const session = getSession(sessionId);

        if (!session) {
            return res.status(404).json({
                ok: false,
                error: "Session not found.",
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

        const files = Array.isArray(body.files) ? body.files : [];

        // A full replacement without a baseline can silently delete terminal-
        // created files. Fail closed for stale clients until the web app deploys.
        if (!Array.isArray(body.baselineFiles)) {
            return res.status(428).json({
                ok: false,
                error: "Workspace sync requires a baseline. Reload the IDE to use the updated client.",
            });
        }
        const result = await withWorkspaceSyncLock(session.workspaceDir, async () => {
            const changed = await replaceWorkspaceFiles(session.workspaceDir!, files, {
                baselineFiles: body.baselineFiles,
            });
            // Repair and validate before releasing the per-workspace lock.
            await repairSandboxWorkspaceOwnership(session.workspaceDir!);
            return changed;
        });

        return res.status(200).json({
            ok: true,
            fileCount: result.fileCount,
        });
    } catch (e: any) {
        const message = e?.message ?? "Failed to replace workspace.";
        const status = e instanceof WorkspaceSyncConflictError ? 409 :
            message.includes("disk is low") || message.includes("Workspace ownership repair") ? 503 : 400;
        return res.status(status).json({
            ok: false,
            error: message,
        });
    }
};
