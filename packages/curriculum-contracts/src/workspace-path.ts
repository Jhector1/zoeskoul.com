export type WorkspacePathKind = "file" | "folder";

export type WorkspaceExpectations = {
    entryFilePath?: string;
    requiredFiles?: string[];
    requiredFolders?: string[];
    forbiddenFiles?: string[];
};

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

function normalizeWorkspacePathList(
    value: unknown,
    label: string,
): string[] | undefined {
    if (typeof value === "undefined") return undefined;

    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array of workspace-relative paths.`);
    }

    const normalized = value.map((item, index) => {
        if (typeof item !== "string" || !item.trim()) {
            throw new Error(`${label}[${index}] must be a non-empty workspace-relative path.`);
        }

        return normalizeWorkspacePath(item);
    });

    return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

export function normalizeWorkspaceExpectations(
    value: unknown,
    label = "workspaceExpectations",
): WorkspaceExpectations | undefined {
    if (typeof value === "undefined" || value === null) return undefined;

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object.`);
    }

    const record = value as Record<string, unknown>;
    const allowedKeys = new Set([
        "entryFilePath",
        "requiredFiles",
        "requiredFolders",
        "forbiddenFiles",
    ]);

    const extraKeys = Object.keys(record).filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
        throw new Error(`${label} has unknown field(s): ${extraKeys.join(", ")}`);
    }

    let entryFilePath: string | undefined;
    if (typeof record.entryFilePath !== "undefined") {
        if (typeof record.entryFilePath !== "string" || !record.entryFilePath.trim()) {
            throw new Error(`${label}.entryFilePath must be a non-empty workspace-relative path.`);
        }

        entryFilePath = normalizeWorkspacePath(record.entryFilePath);
    }

    const requiredFiles = normalizeWorkspacePathList(
        record.requiredFiles,
        `${label}.requiredFiles`,
    );
    const requiredFolders = normalizeWorkspacePathList(
        record.requiredFolders,
        `${label}.requiredFolders`,
    );
    const forbiddenFiles = normalizeWorkspacePathList(
        record.forbiddenFiles,
        `${label}.forbiddenFiles`,
    );

    if (
        !entryFilePath &&
        !requiredFiles?.length &&
        !requiredFolders?.length &&
        !forbiddenFiles?.length
    ) {
        return undefined;
    }

    return {
        ...(entryFilePath ? { entryFilePath } : {}),
        ...(requiredFiles?.length ? { requiredFiles } : {}),
        ...(requiredFolders?.length ? { requiredFolders } : {}),
        ...(forbiddenFiles?.length ? { forbiddenFiles } : {}),
    };
}
