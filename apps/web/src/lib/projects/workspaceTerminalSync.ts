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

function normalizeParts(input: string) {
    return String(input ?? "")
        .replace(/\\/g, "/")
        .split("/")
        .map((x) => x.trim())
        .filter((x) => !!x && x !== "." && x !== "..");
}

function detectSyntheticRoot(prior: WorkspaceStateV2) {
    if (prior.language === "sql") return null;

    const topFolders = prior.nodes.filter(
        (n): n is FolderNode => n.kind === "folder" && n.parentId === null,
    );
    const topFiles = prior.nodes.filter(
        (n): n is FileNode => n.kind === "file" && n.parentId === null,
    );

    if (topFiles.length === 0 && topFolders.length === 1 && topFolders[0].name === "src") {
        return "src";
    }

    return null;
}

function relativeNodePath(
    nodes: FSNode[],
    id: NodeId,
    syntheticRoot: string | null,
) {
    const full = pathOf(nodes, id);
    const parts = full.split("/").filter(Boolean);

    if (syntheticRoot && parts[0] === syntheticRoot) {
        parts.shift();
    }

    return parts.join("/");
}

function filePathIfAny(
    ws: WorkspaceStateV2,
    id: NodeId,
    syntheticRoot: string | null,
) {
    const node = ws.nodes.find((n) => n.id === id);
    if (!node || node.kind !== "file") return null;
    return relativeProjectPathOf(ws.nodes, id) || relativeNodePath(ws.nodes, id, syntheticRoot);
}

function folderPathIfAny(
    ws: WorkspaceStateV2,
    id: NodeId,
    syntheticRoot: string | null,
) {
    const node = ws.nodes.find((n) => n.id === id);
    if (!node || node.kind !== "folder") return null;
    return relativeNodePath(ws.nodes, id, syntheticRoot);
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

export function mergeWorkspaceWithTerminalSnapshot(args: {
    prior: WorkspaceStateV2;
    files: TerminalSnapshotFile[];
}): WorkspaceStateV2 {
    const { prior } = args;
    const snapshotFiles = uniqueSnapshotFiles(args.files);

    if (!snapshotFiles.length) return prior;

    const syntheticRoot = detectSyntheticRoot(prior);
    const timestamp = Date.now();

    const nodes: FSNode[] = [];
    const filePathToId = new Map<string, NodeId>();
    const folderPathToId = new Map<string, NodeId>();

    let syntheticRootId: NodeId | null = null;

    if (syntheticRoot) {
        syntheticRootId = uid();
        nodes.push({
            id: syntheticRootId,
            kind: "folder",
            name: syntheticRoot,
            parentId: null,
            createdAt: timestamp,
            updatedAt: timestamp,
        } satisfies FolderNode);
    }

    const ensureFolder = (parts: string[]) => {
        let parentId: NodeId | null = syntheticRootId;
        let relPath = "";

        for (const part of parts) {
            relPath = relPath ? `${relPath}/${part}` : part;

            const existingId = folderPathToId.get(relPath);
            if (existingId) {
                parentId = existingId;
                continue;
            }

            const nextId = uid();
            nodes.push({
                id: nextId,
                kind: "folder",
                name: part,
                parentId,
                createdAt: timestamp,
                updatedAt: timestamp,
            } satisfies FolderNode);

            folderPathToId.set(relPath, nextId);
            parentId = nextId;
        }

        return parentId;
    };

    for (const file of snapshotFiles) {
        const parts = normalizeParts(file.path);
        if (!parts.length) continue;

        const name = parts[parts.length - 1]!;
        const parentParts = parts.slice(0, -1);
        const parentId = ensureFolder(parentParts);
        const fileId = uid();

        nodes.push({
            id: fileId,
            kind: "file",
            name,
            parentId,
            content: file.content,
            createdAt: timestamp,
            updatedAt: timestamp,
        } satisfies FileNode);

        filePathToId.set(parts.join("/"), fileId);
    }

    const firstFileId =
        nodes.find((n): n is FileNode => n.kind === "file")?.id ?? "";

    const prevActivePath = filePathIfAny(prior, prior.activeFileId, syntheticRoot);
    const prevEntryPath = filePathIfAny(prior, prior.entryFileId, syntheticRoot);

    const activeFileId =
        (prevActivePath ? filePathToId.get(prevActivePath) : undefined) ?? firstFileId;

    const entryFileId =
        (prevEntryPath ? filePathToId.get(prevEntryPath) : undefined) ?? activeFileId;

    const openTabs = Array.from(
        new Set(
            prior.openTabs
                .map((id) => filePathIfAny(prior, id, syntheticRoot))
                .filter((p): p is string => !!p)
                .map((p) => filePathToId.get(p))
                .filter((id): id is string => !!id),
        ),
    );

    if (activeFileId && !openTabs.includes(activeFileId)) {
        openTabs.unshift(activeFileId);
    }

    const expanded = new Set<NodeId>();

    if (syntheticRootId) {
        expanded.add(syntheticRootId);
    }

    for (const folderId of prior.expanded) {
        const rel = folderPathIfAny(prior, folderId, syntheticRoot);
        if (!rel) continue;

        const mapped = folderPathToId.get(rel);
        if (mapped) expanded.add(mapped);
    }

    for (const path of [prevActivePath, prevEntryPath]) {
        if (!path) continue;

        const parts = normalizeParts(path);
        let rel = "";

        for (const part of parts.slice(0, -1)) {
            rel = rel ? `${rel}/${part}` : part;
            const folderId = folderPathToId.get(rel);
            if (folderId) expanded.add(folderId);
        }
    }

    return {
        version: 2,
        language: prior.language,
        nodes,
        openTabs: openTabs.length ? openTabs : [activeFileId],
        activeFileId,
        entryFileId,
        stdin: prior.stdin ?? "",
        expanded: Array.from(expanded),
        leftPct: prior.leftPct ?? 26,
    };
}