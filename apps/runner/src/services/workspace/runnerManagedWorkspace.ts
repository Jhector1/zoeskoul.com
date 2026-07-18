export const RUNNER_MANAGED_FILES = new Set([".bash_history"]);
export const RUNNER_MANAGED_DIRS = new Set(["build"]);

/**
 * Runtime state that belongs to the active shell rather than to the editor
 * projection. These directories must survive editor-to-terminal replacement,
 * but they must never be returned to Explorer snapshots.
 */
export const WORKSPACE_INTERNAL_STATE_DIRS = new Set([".git", ".zoeskoul"]);

export function normalizeWorkspaceRelPath(input: string) {
    return String(input ?? "").replace(/\\/g, "/").trim();
}

function safePathParts(input: string) {
    const normalized = normalizeWorkspaceRelPath(input);
    if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
        return [];
    }

    const parts = normalized.split("/").filter(Boolean);
    if (parts.some((part) => part === "." || part === "..")) return [];
    return parts;
}

function pathContainsSegment(input: string, segments: Set<string>) {
    return safePathParts(input).some((part) => segments.has(part));
}

export function isRunnerManagedFilePath(relPath: string) {
    const parts = safePathParts(relPath);
    if (!parts.length) return false;

    // Treat runtime metadata as managed by basename, not only by exact root path.
    // This also cleans up older bad states such as src/.bash_history.
    return RUNNER_MANAGED_FILES.has(parts[parts.length - 1] ?? "");
}

export function isRunnerManagedDirPath(relPath: string) {
    return pathContainsSegment(relPath, RUNNER_MANAGED_DIRS);
}

export function isWorkspaceInternalStatePath(relPath: string) {
    return pathContainsSegment(relPath, WORKSPACE_INTERNAL_STATE_DIRS);
}

export function isWorkspacePreservedPath(relPath: string) {
    return (
        isRunnerManagedFilePath(relPath) ||
        isRunnerManagedDirPath(relPath) ||
        isWorkspaceInternalStatePath(relPath)
    );
}

export function isWorkspaceSnapshotHiddenDirPath(relPath: string) {
    return (
        isRunnerManagedDirPath(relPath) ||
        isWorkspaceInternalStatePath(relPath)
    );
}
