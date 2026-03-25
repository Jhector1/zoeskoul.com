// src/lib/projects/projectApiTypes.ts
import type { CodeLanguage } from "@/lib/practice/types";
import type { JsonObject } from "@/lib/types/json";
import type {
    CodeProjectScopeKind,
    CodeProjectVisibility,
    CodeProjectRole,
} from "@prisma/client";
import { WorkspaceStateV2 } from "@/components/ide/types";

export type ProjectScopeInput = {
    kind?: CodeProjectScopeKind;
    subjectId?: string | null;
    moduleId?: string | null;
    assignmentId?: string | null;
    scopeKey?: string | null;
};

export type SaveProjectRequest = {
    title: string;
    description?: string | null;
    language: CodeLanguage;
    workspace: WorkspaceStateV2 & JsonObject;
    entryPath?: string | null;
    activePath?: string | null;
    visibility?: CodeProjectVisibility;
    scope?: ProjectScopeInput;
    createRevision?: boolean;
    revisionNote?: string | null;
    settings?: JsonObject | null;
    meta?: JsonObject | null;

    // optimistic concurrency + future collaboration metadata
    baseVersion?: number | null;
    clientInstanceId?: string | null;
    clientDraftUpdatedAt?: string | null;
};

export type ProjectSummary = {
    id: string;
    title: string;
    description: string | null;
    language: string;
    scopeKind: string;
    visibility: string;
    currentVersion: number;
    updatedAt: string;
};

export type ProjectPayload = ProjectSummary & {
    entryPath: string | null;
    activePath: string | null;
    workspace: WorkspaceStateV2;
    settings: JsonObject | null;
    meta: JsonObject | null;
    role?: CodeProjectRole | "owner";
};

export type ProjectListResponse = {
    ok: true;
    projects: ProjectSummary[];
};

export type ProjectResponse = {
    ok: true;
    project: ProjectPayload;
};

export type ProjectConflictResponse = {
    ok: false;
    code: "PROJECT_CONFLICT";
    error: string;
    conflict: {
        projectId: string;
        clientBaseVersion: number | null;
        serverVersion: number;
        serverUpdatedAt: string;
        title: string;
    };
    project: ProjectPayload | null;
};

export type ProjectErrorResponse = {
    ok: false;
    error: string;
    paywall?: boolean;
    reason?: "requires_login" | "requires_payment";
    capability?: string;
    code?: "PROJECT_CONFLICT";
    conflict?: {
        projectId: string;
        clientBaseVersion: number | null;
        serverVersion: number;
        serverUpdatedAt: string;
        title: string;
    };
    project?: ProjectPayload | null;
};