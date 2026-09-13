export type SemanticCheckRecord = Record<string, unknown>;

export function asSemanticChecks(value: unknown): SemanticCheckRecord[] {
    if (!Array.isArray(value)) return [];

    return value.filter(
        (check): check is SemanticCheckRecord =>
            Boolean(check) && typeof check === "object" && !Array.isArray(check),
    );
}

export function normalizeSemanticCheckPath(value: unknown): string {
    const raw = typeof value === "string" ? value.trim() : "";

    if (!raw) return "";

    if (
        raw.startsWith("/") ||
        raw.startsWith("\\") ||
        raw.includes("\\") ||
        /^[a-zA-Z]:[\\/]/.test(raw) ||
        raw.includes("//")
    ) {
        return "";
    }

    const parts = raw.split("/");

    if (
        parts.length === 0 ||
        parts.some(
            (part) =>
                !part ||
                part === "." ||
                part === ".." ||
                part.includes("\0"),
        )
    ) {
        return "";
    }

    return parts.join("/");
}

/**
 * Shared schemas intentionally own the supported semantic-check fields. During
 * a gradual contract rollout they may not know about `path` yet, so preserve
 * only that app extension after parsing instead of bypassing schema validation.
 */
export function stripSemanticCheckPaths<T extends SemanticCheckRecord>(
    value: readonly T[] | null | undefined,
): T[];
export function stripSemanticCheckPaths(value: unknown): SemanticCheckRecord[];
export function stripSemanticCheckPaths(value: unknown): SemanticCheckRecord[] {
    return asSemanticChecks(value).map((check) => {
        const { path: _path, ...schemaCheck } = check;
        return schemaCheck;
    });
}

export function restoreSemanticCheckPaths(args: {
    parsedChecks: unknown;
    rawChecks: unknown;
}): SemanticCheckRecord[] {
    const parsedChecks = asSemanticChecks(args.parsedChecks);
    const rawChecks = asSemanticChecks(args.rawChecks);

    return parsedChecks.map((parsedCheck, index) => {
        const rawPath = rawChecks[index]?.path;

        if (typeof rawPath !== "string" || !rawPath.trim()) {
            return parsedCheck;
        }

        return {
            ...parsedCheck,
            path: rawPath.trim(),
        };
    });
}

export function manifestFilePaths(value: unknown): Set<string> {
    const paths = new Set<string>();

    if (Array.isArray(value)) {
        for (const entry of value) {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                continue;
            }

            const normalized = normalizeSemanticCheckPath(
                (entry as Record<string, unknown>).path,
            );

            if (normalized) paths.add(normalized);
        }

        return paths;
    }

    if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
            const entryPath =
                entry && typeof entry === "object" && !Array.isArray(entry)
                    ? (entry as Record<string, unknown>).path
                    : undefined;
            const normalized = normalizeSemanticCheckPath(entryPath ?? key);

            if (normalized) paths.add(normalized);
        }
    }

    return paths;
}

export function assertSemanticCheckPaths(args: {
    checks: unknown;
    availableFiles?: unknown;
    exerciseId: string;
}): void {
    const checks = asSemanticChecks(args.checks);
    const availableFiles = manifestFilePaths(args.availableFiles);

    for (const [index, check] of checks.entries()) {
        if (typeof check.path !== "string" || !check.path.trim()) continue;

        const normalizedPath = normalizeSemanticCheckPath(check.path);

        if (!normalizedPath) {
            throw new Error(
                `Generator bug: semanticChecks[${index}].path is unsafe for "${args.exerciseId}".`,
            );
        }

        if (availableFiles.size > 0 && !availableFiles.has(normalizedPath)) {
            throw new Error(
                `Generator bug: semanticChecks[${index}].path "${normalizedPath}" is not present in the authored files for "${args.exerciseId}".`,
            );
        }
    }
}
