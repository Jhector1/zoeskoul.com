import type {
    FileNode,
    FolderNode,
    FSNode,
    NodeId,
    WorkspaceStateV2,
} from "@/components/ide/types";
import { uid } from "@/components/ide/utils";
import {
    pathOf,
} from "@/components/ide/fsTree";
import { repairWorkspaceStateV2 } from "@/components/ide/storage";
import {
    isRunnerManagedWorkspacePath,
    normalizeUiProjectPath,
} from "@/lib/projects/workspacePathMapping";

type SnapshotEntry =
    | { kind?: "file"; path: string; content: string }
    | { kind: "directory"; path: string };

type MergeArgs = {
    prior: WorkspaceStateV2;
    snapshotFiles: SnapshotEntry[];
    dirtyUiPaths?: Iterable<string>;
};

function now() {
    return Date.now();
}

function normalizeRelPath(
    input: string,
    syntheticRootName?: string | null,
) {
    return normalizeUiProjectPath(input, syntheticRootName);
}

function sortByDepthThenName(paths: string[]) {
    return [...paths].sort((a, b) => {
        const da = a.split("/").length;
        const db = b.split("/").length;
        if (da !== db) return da - db;
        return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
}

function detectSyntheticRoot(_prior: WorkspaceStateV2): FolderNode | null {
    // The Explorer path is the real workspace path. A top-level "src" folder must
    // stay a real folder so terminal commands such as `touch ft.txt` at
    // /workspace create a root-level file beside src, not a file inside src.
    return null;
}

function relativeNodePathOf(
    nodes: FSNode[],
    id: NodeId,
    syntheticRootName?: string | null,
) {
    return normalizeRelPath(pathOf(nodes, id), syntheticRootName);
}

function priorFilePathMap(
    prior: WorkspaceStateV2,
    syntheticRootName?: string | null,
) {
    const out = new Map<string, FileNode>();

    for (const node of prior.nodes) {
        if (node.kind !== "file") continue;
        const rel = relativeNodePathOf(prior.nodes, node.id, syntheticRootName);
        if (!rel) continue;
        out.set(rel, node);
    }

    return out;
}

function priorFolderPathMap(
    prior: WorkspaceStateV2,
    syntheticRootId?: string | null,
    syntheticRootName?: string | null,
) {
    const out = new Map<string, FolderNode>();

    for (const node of prior.nodes) {
        if (node.kind !== "folder") continue;
        if (syntheticRootId && node.id === syntheticRootId) continue;

        const rel = relativeNodePathOf(prior.nodes, node.id, syntheticRootName);
        if (!rel) continue;
        out.set(rel, node);
    }

    return out;
}

function normalizeSnapshotEntries(
    entries: SnapshotEntry[],
    syntheticRootName?: string | null,
) {
    const out = new Map<string, SnapshotEntry>();

    for (const entry of entries ?? []) {
        const rel = normalizeRelPath(entry?.path, syntheticRootName);
        if (!rel) continue;
        if (isRunnerManagedWorkspacePath(rel, syntheticRootName)) continue;

        if ((entry as any)?.kind === "directory") {
            out.set(rel, { kind: "directory", path: rel });
        } else {
            out.set(rel, {
                kind: "file",
                path: rel,
                content: String((entry as any)?.content ?? ""),
            });
        }
    }

    return out;
}
function buildDesiredEntries(args: {
    snapshotFiles: SnapshotEntry[];
    priorFiles: Map<string, FileNode>;
    priorFolders: Map<string, FolderNode>;
    dirtyUiPaths: Set<string>;
    syntheticRootName?: string | null;
}) {
    const map = normalizeSnapshotEntries(
        args.snapshotFiles,
        args.syntheticRootName,
    );

    for (const rel of args.dirtyUiPaths) {
        const priorFile = args.priorFiles.get(rel);
        const priorFolder = args.priorFolders.get(rel);

        if (priorFile) {
            map.set(rel, {
                kind: "file",
                path: rel,
                content: priorFile.content ?? "",
            });
            continue;
        }

        if (priorFolder) {
            map.set(rel, {
                kind: "directory",
                path: rel,
            });
            continue;
        }

        map.delete(rel);
    }

    return [...map.values()].sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path);
        if (pathCmp !== 0) return pathCmp;
        if ((a.kind ?? "file") === (b.kind ?? "file")) return 0;
        return (a.kind ?? "file") === "directory" ? -1 : 1;
    });
}

function parentRelPath(rel: string) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
}

function remapFileIdByRelativePath(
    prior: WorkspaceStateV2,
    nextFilesByRelPath: Map<string, FileNode>,
    wantedId: NodeId,
    syntheticRootName?: string | null,
) {
    const wanted = prior.nodes.find(
        (n): n is FileNode => n.kind === "file" && n.id === wantedId,
    );
    if (!wanted) return null;

    const rel = relativeNodePathOf(prior.nodes, wanted.id, syntheticRootName);
    if (!rel) return null;

    return nextFilesByRelPath.get(rel)?.id ?? null;
}

function remapExpandedFolders(
    prior: WorkspaceStateV2,
    nextFoldersByRelPath: Map<string, FolderNode>,
    syntheticRootId?: string | null,
    syntheticRootName?: string | null,
) {
    const out: NodeId[] = [];

    for (const id of prior.expanded ?? []) {
        const node = prior.nodes.find(
            (n): n is FolderNode => n.kind === "folder" && n.id === id,
        );
        if (!node) continue;
        if (syntheticRootId && node.id === syntheticRootId) continue;

        const rel = relativeNodePathOf(prior.nodes, node.id, syntheticRootName);
        if (!rel) continue;

        const next = nextFoldersByRelPath.get(rel);
        if (next) out.push(next.id);
    }

    return out;
}

export function mergeTerminalSnapshotIntoWorkspace(
    args: MergeArgs,
): WorkspaceStateV2 {
    const { prior, snapshotFiles } = args;

    const syntheticRoot = detectSyntheticRoot(prior);
    const syntheticRootId = syntheticRoot?.id ?? null;
    const syntheticRootName = syntheticRoot?.name ?? null;

    const dirtyUiPaths = new Set(
        [...(args.dirtyUiPaths ?? [])]
            .map((path) => normalizeRelPath(path, syntheticRootName))
            .filter((path) => !isRunnerManagedWorkspacePath(path, syntheticRootName))
            .filter(Boolean),
    );

    const priorFiles = priorFilePathMap(prior, syntheticRootName);
    const priorFolders = priorFolderPathMap(prior, syntheticRootId, syntheticRootName);
    const desiredEntries = buildDesiredEntries({
        snapshotFiles,
        priorFiles,
        priorFolders,
        dirtyUiPaths,
        syntheticRootName,
    });

    const desiredFolderRelPaths = new Set<string>();
    const desiredFiles = desiredEntries.filter(
        (entry): entry is { kind?: "file"; path: string; content: string } =>
            (entry.kind ?? "file") !== "directory",
    );

    for (const entry of desiredEntries) {
        if ((entry.kind ?? "file") === "directory") {
            desiredFolderRelPaths.add(entry.path);

            let current = parentRelPath(entry.path);
            while (current) {
                desiredFolderRelPaths.add(current);
                current = parentRelPath(current);
            }
            continue;
        }

        let current = parentRelPath(entry.path);
        while (current) {
            desiredFolderRelPaths.add(current);
            current = parentRelPath(current);
        }
    }

    const folderNodes: FolderNode[] = [];
    const folderIdByRelPath = new Map<string, NodeId>();
    const nextFoldersByRelPath = new Map<string, FolderNode>();

    if (syntheticRoot) {
        const rootNode: FolderNode = {
            id: syntheticRoot.id,
            kind: "folder",
            name: syntheticRoot.name,
            parentId: null,
            createdAt: syntheticRoot.createdAt ?? now(),
            updatedAt: now(),
        };
        folderNodes.push(rootNode);
        folderIdByRelPath.set("", rootNode.id);
    }

    for (const relPath of sortByDepthThenName([...desiredFolderRelPaths])) {
        const priorFolder = priorFolders.get(relPath);
        const name = relPath.split("/").filter(Boolean).pop() ?? relPath;
        const parentRel = parentRelPath(relPath);

        const node: FolderNode = {
            id: priorFolder?.id ?? uid(),
            kind: "folder",
            name,
            parentId:
                parentRel === ""
                    ? syntheticRoot
                        ? folderIdByRelPath.get("") ?? null
                        : null
                    : folderIdByRelPath.get(parentRel) ?? null,
            createdAt: priorFolder?.createdAt ?? now(),
            updatedAt: now(),
        };

        folderNodes.push(node);
        folderIdByRelPath.set(relPath, node.id);
        nextFoldersByRelPath.set(relPath, node);
    }

    const fileNodes: FileNode[] = [];
    const nextFilesByRelPath = new Map<string, FileNode>();

    for (const file of desiredFiles) {
        const priorFile = priorFiles.get(file.path);
        const name = file.path.split("/").filter(Boolean).pop() ?? file.path;
        const parentRel = parentRelPath(file.path);

        const node: FileNode = {
            id: priorFile?.id ?? uid(),
            kind: "file",
            name,
            parentId:
                parentRel === ""
                    ? syntheticRoot
                        ? folderIdByRelPath.get("") ?? null
                        : null
                    : folderIdByRelPath.get(parentRel) ?? null,
            content: file.content ?? "",
            createdAt: priorFile?.createdAt ?? now(),
            updatedAt: now(),
        };

        fileNodes.push(node);
        nextFilesByRelPath.set(file.path, node);
    }

    const nodes: FSNode[] = [...folderNodes, ...fileNodes];

    const activeFileId =
        remapFileIdByRelativePath(
            prior,
            nextFilesByRelPath,
            prior.activeFileId,
            syntheticRootName,
        ) ??
        fileNodes[0]?.id ??
        "";

    const entryFileId =
        remapFileIdByRelativePath(
            prior,
            nextFilesByRelPath,
            prior.entryFileId,
            syntheticRootName,
        ) ?? activeFileId;

    const openTabs = (prior.openTabs ?? [])
        .map((id) =>
            remapFileIdByRelativePath(
                prior,
                nextFilesByRelPath,
                id,
                syntheticRootName,
            ),
        )
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
        expanded: remapExpandedFolders(
            prior,
            nextFoldersByRelPath,
            syntheticRootId,
            syntheticRootName,
        ),
        leftPct: prior.leftPct ?? 26,
    };

    return repairWorkspaceStateV2(next, prior.language);
}
