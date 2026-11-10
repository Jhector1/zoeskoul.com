/**
 * Advisory cross-tab cloud version notice. Never use localStorage to authorize
 * a mutation or to replace an in-memory workspace. Runner and project APIs
 * remain authoritative for their respective revisions.
 */
export function newerProjectVersionFromOtherTab(
    raw: string | null,
    current: { projectId: string; baseVersion: number; clientInstanceId: string },
): { version: number; savedAt: string | null; title: string } | null {
    if (!raw || !Number.isSafeInteger(current.baseVersion) || current.baseVersion < 0) return null;
    try {
        const candidate: unknown = JSON.parse(raw);
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
        const meta = candidate as Record<string, unknown>;
        if (meta.projectId !== current.projectId ||
            typeof meta.clientInstanceId !== "string" ||
            !meta.clientInstanceId ||
            meta.clientInstanceId === current.clientInstanceId ||
            typeof meta.baseVersion !== "number" ||
            !Number.isSafeInteger(meta.baseVersion) ||
            meta.baseVersion <= current.baseVersion) return null;
        return {
            version: meta.baseVersion,
            savedAt: typeof meta.lastSavedAt === "string" ? meta.lastSavedAt : null,
            title: typeof meta.currentProjectName === "string" ? meta.currentProjectName : "Project",
        };
    } catch {
        return null;
    }
}
