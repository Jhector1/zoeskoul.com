import type { WorkspaceStateV2 } from "@/components/ide/types";
import { defaultMainFile } from "@/components/ide/languageDefaults";
import type { WorkspaceLanguage } from "@/lib/practice/types";

export type NormalizedStarterFile = {
    path: string;
    content: string;
};

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

const STARTER_FILE_META_KEYS = new Set([
    "entryFile",
    "entryFilePath",
    "mainFile",
    "mainFilePath",
    "language",
    "lang",
]);

const STARTER_INTENT_META_KEYS = new Set([
    ...STARTER_FILE_META_KEYS,
    "path",
    "filePath",
    "filename",
    "name",
    "entry",
    "isEntry",
    "main",
]);

export function hasStarterIntentValue(value: unknown): boolean {
    if (isUsableStarterCode(value) || isI18nAliasString(value)) return true;

    if (Array.isArray(value)) {
        return value.some((entry) => hasStarterIntentValue(entry));
    }

    if (!value || typeof value !== "object") return false;

    return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
        if (STARTER_INTENT_META_KEYS.has(key)) return false;
        return hasStarterIntentValue(entry);
    });
}

export function normalizeStarterPath(input: unknown, fallback: string) {
    const raw = typeof input === "string" && input.trim() ? input : fallback;

    const parts = raw
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .split("/")
        .map((part) => part.trim())
        .filter((part) => part && part !== "." && part !== "..");

    return parts.join("/") || fallback;
}

export function defaultStarterEntryFile(language?: string | null) {
    return defaultMainFile((language || "python") as WorkspaceLanguage);
}

function starterFilePath(value: unknown, fallback: string) {
    if (typeof value === "string") return normalizeStarterPath(value, fallback);
    if (!isRecord(value)) return fallback;

    return normalizeStarterPath(
        value.path ?? value.filePath ?? value.filename ?? value.name,
        fallback,
    );
}

export function starterFileContent(value: unknown): string {
    if (typeof value === "string") return "";
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
        if (typeof candidate === "string") {
            return isUsableStarterCode(candidate) ? candidate : "";
        }
    }

    return "";
}

export function unwrapStarterFilesValue(raw: unknown): unknown {
    if (!isRecord(raw)) return raw;

    return (
        raw.starterFiles ??
        raw.files ??
        raw.initialFiles ??
        raw.workspaceFiles ??
        raw.entries ??
        raw.items ??
        raw
    );
}

export function normalizeStarterFilesValue(
    raw: unknown,
    fallbackEntryFile: string,
): NormalizedStarterFile[] {
    const files: NormalizedStarterFile[] = [];
    const source = unwrapStarterFilesValue(raw);

    if (Array.isArray(source)) {
        source.forEach((file, index) => {
            const fallback =
                index === 0 ? fallbackEntryFile : `file-${String(index + 1)}.txt`;

            files.push({
                path: normalizeStarterPath(starterFilePath(file, fallback), fallback),
                content: starterFileContent(file),
            });
        });

        return files.filter((file) => file.path);
    }

    if (isRecord(source)) {
        for (const [path, value] of Object.entries(source)) {
            if (STARTER_FILE_META_KEYS.has(path)) continue;

            files.push({
                path: normalizeStarterPath(path, fallbackEntryFile),
                content:
                    typeof value === "string"
                        ? isUsableStarterCode(value)
                            ? value
                            : ""
                        : starterFileContent(value),
            });
        }
    }

    return files.filter((file) => file.path);
}

/**
 * Merge starter/fixture file sources with one important rule:
 * a blank file produced from an unresolved @: alias must not block a later
 * resolved file for the same path. First non-empty content wins; an earlier
 * empty placeholder is replaced by a later usable starter file.
 */
export function mergeStarterFileSources(
    sources: unknown[],
    fallbackEntryFile: string,
): NormalizedStarterFile[] {
    const byPath = new Map<string, NormalizedStarterFile>();

    for (const source of sources) {
        const normalized = normalizeStarterFilesValue(source, fallbackEntryFile);

        for (const file of normalized) {
            const path = normalizeStarterPath(file.path, fallbackEntryFile);
            if (!path) continue;

            const next: NormalizedStarterFile = {
                path,
                content: file.content ?? "",
            };
            const existing = byPath.get(path);

            if (!existing) {
                byPath.set(path, next);
                continue;
            }

            if (!isUsableStarterCode(existing.content) && isUsableStarterCode(next.content)) {
                byPath.set(path, next);
            }
        }
    }

    return Array.from(byPath.values());
}

export function pickEntryFileFromStarterFilesValue(
    raw: unknown,
    fallbackEntryFile: string,
): string {
    const source = unwrapStarterFilesValue(raw);

    if (Array.isArray(source)) {
        const entry = source.find((file) => {
            if (!isRecord(file)) return false;
            return file.entry === true || file.isEntry === true || file.main === true;
        });

        if (entry) return starterFilePath(entry, "");

        const first = source.find((file) => {
            if (typeof file === "string") return file.trim().length > 0;
            return isRecord(file) && starterFilePath(file, "").trim().length > 0;
        });

        return first ? starterFilePath(first, "") : fallbackEntryFile;
    }

    if (isRecord(source)) {
        const explicit = normalizeStarterPath(
            source.entryFile ?? source.entryFilePath ?? source.mainFile ?? source.mainFilePath,
            "",
        );
        if (explicit) return explicit;

        for (const [path] of Object.entries(source)) {
            if (STARTER_FILE_META_KEYS.has(path)) continue;

            const normalized = normalizeStarterPath(path, "");
            if (normalized) return normalized;
        }
    }

    return fallbackEntryFile;
}

export function starterFileContentForPath(files: unknown, path: string): string {
    const normalizedPath = normalizeStarterPath(path, path);
    const source = unwrapStarterFilesValue(files);

    if (Array.isArray(source)) {
        const match = source.find((file) => {
            return isRecord(file) && starterFilePath(file, "") === normalizedPath;
        });

        return starterFileContent(match);
    }

    if (isRecord(source)) {
        const match = source[normalizedPath];
        if (typeof match === "string") return isUsableStarterCode(match) ? match : "";
        return starterFileContent(match);
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
            if (STARTER_FILE_META_KEYS.has(key)) return false;
            if (typeof entry === "string") return isUsableStarterCode(entry);
            return isUsableStarterCode(starterFileContent(entry));
        });
    }

    return false;
}

export function firstUsableStarterFilesValue(...values: unknown[]) {
    for (const value of values) {
        if (hasUsableStarterFilesValue(value)) return value;
    }

    return undefined;
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
