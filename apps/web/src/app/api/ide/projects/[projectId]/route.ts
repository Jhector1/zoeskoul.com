// src/app/api/ide/projects/[projectId]/route.ts
import { getCodeProjectForActor } from "@/lib/projects/getCodeProjectForActor";
import type {
    ProjectConflictResponse,
    ProjectResponse,
} from "@/lib/projects/projectApiTypes";
import {
    ProjectVersionConflictError,
    saveCodeProject,
} from "@/lib/projects/saveCodeProject";
import { prisma } from "@/lib/prisma";
import {
    jsonNoStore,
    parseSaveProjectRequest,
    requireProjectCapability,
    requireProjectScopeCapability,
    toPrismaJson,
    toPrismaNullableJson, toWorkspaceAccessFromProjectGate,
} from "@/lib/projects/projectRouteUtils";
import {resolveWorkspacePolicy, validateWorkspaceNodes} from "@/components/ide/workspaceHook/workspace.policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FoundProject = NonNullable<
    Awaited<ReturnType<typeof getCodeProjectForActor>>
>["project"];

function toProjectPayload(
    role: string,
    project: FoundProject,
): ProjectResponse["project"] {
    return {
        id: project.id,
        title: project.title,
        description: project.description,
        language: project.language,
        scopeKind: project.scopeKind,
        visibility: project.visibility,
        currentVersion: project.currentVersion,
        updatedAt: project.updatedAt.toISOString(),
        entryPath: project.entryPath,
        activePath: project.activePath,
        workspace: project.workspace as ProjectResponse["project"]["workspace"],
        settings: (project.settings ?? null) as ProjectResponse["project"]["settings"],
        meta: (project.meta ?? null) as ProjectResponse["project"]["meta"],
        role: role as ProjectResponse["project"]["role"],
    };
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ projectId: string }> },
) {
    const gate = await requireProjectCapability("save_cloud");
    if (!gate.ok) return gate.res;

    const { projectId } = await ctx.params;

    const found = await getCodeProjectForActor(prisma, {
        actor: gate.actor,
        projectId,
    });

    if (!found) {
        return jsonNoStore(
            { ok: false, error: "Project not found." },
            404,
        );
    }

    const body: ProjectResponse = {
        ok: true,
        project: toProjectPayload(found.role, found.project),
    };

    return jsonNoStore(body);
}

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ projectId: string }> },
) {
    let parsedBody: ReturnType<typeof parseSaveProjectRequest> | null = null;

    try {
        const gate = await requireProjectCapability("save_cloud");
        if (!gate.ok) return gate.res;

        if (!gate.actor.userId) {
            return jsonNoStore(
                { ok: false, error: "Sign in required." },
                401,
            );
        }

        const { projectId } = await ctx.params;
        parsedBody = parseSaveProjectRequest(await req.json());
        const access = toWorkspaceAccessFromProjectGate(gate);

        const policy = resolveWorkspacePolicy(access);
        const error = validateWorkspaceNodes(parsedBody.workspace.nodes, policy);

        if (error) {
            return jsonNoStore({ ok: false, error }, 400);
        }
        const scopeRes = await requireProjectScopeCapability(parsedBody.scope);
        if (scopeRes) return scopeRes;

        const saved = await saveCodeProject(prisma, {
            projectId,
            ownerId: gate.actor.userId,
            title: parsedBody.title,
            description: parsedBody.description,
            language: parsedBody.language,
            workspace: toPrismaJson(parsedBody.workspace),
            entryPath: parsedBody.entryPath,
            activePath: parsedBody.activePath,
            visibility: parsedBody.visibility,
            scope: parsedBody.scope,
            createRevision: parsedBody.createRevision ?? false,
            revisionNote: parsedBody.revisionNote,
            createdById: gate.actor.userId,
            settings: toPrismaNullableJson(parsedBody.settings ?? null),
            meta: toPrismaNullableJson(parsedBody.meta ?? null),
            baseVersion: parsedBody.baseVersion ?? null,
            clientInstanceId: parsedBody.clientInstanceId ?? null,
            clientDraftUpdatedAt: parsedBody.clientDraftUpdatedAt ?? null,
        });

        return jsonNoStore({
            ok: true,
            project: {
                id: saved.project.id,
                title: saved.project.title,
                description: saved.project.description,
                language: saved.project.language,
                scopeKind: saved.project.scopeKind,
                visibility: saved.project.visibility,
                currentVersion: saved.project.currentVersion,
                updatedAt: saved.project.updatedAt.toISOString(),
            },
        });
    } catch (e: any) {
        if (e instanceof ProjectVersionConflictError) {
            const gate = await requireProjectCapability("save_cloud");
            if (!gate.ok) return gate.res;

            const found = gate.actor
                ? await getCodeProjectForActor(prisma, {
                    actor: gate.actor,
                    projectId: e.projectId,
                })
                : null;

            const body: ProjectConflictResponse = {
                ok: false,
                code: "PROJECT_CONFLICT",
                error: e.message,
                conflict: {
                    projectId: e.projectId,
                    clientBaseVersion: parsedBody?.baseVersion ?? null,
                    serverVersion: e.serverVersion,
                    serverUpdatedAt: e.serverUpdatedAt.toISOString(),
                    title: e.title,
                },
                project: found ? toProjectPayload(found.role, found.project) : null,
            };

            return jsonNoStore(body, 409);
        }

        return jsonNoStore(
            {
                ok: false,
                error: e?.message ?? "Failed to update project.",
            },
            400,
        );
    }
}

export async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ projectId: string }> },
) {
    const gate = await requireProjectCapability("save_cloud");
    if (!gate.ok) return gate.res;

    if (!gate.actor.userId) {
        return jsonNoStore(
            { ok: false, error: "Sign in required." },
            401,
        );
    }

    const { projectId } = await ctx.params;

    const updated = await prisma.codeProject.updateMany({
        where: {
            id: projectId,
            ownerId: gate.actor.userId,
            archivedAt: null,
        },
        data: {
            archivedAt: new Date(),
        },
    });

    if (!updated.count) {
        return jsonNoStore(
            { ok: false, error: "Project not found." },
            404,
        );
    }

    return jsonNoStore({ ok: true });
}