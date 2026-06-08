import type { FSNode, FolderNode } from "@/components/ide/types";

const RUNNER_MANAGED_WORKSPACE_FILES = new Set([".bash_history"]);

export function splitSafeRelativePath(input: string): string[] {
    const normalized = String(input ?? "").replace(/\\/g, "/").trim();
    if (!normalized) return [];
    if (normalized.startsWith("/")) return [];
    if (normalized.includes("\0")) return [];

    const parts = normalized
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);

    if (!parts.length) return [];
    if (parts.some((part) => part === "." || part === "..")) return [];

    return parts;
}

export function normalizeSafeRelativePath(input: string): string {
    return splitSafeRelativePath(input).join("/");
}

export function stripSyntheticRootPrefix(
    parts: readonly string[],
    syntheticRootName?: string | null,
): string[] {
    if (syntheticRootName && parts[0] === syntheticRootName) {
        return parts.slice(1);
    }

    return [...parts];
}

export function normalizeUiProjectPath(
    input: string,
    syntheticRootName?: string | null,
): string {
    return stripSyntheticRootPrefix(
        splitSafeRelativePath(input),
        syntheticRootName,
    ).join("/");
}

export function isRunnerManagedWorkspacePath(
    input: string,
    syntheticRootName?: string | null,
): boolean {
    const normalized = normalizeUiProjectPath(input, syntheticRootName);
    const parts = splitSafeRelativePath(normalized);

    if (!parts.length) return false;

    // Hide shell/runtime metadata wherever it appears. Older sync bugs could
    // accidentally place .bash_history under src/; keeping this basename-based
    // avoids sending it back to the runner as a user file.
    return RUNNER_MANAGED_WORKSPACE_FILES.has(parts[parts.length - 1] ?? "");
}

export function detectSyntheticSrcRoot(nodes: FSNode[]): FolderNode | null {
    const topFolders = nodes.filter(
        (node): node is FolderNode =>
            node.kind === "folder" && node.parentId === null,
    );
    const topFiles = nodes.filter(
        (node) => node.kind === "file" && node.parentId === null,
    );

    if (
        topFolders.length === 1 &&
        topFiles.length === 0 &&
        topFolders[0].name === "src"
    ) {
        return topFolders[0];
    }

    return null;
}
