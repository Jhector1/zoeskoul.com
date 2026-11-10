/** Only an acknowledged cloud project may advance the local saved baseline. */
export function isValidCloudSaveAcknowledgment(
    data: unknown,
    requestedProjectId: string | null,
    currentProjectId: string | null = null,
): boolean {
    if (!data || typeof data !== "object") return false;
    const response = data as {ok?: unknown; project?: unknown};
    if (response.ok !== true || !response.project || typeof response.project !== "object") return false;
    const project = response.project as {id?: unknown; currentVersion?: unknown; updatedAt?: unknown};
    if (typeof project.id !== "string" || !project.id.trim()) return false;
    if (requestedProjectId && requestedProjectId !== project.id) return false;
    // A "Save Copy" POST must never be acknowledged as an update of the original.
    if (requestedProjectId === null && currentProjectId && project.id === currentProjectId) return false;
    if (!Number.isSafeInteger(project.currentVersion) || Number(project.currentVersion) < 1) return false;
    if (typeof project.updatedAt !== "string" || !project.updatedAt.trim() ||
        !Number.isFinite(Date.parse(project.updatedAt))) return false;
    return true;
}
