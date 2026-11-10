import { cloudWorkspaceFingerprint } from "../../projects/hooks/cloudWorkspaceFingerprint";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";

/** Validate a cloud GET before adopting its identity or saved baseline. */
export function isValidCloudProjectSnapshot(
    body: unknown,
    expectedId: string,
): boolean {
    if (!body || typeof body !== "object") return false;
    const response = body as Record<string, unknown>;
    if (response.ok !== true || !response.project || typeof response.project !== "object") return false;
    const project = response.project as Record<string, unknown>;
    const ws = project.workspace as Record<string, unknown> | null | undefined;
    return project.id === expectedId &&
        typeof project.title === "string" &&
        Number.isSafeInteger(project.currentVersion) && Number(project.currentVersion) >= 1 &&
        typeof project.updatedAt === "string" && Number.isFinite(Date.parse(project.updatedAt)) &&
        !!ws && ws.version === 2 && Array.isArray(ws.nodes) &&
        typeof ws.language === "string";
}

/** Never discard edits introduced *after* the user requested a reload. */
export function workspaceChangedDuringCloudReload(
    expected: WorkspaceStateV2 | null,
    current: WorkspaceStateV2 | null,
): boolean {
    return cloudWorkspaceFingerprint(expected) !== cloudWorkspaceFingerprint(current);
}

/** A no-op save must not send a PATCH or advance the cloud version. */
export function canSkipUnchangedCloudSave(args: {
    projectId: string | null;
    baseVersion: number | null;
    isDirty: boolean;
    hasConflict: boolean;
}): boolean {
    return Boolean(args.projectId &&
        args.baseVersion != null && Number.isSafeInteger(args.baseVersion) && args.baseVersion >= 1 &&
        !args.isDirty && !args.hasConflict);
}
