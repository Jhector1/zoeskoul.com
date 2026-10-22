import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { getSession } from "../services/sessions/sessionStore.js";
import { replaceWorkspaceFiles } from "../services/workspace/replaceWorkspaceFiles.js";
import { repairSandboxWorkspaceOwnership } from "../services/workspace/workspaceOwnershipRepair.js";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";

type ReplaceWorkspaceBody = {
    files?: WorkspaceSyncEntry[];
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

        const result = await replaceWorkspaceFiles(session.workspaceDir, files);
        // Fail this synchronization if the learner would not own imported files.
        await repairSandboxWorkspaceOwnership(session.workspaceDir);

        return res.status(200).json({
            ok: true,
            fileCount: result.fileCount,
        });
    } catch (e: any) {
        const message = e?.message ?? "Failed to replace workspace.";
        const status = message.includes("disk is low") || message.includes("Workspace ownership repair") ? 503 : 400;
        return res.status(status).json({
            ok: false,
            error: message,
        });
    }
};
