// src/app/api/ide/projects/route.ts
import { saveCodeProject } from "@/lib/projects/saveCodeProject";
import { prisma } from "@/lib/prisma";
import type { ProjectListResponse } from "@/lib/projects/projectApiTypes";
import {
    jsonNoStore,
    mapProjectSummary,
    parseSaveProjectRequest,
    requireProjectCapability,
    requireProjectScopeCapability,
    toPrismaJson,
    toPrismaNullableJson, toWorkspaceAccessFromProjectGate,
} from "@/lib/projects/projectRouteUtils";
import {resolveWorkspacePolicy, validateWorkspaceNodes} from "@/components/ide/workspaceHook/workspace.policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const gate = await requireProjectCapability("save_cloud");
    if (!gate.ok) return gate.res;

    if (!gate.actor.userId) {
        return jsonNoStore(
            { ok: false, error: "Sign in required." },
            401,
        );
    }

    const url = new URL(req.url);
    const archived = url.searchParams.get("archived") === "1";

    const projects = await prisma.codeProject.findMany({
        where: {
            ownerId: gate.actor.userId,
            archivedAt: archived ? { not: null } : null,
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
        },
        orderBy: {
            updatedAt: "desc",
        },
    });

    const body: ProjectListResponse = {
        ok: true,
        projects: projects.map(mapProjectSummary),
    };

    return jsonNoStore(body);
}

export async function POST(req: Request) {
    try {
        const gate = await requireProjectCapability("create_project");
        if (!gate.ok) return gate.res;

        if (!gate.actor.userId) {
            return jsonNoStore(
                { ok: false, error: "Sign in required." },
                401,
            );
        }

        const body = parseSaveProjectRequest(await req.json());
        const access = toWorkspaceAccessFromProjectGate(gate);
        const policy = resolveWorkspacePolicy(access, body.language);
        const error = validateWorkspaceNodes(body.workspace.nodes, policy);

        if (error) {
            return jsonNoStore({ ok: false, error }, 400);
        }
        const scopeRes = await requireProjectScopeCapability(body.scope);
        if (scopeRes) return scopeRes;

        const saved = await saveCodeProject(prisma, {
            ownerId: gate.actor.userId,
            title: body.title,
            description: body.description,
            language: body.language,
            workspace: toPrismaJson(body.workspace),
            entryPath: body.entryPath,
            activePath: body.activePath,
            visibility: body.visibility,
            scope: body.scope,
            createRevision: body.createRevision ?? true,
            revisionNote: body.revisionNote,
            createdById: gate.actor.userId,
            settings: toPrismaNullableJson(body.settings ?? null),
            meta: toPrismaNullableJson(body.meta ?? null),
            clientInstanceId: body.clientInstanceId ?? null,
            clientDraftUpdatedAt: body.clientDraftUpdatedAt ?? null,
        });

        return jsonNoStore(
            {
                ok: true,
                project: mapProjectSummary(saved.project),
            },
            201,
        );
    } catch (e: any) {
        return jsonNoStore(
            {
                ok: false,
                error: e?.message ?? "Failed to create project.",
            },
            400,
        );
    }
}