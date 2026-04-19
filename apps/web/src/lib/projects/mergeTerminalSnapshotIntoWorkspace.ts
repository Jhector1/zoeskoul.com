import type {
    FileNode,
    FolderNode,
    FSNode,
    NodeId,
} from "@/components/ide/types";
import { uid } from "@/components/ide/utils";
import {
    isSafeRelPath,
    pathOf,
    relativeProjectPathOf,
} from "@/components/ide/fsTree";
import { repairWorkspaceStateV2 } from "@/components/ide/storage";
import {WorkspaceStateV2} from "@/components/ide/types";

type SnapshotFile = {
    path: string;
    content: string;
};

type MergeArgs = {
    prior: WorkspaceStateV2;
    snapshotFiles: SnapshotFile[];
    dirtyUiPaths?: Iterable<string>;
};

function now() {
    return Date.now();
}

function normalizeRelPath(input: string) {
    const p = String(input ?? "").replace(/\\/g, "/").trim();
    if (!p) return "";
    const clean = p.split("/").filter(Boolean).join("/");
    return isSafeRelPath(clean) ? clean : "";
}

function sortByDepthThenName(paths: string[]) {
    return [...paths].sort((a, b) => {
        const da = a.split("/").length;
        const db = b.split("/").length;
        if (da !== db) return da - db;
        return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
}

function sortFiles(files: SnapshotFile[]) {
    return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

function detectSyntheticRoot(prior: WorkspaceStateV2): FolderNode | null {
    const topFolders = prior.nodes.filter(
        (n): n is FolderNode => n.kind === "folder" && n.parentId === null,
    );
    const topFiles = prior.nodes.filter(
        (n): n is FileNode => n.kind === "file" && n.parentId === null,
    );

    if (topFolders.length === 1 && topFiles.length === 0) {
        return topFolders[0];
    }

    return null;
}

function priorFilePathMap(prior: WorkspaceStateV2) {
    const out = new Map<string, FileNode>();

    for (const node of prior.nodes) {
        if (node.kind !== "file") continue;
        const rel = normalizeRelPath(relativeProjectPathOf(prior.nodes, node.id));
        if (!rel) continue;
        out.set(rel, node);
    }

    return out;
}

function priorFolderFullPathMap(prior: WorkspaceStateV2) {
    const out = new Map<string, FolderNode>();

    for (const node of prior.nodes) {
        if (node.kind !== "folder") continue;
        const full = normalizeRelPath(pathOf(prior.nodes, node.id));
        if (!full) continue;
        out.set(full, node);
    }

    return out;
}

function buildDesiredFiles(args: {
    snapshotFiles: SnapshotFile[];
    priorFiles: Map<string, FileNode>;
    dirtyUiPaths: Set<string>;
}) {
    const map = new Map<string, string>();

    for (const file of args.snapshotFiles) {
        const rel = normalizeRelPath(file.path);
        if (!rel) continue;
        map.set(rel, file.content ?? "");
    }

    for (const rel of args.dirtyUiPaths) {
        const prior = args.priorFiles.get(rel);
        if (prior) {
            map.set(rel, prior.content ?? "");
        } else {
            map.delete(rel);
        }
    }

    return sortFiles(
        [...map.entries()].map(([path, content]) => ({ path, content })),
    );
}

function remapFileIdByRelativePath(
    prior: WorkspaceStateV2,
    nextFilesByRelPath: Map<string, FileNode>,
    wantedId: NodeId,
) {
    const wanted = prior.nodes.find(
        (n): n is FileNode => n.kind === "file" && n.id === wantedId,
    );
    if (!wanted) return null;

    const rel = normalizeRelPath(relativeProjectPathOf(prior.nodes, wanted.id));
    if (!rel) return null;

    return nextFilesByRelPath.get(rel)?.id ?? null;
}

function remapExpandedFolders(
    prior: WorkspaceStateV2,
    nextFoldersByFullPath: Map<string, FolderNode>,
) {
    const out: NodeId[] = [];

    for (const id of prior.expanded ?? []) {
        const node = prior.nodes.find(
            (n): n is FolderNode => n.kind === "folder" && n.id === id,
        );
        if (!node) continue;

        const full = normalizeRelPath(pathOf(prior.nodes, node.id));
        if (!full) continue;

        const next = nextFoldersByFullPath.get(full);
        if (next) out.push(next.id);
    }

    return out;
}

export function mergeTerminalSnapshotIntoWorkspace(
    args: MergeArgs,
): WorkspaceStateV2 {
    const { prior, snapshotFiles } = args;
    const dirtyUiPaths = new Set(
        [...(args.dirtyUiPaths ?? [])]
            .map(normalizeRelPath)
            .filter(Boolean),
    );

    const syntheticRoot = detectSyntheticRoot(prior);
    const priorFiles = priorFilePathMap(prior);
    const priorFolders = priorFolderFullPathMap(prior);

    const desiredFiles = buildDesiredFiles({
        snapshotFiles,
        priorFiles,
        dirtyUiPaths,
    });

    const fullFolderPaths = new Set<string>();
    const fullFilePaths: Array<{ rel: string; full: string; content: string }> = [];

    if (syntheticRoot) {
        fullFolderPaths.add(syntheticRoot.name);
    }

    for (const file of desiredFiles) {
        const relParts = file.path.split("/").filter(Boolean);
        const fullParts = syntheticRoot
            ? [syntheticRoot.name, ...relParts]
            : relParts;

        for (let i = 1; i < fullParts.length; i++) {
            fullFolderPaths.add(fullParts.slice(0, i).join("/"));
        }

        fullFilePaths.push({
            rel: file.path,
            full: fullParts.join("/"),
            content: file.content,
        });
    }

    const folderNodes: FolderNode[] = [];
    const folderIdByFullPath = new Map<string, NodeId>();
    const nextFoldersByFullPath = new Map<string, FolderNode>();

    for (const fullPath of sortByDepthThenName([...fullFolderPaths])) {
        const parts = fullPath.split("/");
        const name = parts[parts.length - 1];
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
        const priorFolder = priorFolders.get(fullPath);

        const node: FolderNode = {
            id: priorFolder?.id ?? uid(),
            kind: "folder",
            name,
            parentId: parentPath ? folderIdByFullPath.get(parentPath) ?? null : null,
            createdAt: priorFolder?.createdAt ?? now(),
            updatedAt: now(),
        };

        folderNodes.push(node);
        folderIdByFullPath.set(fullPath, node.id);
        nextFoldersByFullPath.set(fullPath, node);
    }

    const fileNodes: FileNode[] = [];
    const nextFilesByRelPath = new Map<string, FileNode>();

    for (const file of fullFilePaths) {
        const parts = file.full.split("/");
        const name = parts[parts.length - 1];
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
        const priorFile = priorFiles.get(file.rel);

        const node: FileNode = {
            id: priorFile?.id ?? uid(),
            kind: "file",
            name,
            parentId: parentPath ? folderIdByFullPath.get(parentPath) ?? null : null,
            content: file.content ?? "",
            createdAt: priorFile?.createdAt ?? now(),
            updatedAt: now(),
        };

        fileNodes.push(node);
        nextFilesByRelPath.set(file.rel, node);
    }

    const nodes: FSNode[] = [...folderNodes, ...fileNodes];

    const activeFileId =
        remapFileIdByRelativePath(prior, nextFilesByRelPath, prior.activeFileId) ??
        fileNodes[0]?.id ??
        "";

    const entryFileId =
        remapFileIdByRelativePath(prior, nextFilesByRelPath, prior.entryFileId) ??
        activeFileId;

    const openTabs = (prior.openTabs ?? [])
        .map((id) => remapFileIdByRelativePath(prior, nextFilesByRelPath, id))
        .filter(Boolean) as NodeId[];

    if (activeFileId && !openTabs.includes(activeFileId)) {
        openTabs.unshift(activeFileId);
    }

    const next: WorkspaceStateV2 = {
        version: 2,
        language: prior.language,
        nodes,
        openTabs: openTabs.length ? openTabs : activeFileId ? [activeFileId] : [],
        activeFileId,
        entryFileId,
        stdin: prior.stdin ?? "",
        expanded: remapExpandedFolders(prior, nextFoldersByFullPath),
        leftPct: prior.leftPct ?? 26,
    };

    return repairWorkspaceStateV2(next, prior.language);
}