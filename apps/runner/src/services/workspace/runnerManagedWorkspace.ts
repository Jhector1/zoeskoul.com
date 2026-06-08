export const RUNNER_MANAGED_FILES = new Set([".bash_history"]);
export const RUNNER_MANAGED_DIRS = new Set(["build"]);

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

export function isRunnerManagedFilePath(relPath: string) {
    const parts = safePathParts(relPath);
    if (!parts.length) return false;

    // Treat runtime metadata as managed by basename, not only by exact root path.
    // This also cleans up older bad states such as src/.bash_history.
    return RUNNER_MANAGED_FILES.has(parts[parts.length - 1] ?? "");
}

export function isRunnerManagedDirPath(relPath: string) {
    const parts = safePathParts(relPath);
    if (!parts.length) return false;

    return parts.some((part) => RUNNER_MANAGED_DIRS.has(part));
}
