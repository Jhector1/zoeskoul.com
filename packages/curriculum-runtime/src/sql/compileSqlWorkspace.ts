export type SqlWorkspaceFile = {
    path?: string;
    name?: string;
    content?: string;
};

function normalizePath(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export function compileSqlWorkspace(args: {
    files: SqlWorkspaceFile[] | Record<string, string | { content?: string }>;
    fileOrder: string[];
}): string {
    const entries = Array.isArray(args.files)
        ? args.files.map((file) => [
            normalizePath(file.path ?? file.name),
            String(file.content ?? "").trim(),
        ] as const)
        : Object.entries(args.files).map(([path, value]) => [
            normalizePath(path),
            typeof value === "string"
                ? value.trim()
                : String(value?.content ?? "").trim(),
        ] as const);
    const filePathsFromEntries = entries.map(([path]) => path);
    if (
        filePathsFromEntries.some((path) => !path) ||
        new Set(filePathsFromEntries).size !== filePathsFromEntries.length
    ) {
        throw new Error("SQL workspace files must have unique non-empty paths.");
    }

    const byPath = new Map(entries);
    const normalizedOrder = args.fileOrder.map(normalizePath).filter(Boolean);

    if (new Set(normalizedOrder).size !== normalizedOrder.length) {
        throw new Error("SQL file order contains duplicate paths.");
    }

    const filePaths = Array.from(byPath.keys()).filter(Boolean);
    const missing = filePaths.filter((path) => !normalizedOrder.includes(path));
    const unknown = normalizedOrder.filter((path) => !byPath.has(path));
    if (missing.length > 0 || unknown.length > 0) {
        throw new Error(
            [
                "SQL file order must contain every workspace file exactly once.",
                missing.length ? `Missing: ${missing.join(", ")}.` : "",
                unknown.length ? `Unknown: ${unknown.join(", ")}.` : "",
            ].filter(Boolean).join(" "),
        );
    }

    return normalizedOrder
        .map((path) =>
            [`-- file: ${path}`, byPath.get(path) ?? ""]
                .filter(Boolean)
                .join("\n"),
        )
        .join("\n\n")
        .trim();
}
