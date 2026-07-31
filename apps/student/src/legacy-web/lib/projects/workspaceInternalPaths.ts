const WORKSPACE_INTERNAL_SEGMENTS = new Set([".zoeskoul", ".git"]);

function workspacePathSegments(path: string): string[] {
    return String(path ?? "")
        .replace(/\\/g, "/")
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
}

/**
 * Returns true for runtime-managed workspace paths that must stay out of the
 * learner presentation and cannot be used as snapshot-readiness evidence.
 *
 * `.gitignore` remains learner-visible because matching is segment-based.
 */
export function isWorkspaceInternalPath(path: string): boolean {
    return workspacePathSegments(path).some((segment) =>
        WORKSPACE_INTERNAL_SEGMENTS.has(segment),
    );
}
