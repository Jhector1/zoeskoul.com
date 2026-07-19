import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { isBinaryWorkspaceEntry } from "@/lib/ide/workspaceFileContent";

export function normalizeWorkspaceSyncPath(input: string) {
    return String(input ?? "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/+/g, "/")
        .replace(/\/$/, "")
        .trim();
}

export function normalizeWorkspaceSyncEntry(
    entry: WorkspaceSyncEntry,
): WorkspaceSyncEntry {
    if (entry.kind === "directory") {
        return {
            kind: "directory",
            path: normalizeWorkspaceSyncPath(entry.path),
        };
    }

    const path = normalizeWorkspaceSyncPath(entry.path);
    if (isBinaryWorkspaceEntry(entry)) {
        return {
            kind: "file",
            path,
            encoding: "base64",
            data: String(entry.data ?? ""),
            mimeType: String(entry.mimeType ?? "application/octet-stream"),
            sizeBytes:
                typeof entry.sizeBytes === "number" && Number.isFinite(entry.sizeBytes)
                    ? Math.max(0, Math.trunc(entry.sizeBytes))
                    : 0,
            ...(entry.checksum ? { checksum: String(entry.checksum) } : {}),
        };
    }

    return {
        kind: "file",
        path,
        content: String(entry.content ?? ""),
    };
}

export function sortWorkspaceSyncEntries(
    entries: WorkspaceSyncEntry[],
): WorkspaceSyncEntry[] {
    return entries
        .map(normalizeWorkspaceSyncEntry)
        .filter((entry) => Boolean(entry.path))
        .sort((a, b) => {
            const pathCmp = a.path.localeCompare(b.path);
            if (pathCmp !== 0) return pathCmp;
            if (a.kind === b.kind) return 0;
            return a.kind === "directory" ? -1 : 1;
        });
}

export function workspaceSyncEntryValue(entry: WorkspaceSyncEntry) {
    if (entry.kind === "directory") return "__DIR__";
    if (isBinaryWorkspaceEntry(entry)) {
        return `__BINARY__:${entry.checksum ?? ""}:${entry.mimeType}:${entry.sizeBytes}:${entry.data}`;
    }
    return `__TEXT__:${entry.content}`;
}

export function workspaceSyncEntriesEqual(
    leftEntries: WorkspaceSyncEntry[],
    rightEntries: WorkspaceSyncEntry[],
) {
    const left = sortWorkspaceSyncEntries(leftEntries);
    const right = sortWorkspaceSyncEntries(rightEntries);
    if (left.length !== right.length) return false;

    for (let index = 0; index < left.length; index += 1) {
        const a = left[index];
        const b = right[index];
        if (a.kind !== b.kind || a.path !== b.path) return false;
        if (workspaceSyncEntryValue(a) !== workspaceSyncEntryValue(b)) return false;
    }

    return true;
}
