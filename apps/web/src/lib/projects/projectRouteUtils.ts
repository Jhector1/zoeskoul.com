// src/lib/projects/projectRouteUtils.ts
import { NextResponse } from "next/server";
import { CodeProjectScopeKind, CodeProjectVisibility, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { checkIdeCapability } from "@/lib/access/ideCapabilityServer";
import { getActor } from "@/lib/practice/actor";

import type {
    ProjectListResponse,
    ProjectScopeInput,
    ProjectSummary,
    SaveProjectRequest,
} from "@/lib/projects/projectApiTypes";
import {IdeWorkspaceAccess} from "@/components/ide/workspaceHook/workspace.types";

type Capability = Parameters<typeof checkIdeCapability>[1]["capability"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function jsonNoStore(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store, max-age=0",
        },
    });
}

export function mapProjectSummary(project: {
    id: string;
    title: string;
    description: string | null;
    language: string;
    scopeKind: string;
    visibility: string;
    currentVersion: number;
    updatedAt: Date;
}): ProjectSummary {
    return {
        id: project.id,
        title: project.title,
        description: project.description,
        language: project.language,
        scopeKind: project.scopeKind,
        visibility: project.visibility,
        currentVersion: project.currentVersion,
        updatedAt: project.updatedAt.toISOString(),
    };
}

export function parseScope(raw: unknown): ProjectScopeInput {
    const scope = isPlainObject(raw) ? raw : {};

    const kindRaw = scope.kind;
    const kind =
        kindRaw === CodeProjectScopeKind.personal ||
        kindRaw === CodeProjectScopeKind.module ||
        kindRaw === CodeProjectScopeKind.assignment ||
        kindRaw === CodeProjectScopeKind.template
            ? kindRaw
            : CodeProjectScopeKind.personal;

    return {
        kind,
        subjectId: typeof scope.subjectId === "string" ? scope.subjectId : null,
        moduleId: typeof scope.moduleId === "string" ? scope.moduleId : null,
        assignmentId: typeof scope.assignmentId === "string" ? scope.assignmentId : null,
        scopeKey: typeof scope.scopeKey === "string" ? scope.scopeKey : null,
    };
}

export function parseVisibility(raw: unknown): CodeProjectVisibility {
    return raw === CodeProjectVisibility.unlisted || raw === CodeProjectVisibility.shared
        ? raw
        : CodeProjectVisibility.private;
}

function parseBaseVersion(raw: unknown): number | null {
    return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

export function parseSaveProjectRequest(raw: unknown): SaveProjectRequest {
    const body = isPlainObject(raw) ? raw : {};

    if (typeof body.title !== "string" || !body.title.trim()) {
        throw new Error("Project title is required.");
    }

    if (typeof body.language !== "string" || !body.language.trim()) {
        throw new Error("Project language is required.");
    }

    if (!isPlainObject(body.workspace)) {
        throw new Error("Workspace payload is required.");
    }

    return {
        title: body.title.trim(),
        description: typeof body.description === "string" ? body.description : null,
        language: body.language as SaveProjectRequest["language"],
        workspace: body.workspace as SaveProjectRequest["workspace"],
        entryPath: typeof body.entryPath === "string" ? body.entryPath : null,
        activePath: typeof body.activePath === "string" ? body.activePath : null,
        visibility: parseVisibility(body.visibility),
        scope: parseScope(body.scope),
        createRevision: Boolean(body.createRevision),
        revisionNote: typeof body.revisionNote === "string" ? body.revisionNote : null,
        settings: isPlainObject(body.settings)
            ? (body.settings as SaveProjectRequest["settings"])
            : null,
        meta: isPlainObject(body.meta)
            ? (body.meta as SaveProjectRequest["meta"])
            : null,
        baseVersion: parseBaseVersion(body.baseVersion),
        clientInstanceId:
            typeof body.clientInstanceId === "string" ? body.clientInstanceId : null,
        clientDraftUpdatedAt:
            typeof body.clientDraftUpdatedAt === "string"
                ? body.clientDraftUpdatedAt
                : null,
    };
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function toPrismaNullableJson(value: unknown): Prisma.InputJsonValue | null {
    if (value == null) return null;
    return toPrismaJson(value);
}

export async function requireProjectCapability(capability: Capability) {
    const actor = await getActor();
    const decision = await checkIdeCapability(prisma, {
        actor,
        capability,
    });

    if (decision.ok) {
        return {
            ok: true as const,
            actor,
            capabilities: decision.capabilities,
        };
    }

    return {
        ok: false as const,
        res: jsonNoStore(
            {
                ok: false,
                paywall: true,
                reason: decision.reason,
                capability,
                error:
                    decision.reason === "requires_login"
                        ? "Sign in to unlock cloud project saving."
                        : "Your plan does not include cloud project saving.",
            },
            decision.reason === "requires_login" ? 401 : 402,
        ),
    };
}

export async function requireProjectScopeCapability(
    scope: ProjectScopeInput | null | undefined,
) {
    if (scope?.kind === CodeProjectScopeKind.module) {
        const gate = await requireProjectCapability("project_scope_module");
        if (!gate.ok) return gate.res;
    }

    if (scope?.kind === CodeProjectScopeKind.assignment) {
        const gate = await requireProjectCapability("project_scope_assignment");
        if (!gate.ok) return gate.res;
    }

    return null;
}

export function toWorkspaceAccessFromProjectGate(gate: {
    actor: { userId?: string | null };
    capabilities: unknown;
}): IdeWorkspaceAccess {
    const raw = gate.capabilities;

    const hasCap = (name: string) => {
        if (Array.isArray(raw)) {
            return raw.includes(name);
        }

        if (raw && typeof raw === "object") {
            return Boolean((raw as Record<string, unknown>)[name]);
        }

        return false;
    };

    return {
        hasUser: !!gate.actor.userId,
        canUseMultiFile: hasCap("multi_file"),
        canSaveCloud: hasCap("save_cloud"),
        canCreateProjects: hasCap("create_project"),
    };
}