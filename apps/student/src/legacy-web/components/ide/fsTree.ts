import type { FSNode, FileNode, FolderNode, NodeId } from "./types";
import type { FileEntry, WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { workspaceFileToSyncEntry } from "@/lib/ide/workspaceFileContent";
import {
    detectSyntheticSrcRoot,
    normalizeSafeRelativePath,
    normalizeUiProjectPath,
    splitSafeRelativePath,
} from "@/lib/projects/workspacePathMapping";

type FsIndex = {
    byId: Map<NodeId, FSNode>;
    childrenByParent: Map<NodeId | null, FSNode[]>;
};

function sortNodes(a: FSNode, b: FSNode) {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export type ProjectPathOptions = {
    /**
     * Legacy mode for callers that intentionally want the single top-level src
     * folder treated as a virtual project root. Full IDE workspace/terminal
     * synchronization should keep this false so the Explorer and the runner see
     * the same paths.
     */
    stripSyntheticRoot?: boolean;
};

function relativeNodePathOf(
    nodes: FSNode[],
    id: NodeId,
    options?: ProjectPathOptions,
): string {
    const rawPath = normalizeSafeRelativePath(pathOf(nodes, id));

    if (!options?.stripSyntheticRoot) {
        return rawPath;
    }

    const syntheticRoot = detectSyntheticSrcRoot(nodes);
    return normalizeUiProjectPath(rawPath, syntheticRoot?.name ?? null);
}
export function buildFsIndex(nodes: FSNode[]): FsIndex {
    const byId = new Map<NodeId, FSNode>();
    const childrenByParent = new Map<NodeId | null, FSNode[]>();

    for (const node of nodes) {
        byId.set(node.id, node);

        const list = childrenByParent.get(node.parentId) ?? [];
        list.push(node);
        childrenByParent.set(node.parentId, list);
    }

    for (const list of childrenByParent.values()) {
        list.sort(sortNodes);
    }

    return { byId, childrenByParent };
}

export function ensureUniqueSiblingName(
    nodes: FSNode[],
    parentId: NodeId | null,
    desired: string,
) {
    const base = (desired ?? "").trim() || "untitled";

    const siblingNames = new Set(
        nodes
            .filter((x) => x.parentId === parentId)
            .map((x) => x.name.toLocaleLowerCase()),
    );

    if (!siblingNames.has(base.toLocaleLowerCase())) return base;

    const dot = base.lastIndexOf(".");
    const hasExt = dot > 0;
    const stem = hasExt ? base.slice(0, dot) : base;
    const ext = hasExt ? base.slice(dot) : "";

    let i = 2;
    while (siblingNames.has(`${stem}-${i}${ext}`.toLocaleLowerCase())) i++;
    return `${stem}-${i}${ext}`;
}

export function childrenOf(nodes: FSNode[], parentId: NodeId | null) {
    const { childrenByParent } = buildFsIndex(nodes);
    return (childrenByParent.get(parentId) ?? []).slice();
}

export function findFile(nodes: FSNode[], id: NodeId) {
    const n = nodes.find((x) => x.id === id);
    return n && n.kind === "file" ? (n as FileNode) : undefined;
}

export function subtreeIds(nodes: FSNode[], rootId: NodeId) {
    const { childrenByParent } = buildFsIndex(nodes);
    const out = new Set<NodeId>();
    const stack = [rootId];

    while (stack.length) {
        const cur = stack.pop()!;
        if (out.has(cur)) continue;

        out.add(cur);

        for (const child of childrenByParent.get(cur) ?? []) {
            stack.push(child.id);
        }
    }

    return out;
}

export function isSafeRelPath(p: string) {
    return splitSafeRelativePath(p).length > 0;
}

export function pathOf(nodes: FSNode[], id: NodeId): string {
    const { byId } = buildFsIndex(nodes);
    const parts: string[] = [];
    const seen = new Set<NodeId>();

    let cur = byId.get(id);

    while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        parts.push(cur.name);

        if (!cur.parentId) break;
        cur = byId.get(cur.parentId);
    }

    parts.reverse();
    return parts.join("/");
}

export function exportProjectFiles(
    nodes: FSNode[],
    options?: ProjectPathOptions,
): FileEntry[] {
    const files = nodes.filter((n): n is FileNode => n.kind === "file");

    const out = files.map((file) => {
        const path = relativeProjectPathOf(nodes, file.id, options);
        return workspaceFileToSyncEntry({ path, file }) as FileEntry;
    });

    for (const file of out) {
        if (!isSafeRelPath(file.path)) {
            throw new Error(`Unsafe file path: ${file.path}`);
        }
    }

    return out;
}

export function exportWorkspaceEntries(nodes: FSNode[]): WorkspaceSyncEntry[] {
    const folders = nodes
        .filter((n): n is FolderNode => n.kind === "folder")
        .map((folder) => ({
            kind: "directory" as const,
            path: rawNodePathOf(nodes, folder.id),
        }))
        .filter((entry) => !!entry.path && isSafeRelPath(entry.path))
        .sort((a, b) => {
            const da = a.path.split("/").length;
            const db = b.path.split("/").length;
            if (da !== db) return da - db;
            return a.path.localeCompare(b.path);
        });

    const files = nodes
        .filter((n): n is FileNode => n.kind === "file")
        .map((file) => {
            const path = rawNodePathOf(nodes, file.id);
            return workspaceFileToSyncEntry({ path, file });
        })
        .filter((entry) => !!entry.path && isSafeRelPath(entry.path))
        .sort((a, b) => a.path.localeCompare(b.path));

    return [...folders, ...files];
}
function rawNodePathOf(nodes: FSNode[], id: NodeId): string {
    return normalizeSafeRelativePath(pathOf(nodes, id));
}
export function relativeProjectPathOf(
    nodes: FSNode[],
    id: NodeId,
    options?: ProjectPathOptions,
): string {
    return relativeNodePathOf(nodes, id, options);
}
