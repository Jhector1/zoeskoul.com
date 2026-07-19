import { prisma } from "@/lib/prisma";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";
import { mergeWorkspaceWithTerminalSnapshot } from "@/lib/projects/workspaceTerminalSync";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { pathOf } from "@/components/ide/fsTree";
import {
    resolveWorkspacePolicy,
    validateWorkspaceNodes,
} from "@/components/ide/workspaceHook/workspace.policy";

import {
    jsonNoStore,
    requireProjectCapability,
    toPrismaJson,
    toWorkspaceAccessFromProjectGate,
} from "@/lib/projects/projectRouteUtils";
import {isWorkspaceLanguage} from "@/components/ide/workspaceHook/workspace.persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TerminalSyncRequest = {
    sessionId: string;
    baseVersion?: number | null;
};

type SnapshotWorkspaceResponse =
    | {
    ok: true;
    files: WorkspaceSyncEntry[];
}
    | {
    ok: false;
    error: string;
};

function parseBody(raw: unknown): TerminalSyncRequest {
    const body = (raw ?? {}) as Record<string, unknown>;

    const sessionId =
        typeof body.sessionId === "string" && body.sessionId.trim()
            ? body.sessionId.trim()
            : "";

    const baseVersion =
        typeof body.baseVersion === "number" &&
        Number.isInteger(body.baseVersion) &&
        body.baseVersion > 0
            ? body.baseVersion
            : null;

    if (!sessionId) {
        throw new Error("sessionId is required.");
    }

    return { sessionId, baseVersion };
}

export async function POST(
    req: Request,
    ctx: { params: Promise<{ projectId: string }> },
) {
    try {
        const gate = await requireProjectCapability("save_cloud");
        if (!gate.ok) return gate.res;

        if (!gate.actor.userId) {
            return jsonNoStore({ ok: false, error: "Sign in required." }, 401);
        }

        const { projectId } = await ctx.params;
        const body = parseBody(await req.json());

        const existing = await prisma.codeProject.findFirst({
            where: {
                id: projectId,
                ownerId: gate.actor.userId,
                archivedAt: null,
            },
            select: {
                id: true,
                title: true,
                description: true,
                language: true,
                visibility: true,
                scopeKind: true,
                currentVersion: true,
                updatedAt: true,
                workspace: true,
                entryPath: true,
                activePath: true,
                settings: true,
                meta: true,
            },
        });

        if (!existing) {
            return jsonNoStore({ ok: false, error: "Project not found." }, 404);
        }

        if (
            body.baseVersion !== null &&
            body.baseVersion !== existing.currentVersion
        ) {
            return jsonNoStore(
                {
                    ok: false,
                    code: "PROJECT_CONFLICT",
                    error: "A newer cloud version already exists.",
                    conflict: {
                        projectId: existing.id,
                        clientBaseVersion: body.baseVersion,
                        serverVersion: existing.currentVersion,
                        serverUpdatedAt: existing.updatedAt.toISOString(),
                        title: existing.title,
                    },
                    project: {
                        id: existing.id,
                        title: existing.title,
                        description: existing.description ?? null,
                        language: existing.language,
                        scopeKind: existing.scopeKind,
                        visibility: existing.visibility,
                        currentVersion: existing.currentVersion,
                        updatedAt: existing.updatedAt.toISOString(),
                        entryPath: existing.entryPath,
                        activePath: existing.activePath,
                        workspace: existing.workspace,
                        settings: existing.settings ?? null,
                        meta: existing.meta ?? null,
                        role: "owner",
                    },
                },
                409,
            );
        }

        const actorKey = await requireRunnerActorKey();

        const snapshot = await runnerPost<SnapshotWorkspaceResponse>(
            `/sessions/${encodeURIComponent(body.sessionId)}/snapshot-workspace`,
            actorKey,
            {},
        );

        if (!snapshot.ok) {
            return jsonNoStore(
                { ok: false, error: snapshot.error || "Failed to snapshot terminal workspace." },
                400,
            );
        }

        if (!snapshot.files.length) {
            return jsonNoStore(
                { ok: false, error: "Terminal workspace snapshot was empty." },
                400,
            );
        }

        const priorWorkspace = existing.workspace as WorkspaceStateV2;

        const nextWorkspace = mergeWorkspaceWithTerminalSnapshot({
            prior: priorWorkspace,
            files: snapshot.files,
        });

        const access = toWorkspaceAccessFromProjectGate(gate);

        if (!isWorkspaceLanguage(existing.language)) {
            return jsonNoStore(
                { ok: false, error: `Unsupported project language: ${existing.language}` },
                400,
            );
        }

        const policy = resolveWorkspacePolicy(access, existing.language);
        const validationError = validateWorkspaceNodes(nextWorkspace.nodes, policy);

        if (validationError) {
            return jsonNoStore({ ok: false, error: validationError }, 400);
        }

        const nextEntryPath = pathOf(nextWorkspace.nodes, nextWorkspace.entryFileId);
        const nextActivePath = pathOf(nextWorkspace.nodes, nextWorkspace.activeFileId);

        const updated = await prisma.codeProject.update({
            where: { id: existing.id },
            data: {
                workspace: toPrismaJson(nextWorkspace),
                entryPath: nextEntryPath,
                activePath: nextActivePath,
                currentVersion: existing.currentVersion + 1,
            },
            select: {
                id: true,
                title: true,
                description: true,
                language: true,
                scopeKind: true,
                visibility: true,
                currentVersion: true,
                updatedAt: true,
                entryPath: true,
                activePath: true,
                workspace: true,
                settings: true,
                meta: true,
            },
        });

        return jsonNoStore({
            ok: true,
            project: {
                id: updated.id,
                title: updated.title,
                description: updated.description ?? null,
                language: updated.language,
                scopeKind: updated.scopeKind,
                visibility: updated.visibility,
                currentVersion: updated.currentVersion,
                updatedAt: updated.updatedAt.toISOString(),
                entryPath: updated.entryPath,
                activePath: updated.activePath,
                workspace: updated.workspace,
                settings: updated.settings ?? null,
                meta: updated.meta ?? null,
                role: "owner",
            },
        });
    } catch (e: any) {
        if (e instanceof RunnerHttpError) {
            return jsonNoStore({ ok: false, error: e.message }, e.status);
        }

        return jsonNoStore(
            { ok: false, error: e?.message ?? "Failed to sync terminal workspace." },
            400,
        );
    }
}