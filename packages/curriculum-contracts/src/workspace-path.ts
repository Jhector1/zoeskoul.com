export type WorkspacePathKind = "file" | "folder";

export function normalizeWorkspacePath(path: string): string {
    const raw = String(path ?? "");
    const trimmed = raw.trim();

    if (!trimmed) {
        throw new Error("Workspace path must not be empty.");
    }

    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
        throw new Error(`Unsafe workspace path uses a drive letter: ${path}`);
    }

    if (trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.startsWith("//") || trimmed.startsWith("\\\\")) {
        throw new Error(`Unsafe workspace path uses an absolute path: ${path}`);
    }

    if (trimmed.includes("\\")) {
        throw new Error(`Workspace paths must use POSIX "/" separators, not backslashes: ${path}`);
    }

    const normalized = trimmed;
    if (!normalized) {
        throw new Error("Workspace path must not be empty.");
    }

    if (normalized.includes("//")) {
        throw new Error(`Workspace path must not contain empty segments: ${path}`);
    }

    const parts = normalized.split("/");

    if (
        parts.some(
            (part) =>
                !part ||
                part === "." ||
                part === ".." ||
                part.includes("\0"),
        )
    ) {
        throw new Error(`Unsafe workspace path: ${path}`);
    }

    return parts.join("/");
}

export function assertValidWorkspaceFilePath(path: string): string {
    const normalized = normalizeWorkspacePath(path);

    if (normalized.endsWith("/")) {
        throw new Error(`Workspace file path must point to a file, not a folder: ${path}`);
    }

    const leaf = normalized.split("/").at(-1) ?? "";

    if (!leaf.includes(".")) {
        /**
         * This is intentionally not forbidden. Many projects have files like
         * "Dockerfile" or "Makefile". Keep the check permissive.
         */
    }

    return normalized;
}

export function workspaceFolderPathForFile(path: string): string | null {
    const normalized = normalizeWorkspacePath(path);
    const parts = normalized.split("/");
    parts.pop();

    return parts.length > 0 ? parts.join("/") : null;
}

export function workspacePathDepth(path: string): number {
    return normalizeWorkspacePath(path).split("/").length;
}