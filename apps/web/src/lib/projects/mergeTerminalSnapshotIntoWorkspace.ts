import type {
    WorkspaceStateV2,
    FSNode,
    FileNode,
    FolderNode,
    NodeId,
} from "@/components/ide/types";
import { uid } from "@/components/ide/utils";
import { pathOf, relativeProjectPathOf } from "@/components/ide/fsTree";

export type TerminalSnapshotFile = {
    path: string;
    content: string;
};

export type TerminalSyncConflict = {
    path: string;
    reason: "ui_dirty";
    uiContent: string;
    terminalContent: string;
};

export type TerminalSyncStats = {
    added: number;
    updated: number;
    unchanged: number;
    conflicts: number;
    skippedUnsafe: number;
};

export type MergeTerminalSnapshotResult = {
    workspace: WorkspaceStateV2;
    conflicts: TerminalSyncConflict[];
    stats: TerminalSyncStats;
};

function normalizeRelPath(input: string) {
    return String(input ?? "").replace(/\\/g, "/").trim();
}

function normalizeParts(input: string) {
    return normalizeRelPath(input)
        .split("/")
        .map((x) => x.trim())
        .filter((x) => !!x && x !== "." && x !== "..");
}

function isSafeRelativePath(relPath: string) {
    const normalized = normalizeRelPath(relPath);
    if (!normalized) return false;
    if (normalized.startsWith("/")) return false;
    if (normalized.includes("\0")) return false;

    const parts = normalized.split("/");
    return parts.every((part) => !!part && part !== "." && part !== "..");
}

function uniqueSnapshotFiles(files: TerminalSnapshotFile[]) {
    const byPath = new Map<string, string>();

    for (const file of files) {
        const parts = normalizeParts(file.path);
        if (!parts.length) continue;

        byPath.set(parts.join("/"), String(file.content ?? ""));
    }

    return Array.from(byPath.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, content]) => ({ path, content }));
}

function cloneNode(node: FSNode): FSNode {
    if (node.kind === "file") {
        return {
            ...node,
            content: node.content ?? "",
        } satisfies FileNode;
    }

    return {
        ...node,
    } satisfies FolderNode;
}

function getWorkspaceRootFolderId(nodes: FSNode[]): NodeId | null {
    const topFolders = nodes.filter(
        (n): n is FolderNode => n.kind === "folder" && n.parentId === null,
    );
    const topFiles = nodes.filter(
        (n): n is FileNode => n.kind === "file" && n.parentId === null,
    );

    if (topFiles.length === 0 && topFolders.length === 1) {
        return topFolders[0].id;
    }

    return null;
}

function relativeFolderPathOf(nodes: FSNode[], id: NodeId): string {
    const full = pathOf(nodes, id);
    const parts = full.split("/").filter(Boolean);

    // Match the same path semantics your exportProjectFiles() currently uses:
    // drop the synthetic project root folder when present.
    if (parts.length > 1) {
        parts.shift();
    }

    return parts.join("/");
}

function buildPathIndexes(nodes: FSNode[]) {
    const filePathToId = new Map<string, NodeId>();
    const folderPathToId = new Map<string, NodeId>();

    for (const node of nodes) {
        if (node.kind === "file") {
            const rel = relativeProjectPathOf(nodes, node.id);
            if (rel) filePathToId.set(rel, node.id);
            continue;
        }

        const rel = relativeFolderPathOf(nodes, node.id);
        if (rel) folderPathToId.set(rel, node.id);
    }

    return {
        filePathToId,
        folderPathToId,
    };
}

function buildFileContentMap(nodes: FSNode[]) {
    const out = new Map<string, string>();

    for (const node of nodes) {
        if (node.kind !== "file") continue;

        const rel = relativeProjectPathOf(nodes, node.id);
        if (!rel) continue;

        out.set(rel, node.content ?? "");
    }

    return out;
}

function buildNodeIndex(nodes: FSNode[]) {
    return new Map(nodes.map((n) => [n.id, n] as const));
}

export function mergeTerminalSnapshotIntoWorkspace(
    priorWorkspace: WorkspaceStateV2,
    snapshotFiles: TerminalSnapshotFile[],
    dirtyUiPaths: Iterable<string>,
): MergeTerminalSnapshotResult {
    const now = Date.now();
    const dirtySet = new Set(
        Array.from(dirtyUiPaths, (p) => normalizeParts(p).join("/")).filter(Boolean),
    );

    const nextNodes = priorWorkspace.nodes.map(cloneNode);
    const nodeById = buildNodeIndex(nextNodes);
    const workspaceRootFolderId = getWorkspaceRootFolderId(nextNodes);

    const { filePathToId, folderPathToId } = buildPathIndexes(nextNodes);
    const priorFileContentByPath = buildFileContentMap(nextNodes);

    const conflicts: TerminalSyncConflict[] = [];
    const stats: TerminalSyncStats = {
        added: 0,
        updated: 0,
        unchanged: 0,
        conflicts: 0,
        skippedUnsafe: 0,
    };

    const ensureFolder = (parts: string[]) => {
        let parentId: NodeId | null = workspaceRootFolderId;
        let relPath = "";

        for (const part of parts) {
            relPath = relPath ? `${relPath}/${part}` : part;

            const existing = folderPathToId.get(relPath);
            if (existing) {
                parentId = existing;
                continue;
            }

            const folderId = uid();
            const folder: FolderNode = {
                id: folderId,
                kind: "folder",
                name: part,
                parentId,
                createdAt: now,
                updatedAt: now,
            };

            nextNodes.push(folder);
            nodeById.set(folderId, folder);
            folderPathToId.set(relPath, folderId);
            parentId = folderId;
        }

        return parentId;
    };

    for (const file of uniqueSnapshotFiles(snapshotFiles)) {
        if (!isSafeRelativePath(file.path)) {
            stats.skippedUnsafe += 1;
            continue;
        }

        const parts = normalizeParts(file.path);
        if (!parts.length) {
            stats.skippedUnsafe += 1;
            continue;
        }

        const relPath = parts.join("/");
        const terminalContent = String(file.content ?? "");
        const existingFileId = filePathToId.get(relPath);

        if (!existingFileId) {
            const parentParts = parts.slice(0, -1);
            const parentId = ensureFolder(parentParts);

            const fileId = uid();
            const nextFile: FileNode = {
                id: fileId,
                kind: "file",
                name: parts[parts.length - 1]!,
                parentId,
                content: terminalContent,
                createdAt: now,
                updatedAt: now,
            };

            nextNodes.push(nextFile);
            nodeById.set(fileId, nextFile);
            filePathToId.set(relPath, fileId);
            stats.added += 1;
            continue;
        }

        const existingNode = nodeById.get(existingFileId);
        if (!existingNode || existingNode.kind !== "file") {
            stats.skippedUnsafe += 1;
            continue;
        }

        const uiContent = existingNode.content ?? "";

        if (uiContent === terminalContent) {
            stats.unchanged += 1;
            continue;
        }

        if (dirtySet.has(relPath)) {
            conflicts.push({
                path: relPath,
                reason: "ui_dirty",
                uiContent,
                terminalContent,
            });
            stats.conflicts += 1;
            continue;
        }

        existingNode.content = terminalContent;
        existingNode.updatedAt = now;
        stats.updated += 1;
    }

    // Preserve expanded folders, and auto-expand any newly created parent folders.
    const expanded = new Set(priorWorkspace.expanded);
    for (const [relPath, folderId] of folderPathToId.entries()) {
        if (!relPath.includes("/")) continue;

        const parts = relPath.split("/");
        let running = "";

        for (const part of parts) {
            running = running ? `${running}/${part}` : part;
            const id = folderPathToId.get(running);
            if (id) expanded.add(id);
        }

        expanded.add(folderId);
    }

    const nextWorkspace: WorkspaceStateV2 = {
        ...priorWorkspace,
        nodes: nextNodes,
        expanded: Array.from(expanded),
    };

    return {
        workspace: nextWorkspace,
        conflicts,
        stats,
    };
}