import type { WorkspaceStateV2 } from "@/components/ide/types";

export function isI18nAliasString(value: unknown): value is string {
    return typeof value === "string" && value.trim().startsWith("@:");
}

export function isUsableStarterCode(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        !isI18nAliasString(value)
    );
}

export function cleanStarterCode(value: unknown): string | undefined {
    return isUsableStarterCode(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function starterFileContent(value: unknown): string {
    if (typeof value === "string") return value;
    if (!isRecord(value)) return "";

    for (const key of [
        "content",
        "contents",
        "text",
        "code",
        "source",
        "body",
        "value",
    ] as const) {
        const candidate = value[key];
        if (typeof candidate === "string") return candidate;
    }

    return "";
}

export function hasUsableStarterFilesValue(value: unknown): boolean {
    if (Array.isArray(value)) {
        // In starterFiles arrays, a bare string is a path, not file content.
        return value.some((entry) => {
            if (typeof entry === "string") return false;
            return isUsableStarterCode(starterFileContent(entry));
        });
    }

    if (isRecord(value)) {
        return Object.entries(value).some(([key, entry]) => {
            if (
                [
                    "entryFile",
                    "entryFilePath",
                    "mainFile",
                    "mainFilePath",
                    "language",
                    "lang",
                ].includes(key)
            ) {
                return false;
            }

            return isUsableStarterCode(starterFileContent(entry));
        });
    }

    return false;
}

export function workspaceHasUsableStarterContent(
    workspace: WorkspaceStateV2 | null | undefined,
): boolean {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return false;
    }

    return workspace.nodes.some((node: any) => {
        if (node?.kind !== "file") return false;
        return isUsableStarterCode(node.content);
    });
}