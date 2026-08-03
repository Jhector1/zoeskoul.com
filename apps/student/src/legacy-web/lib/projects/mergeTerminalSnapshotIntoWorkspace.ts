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
import { isWorkspaceInternalPath } from "@/lib/projects/workspaceInternalPaths";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import {
    isBinaryWorkspaceEntry,
    normalizeBinaryFileContent,
    workspaceFileSemanticValue,
    workspaceFileToSyncEntry,
} from "@/lib/ide/workspaceFileContent";

type SnapshotEntry = WorkspaceSyncEntry;

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
        if (isWorkspaceInternalPath(rel)) continue;

        if (entry.kind === "directory") {
            out.set(rel, { kind: "directory", path: rel });
            continue;
        }

        if (isBinaryWorkspaceEntry(entry)) {
            const binary = normalizeBinaryFileContent(entry, rel);
            if (!binary) {
                throw new Error(`Invalid binary workspace snapshot: ${rel}`);
            }
            out.set(rel, {
                kind: "file",
                path: rel,
                encoding: "base64",
                data: binary.data,
                mimeType: binary.mimeType,
                sizeBytes: binary.sizeBytes,
                ...(binary.checksum ? { checksum: binary.checksum } : {}),
            });
            continue;
        }

        out.set(rel, {
            kind: "file",
            path: rel,
            content: String(entry.content ?? ""),
        });
    }

    return out;
}

function priorInternalEntries(
    prior: WorkspaceStateV2,
    syntheticRootName?: string | null,
): SnapshotEntry[] {
    const entries: SnapshotEntry[] = [];

    for (const node of prior.nodes) {
        const rel = relativeNodePathOf(
            prior.nodes,
            node.id,
            syntheticRootName,
        );

        if (!rel || !isWorkspaceInternalPath(rel)) continue;
        if (isRunnerManagedWorkspacePath(rel, syntheticRootName)) continue;

        if (node.kind === "folder") {
            entries.push({ kind: "directory", path: rel });
            continue;
        }

        entries.push(workspaceFileToSyncEntry({ path: rel, file: node }));
    }

    return entries;
}

function buildDesiredEntries(args: {
    snapshotFiles: SnapshotEntry[];
    priorFiles: Map<string, FileNode>;
    priorFolders: Map<string, FolderNode>;
    priorInternalEntries: SnapshotEntry[];
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
            map.set(rel, workspaceFileToSyncEntry({ path: rel, file: priorFile }));
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

    /**
     * Runner snapshots intentionally omit runtime control-plane paths such as
     * `.zoeskoul/` and `.git/`. The snapshot is therefore authoritative only
     * for learner-managed paths. Preserve any authored/internal nodes already
     * present in the UI workspace instead of interpreting their omission as a
     * deletion.
     */
    for (const entry of args.priorInternalEntries) {
        map.set(entry.path, entry);
    }

    return [...map.values()].sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path);
        if (pathCmp !== 0) return pathCmp;
        if ((a.kind ?? "file") === (b.kind ?? "file")) return 0;
        return (a.kind ?? "file") === "directory" ? -1 : 1;
    });
}

function workspaceSemanticKey(workspace: WorkspaceStateV2) {
    const nodePath = (id: NodeId | null | undefined) =>
        id ? pathOf(workspace.nodes, id) || null : null;

    const nodes = workspace.nodes
        .map((node) => {
            const path = pathOf(workspace.nodes, node.id);

            if (node.kind === "file") {
                return {
                    path,
                    kind: "file" as const,
                    value: workspaceFileSemanticValue(node),
                };
            }

            return {
                path,
                kind: "folder" as const,
            };
        })
        .sort((a, b) => {
            const pathCmp = a.path.localeCompare(b.path);
            if (pathCmp !== 0) return pathCmp;
            return a.kind.localeCompare(b.kind);
        });

    return JSON.stringify({
        version: 2,
        language: workspace.language,
        nodes,
        openTabs: (workspace.openTabs ?? []).map(nodePath),
        activePath: nodePath(workspace.activeFileId),
        entryPath: nodePath(workspace.entryFileId),
        stdin: workspace.stdin ?? "",
        expanded: (workspace.expanded ?? [])
            .map(nodePath)
            .filter(Boolean)
            .sort(),
        leftPct: workspace.leftPct ?? 26,
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
            .filter((path) => !isWorkspaceInternalPath(path))
            .filter(Boolean),
    );

    const priorFiles = priorFilePathMap(prior, syntheticRootName);
    const priorFolders = priorFolderPathMap(prior, syntheticRootId, syntheticRootName);
    const desiredEntries = buildDesiredEntries({
        snapshotFiles,
        priorFiles,
        priorFolders,
        priorInternalEntries: priorInternalEntries(prior, syntheticRootName),
        dirtyUiPaths,
        syntheticRootName,
    });

    const timestamp = now();

    const desiredFolderRelPaths = new Set<string>();
    const desiredFiles = desiredEntries.filter(
        (entry): entry is Exclude<WorkspaceSyncEntry, { kind: "directory" }> =>
            entry.kind !== "directory",
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
            createdAt: priorFolder?.createdAt ?? timestamp,
            updatedAt: priorFolder?.updatedAt ?? timestamp,
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
        const binary = isBinaryWorkspaceEntry(file)
            ? normalizeBinaryFileContent(file, name)
            : undefined;
        if (isBinaryWorkspaceEntry(file) && !binary) {
            throw new Error(`Invalid binary workspace snapshot: ${file.path}`);
        }
        const content = binary ? "" : String((file as any).content ?? "");
        const nextSemanticValue = binary
            ? workspaceFileSemanticValue({ content: "", binary })
            : workspaceFileSemanticValue({ content });
        const contentChanged = priorFile
            ? workspaceFileSemanticValue(priorFile) !== nextSemanticValue
            : true;

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
            content,
            ...(binary ? { binary } : {}),
            createdAt: priorFile?.createdAt ?? timestamp,
            updatedAt: contentChanged
                ? timestamp
                : priorFile?.updatedAt ?? timestamp,
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

    const repaired = repairWorkspaceStateV2(next, prior.language);

    /**
     * Read-only terminal commands and commands that mutate only `.git/` should
     * not manufacture a new controlled workspace. Returning the original object
     * lets callers skip hydration and prevents the learning IDE from remounting
     * merely because a post-Enter snapshot completed.
     */
    return workspaceSemanticKey(repaired) === workspaceSemanticKey(prior)
        ? prior
        : repaired;
}
