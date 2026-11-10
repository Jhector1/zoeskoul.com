/** Conflict UI + API safety policy. No mutation or version promotion occurs here. */
export type CloudSaveIntent = "save" | "resolve";

export function cloudSaveIntent(conflict: boolean): CloudSaveIntent {
    return conflict ? "resolve" : "save";
}

export function isUnresolvedCloudUpdate(args: {
    targetProjectId: string | null;
    conflictProjectId: string | null;
}): boolean {
    return Boolean(args.targetProjectId && args.conflictProjectId &&
        args.targetProjectId === args.conflictProjectId);
}
