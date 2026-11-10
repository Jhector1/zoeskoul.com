/** Explicit null means create a NEW project; omitted target means use the current one. */
export function resolveSaveProjectTarget(
    options: { targetProjectId?: string | null } | undefined,
    currentProjectId: string | null,
    persistedProjectId: string | null,
): string | null {
    if (options && Object.prototype.hasOwnProperty.call(options, "targetProjectId")) {
        return options.targetProjectId ?? null;
    }
    return currentProjectId ?? persistedProjectId;
}
