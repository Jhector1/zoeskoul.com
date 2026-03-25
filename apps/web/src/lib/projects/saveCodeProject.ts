// src/lib/projects/saveCodeProject.ts
import "server-only";

import { createHash } from "node:crypto";
import {
    CodeProjectScopeKind,
    CodeProjectVisibility,
    Prisma,
    type PrismaClient,
} from "@prisma/client";

type SaveProjectScopeInput = {
    kind?: CodeProjectScopeKind;
    subjectId?: string | null;
    moduleId?: string | null;
    assignmentId?: string | null;
    scopeKey?: string | null;
};

export class ProjectVersionConflictError extends Error {
    readonly code = "PROJECT_CONFLICT" as const;
    readonly projectId: string;
    readonly serverVersion: number;
    readonly serverUpdatedAt: Date;
    readonly title: string;

    constructor(args: {
        projectId: string;
        serverVersion: number;
        serverUpdatedAt: Date;
        title: string;
    }) {
        super("A newer cloud version already exists.");
        this.projectId = args.projectId;
        this.serverVersion = args.serverVersion;
        this.serverUpdatedAt = args.serverUpdatedAt;
        this.title = args.title;
    }
}

export type SaveCodeProjectInput = {
    projectId?: string;
    ownerId: string;

    title: string;
    description?: string | null;
    language: string;

    workspace: Prisma.InputJsonValue;
    settings?: Prisma.InputJsonValue | null;
    meta?: Prisma.InputJsonValue | null;

    entryPath?: string | null;
    activePath?: string | null;

    visibility?: CodeProjectVisibility;
    shareToken?: string | null;

    scope?: SaveProjectScopeInput;

    createRevision?: boolean;
    revisionNote?: string | null;
    createdById?: string | null;

    // optimistic concurrency
    baseVersion?: number | null;
    clientInstanceId?: string | null;
    clientDraftUpdatedAt?: string | null;
};

function hashSnapshot(value: unknown) {
    return createHash("sha256")
        .update(JSON.stringify(value ?? null))
        .digest("hex");
}

function normalizeScope(scope?: SaveProjectScopeInput) {
    return {
        scopeKind: scope?.kind ?? CodeProjectScopeKind.personal,
        subjectId: scope?.subjectId ?? null,
        moduleId: scope?.moduleId ?? null,
        assignmentId: scope?.assignmentId ?? null,
        scopeKey: scope?.scopeKey ?? null,
    };
}

function asJsonRecord(
    value: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null | undefined,
): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== "object") return {};
    return value as unknown as Record<string, unknown>;
}

function buildWorkspaceHash(input: {
    language: string;
    entryPath?: string | null;
    activePath?: string | null;
    workspace: Prisma.InputJsonValue;
    settings?: Prisma.InputJsonValue | null;
}) {
    return hashSnapshot({
        language: input.language,
        entryPath: input.entryPath ?? null,
        activePath: input.activePath ?? null,
        workspace: input.workspace ?? null,
        settings: input.settings ?? null,
    });
}

function buildHeadHash(input: {
    title: string;
    description?: string | null;
    language: string;
    scope: ReturnType<typeof normalizeScope>;
    visibility?: CodeProjectVisibility;
    shareToken?: string | null;
    entryPath?: string | null;
    activePath?: string | null;
    workspace: Prisma.InputJsonValue;
    settings?: Prisma.InputJsonValue | null;
    meta?: Prisma.InputJsonValue | null;
}) {
    return hashSnapshot({
        title: input.title.trim(),
        description: input.description ?? null,
        language: input.language,
        scopeKind: input.scope.scopeKind,
        subjectId: input.scope.subjectId,
        moduleId: input.scope.moduleId,
        assignmentId: input.scope.assignmentId,
        scopeKey: input.scope.scopeKey,
        visibility: input.visibility ?? CodeProjectVisibility.private,
        shareToken:
            (input.visibility ?? CodeProjectVisibility.private) ===
            CodeProjectVisibility.private
                ? null
                : input.shareToken ?? null,
        entryPath: input.entryPath ?? null,
        activePath: input.activePath ?? null,
        workspace: input.workspace ?? null,
        settings: input.settings ?? null,
        meta: input.meta ?? null,
    });
}

export async function saveCodeProject(
    prisma: PrismaClient,
    input: SaveCodeProjectInput,
) {
    const normalizedScope = normalizeScope(input.scope);

    const workspaceHash = buildWorkspaceHash({
        language: input.language,
        entryPath: input.entryPath,
        activePath: input.activePath,
        workspace: input.workspace,
        settings: input.settings,
    });

    const incomingHeadHash = buildHeadHash({
        title: input.title,
        description: input.description,
        language: input.language,
        scope: normalizedScope,
        visibility: input.visibility,
        shareToken: input.shareToken,
        entryPath: input.entryPath,
        activePath: input.activePath,
        workspace: input.workspace,
        settings: input.settings,
        meta: input.meta,
    });

    return prisma.$transaction(async (tx) => {
        const existing = input.projectId
            ? await tx.codeProject.findFirst({
                where: {
                    id: input.projectId,
                    ownerId: input.ownerId,
                    archivedAt: null,
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    language: true,
                    scopeKind: true,
                    subjectId: true,
                    moduleId: true,
                    assignmentId: true,
                    scopeKey: true,
                    visibility: true,
                    shareToken: true,
                    currentVersion: true,
                    entryPath: true,
                    activePath: true,
                    workspaceHash: true,
                    workspace: true,
                    settings: true,
                    meta: true,
                    updatedAt: true,
                },
            })
            : null;

        if (input.projectId && !existing) {
            throw new Error("Project not found or not owned by user.");
        }

        const existingHeadHash = existing
            ? buildHeadHash({
                title: existing.title,
                description: existing.description,
                language: existing.language,
                scope: {
                    scopeKind: existing.scopeKind,
                    subjectId: existing.subjectId,
                    moduleId: existing.moduleId,
                    assignmentId: existing.assignmentId,
                    scopeKey: existing.scopeKey,
                },
                visibility: existing.visibility,
                shareToken: existing.shareToken,
                entryPath: existing.entryPath,
                activePath: existing.activePath,
                workspace: existing.workspace as Prisma.InputJsonValue,
                settings: (existing.settings ?? null) as Prisma.InputJsonValue | null,
                meta: (existing.meta ?? null) as Prisma.InputJsonValue | null,
            })
            : null;

        const hasHeadChanged = existing ? existingHeadHash !== incomingHeadHash : true;
        const hasWorkspaceChanged = existing
            ? existing.workspaceHash !== workspaceHash
            : true;

        if (
            existing &&
            hasHeadChanged &&
            input.baseVersion !== existing.currentVersion
        ) {
            throw new ProjectVersionConflictError({
                projectId: existing.id,
                serverVersion: existing.currentVersion,
                serverUpdatedAt: existing.updatedAt,
                title: existing.title,
            });
        }

        const nextVersion = existing
            ? hasHeadChanged
                ? existing.currentVersion + 1
                : existing.currentVersion
            : 1;

        const visibility = input.visibility ?? CodeProjectVisibility.private;
        const shareToken =
            visibility === CodeProjectVisibility.private
                ? null
                : input.shareToken ?? null;

        const projectData = {
            title: input.title.trim(),
            description: input.description ?? null,
            language: input.language,

            ...normalizedScope,

            visibility,
            shareToken,

            entryPath: input.entryPath ?? null,
            activePath: input.activePath ?? null,

            workspaceHash,
            workspace: input.workspace,
            settings: input.settings ?? Prisma.JsonNull,
            meta: input.meta ?? Prisma.JsonNull,

            currentVersion: nextVersion,
            lastOpenedAt: new Date(),
        };

        const project = existing
            ? await tx.codeProject.update({
                where: { id: existing.id },
                data: projectData,
            })
            : await tx.codeProject.create({
                data: {
                    ownerId: input.ownerId,
                    schemaVersion: 1,
                    ...projectData,
                },
            });

        const shouldCreateRevision =
            !existing ||
            (Boolean(input.createRevision) && hasWorkspaceChanged);

        if (shouldCreateRevision) {
            const revisionMeta: Prisma.InputJsonValue = {
                ...asJsonRecord(input.meta ?? null),
                baseVersion: input.baseVersion ?? null,
                clientInstanceId: input.clientInstanceId ?? null,
                clientDraftUpdatedAt: input.clientDraftUpdatedAt ?? null,
            };

            await tx.codeProjectRevision.create({
                data: {
                    projectId: project.id,
                    version: nextVersion,
                    workspaceHash,
                    snapshot: input.workspace,
                    settings: input.settings ?? Prisma.JsonNull,
                    note: input.revisionNote ?? null,
                    meta: revisionMeta,
                    createdById: input.createdById ?? input.ownerId,
                },
            });
        }

        return {
            project,
            changed: hasHeadChanged,
            workspaceChanged: hasWorkspaceChanged,
            version: nextVersion,
        };
    });
}