import type { FSNode, FileNode, NodeId } from "../types";

const LEARNER_HIDDEN_WORKSPACE_SEGMENTS = new Set([".zoeskoul", ".git"]);

export type LearnerWorkspacePresentation = {
    nodes: FSNode[];
    tabFiles: FileNode[];
    activeFileId: NodeId | null;
    entryFileId: NodeId | null;
    activeFile: FileNode | null;
    entryFile: FileNode | null;
};

export function isLearnerHiddenWorkspacePath(path: string): boolean {
    return String(path ?? "")
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .some((segment) => LEARNER_HIDDEN_WORKSPACE_SEGMENTS.has(segment));
}

function learnerPresentableNodeIds(nodes: FSNode[]): Set<NodeId> {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const memo = new Map<NodeId, boolean>();

    const isPresentable = (node: FSNode, visiting = new Set<NodeId>()): boolean => {
        const cached = memo.get(node.id);
        if (cached != null) return cached;

        const nodeName = String(node.name ?? "").trim();
        if (
            visiting.has(node.id) ||
            !nodeName ||
            isLearnerHiddenWorkspacePath(nodeName)
        ) {
            memo.set(node.id, false);
            return false;
        }

        if (node.parentId) {
            const parent = byId.get(node.parentId);
            if (!parent) {
                memo.set(node.id, false);
                return false;
            }

            const nextVisiting = new Set(visiting);
            nextVisiting.add(node.id);
            if (!isPresentable(parent, nextVisiting)) {
                memo.set(node.id, false);
                return false;
            }
        }

        memo.set(node.id, true);
        return true;
    };

    return new Set(
        nodes.filter((node) => isPresentable(node)).map((node) => node.id),
    );
}

export function learnerVisibleWorkspaceNodes(nodes: FSNode[]): FSNode[] {
    const presentableIds = learnerPresentableNodeIds(nodes);
    return nodes.filter((node) => presentableIds.has(node.id));
}

export function learnerVisibleTabFiles(
    nodes: FSNode[],
    files: FileNode[],
): FileNode[] {
    const presentableIds = learnerPresentableNodeIds(nodes);
    return files.filter((file) => presentableIds.has(file.id));
}

function visibleFileById(
    visibleFilesById: Map<NodeId, FileNode>,
    id: NodeId | null | undefined,
): FileNode | null {
    return id ? visibleFilesById.get(id) ?? null : null;
}

export function resolveLearnerWorkspacePresentation(args: {
    nodes: FSNode[];
    tabFiles: FileNode[];
    activeFileId: NodeId | null | undefined;
    entryFileId: NodeId | null | undefined;
}): LearnerWorkspacePresentation {
    const nodes = learnerVisibleWorkspaceNodes(args.nodes);
    const visibleFiles = nodes.filter(
        (node): node is FileNode => node.kind === "file",
    );
    const visibleFilesById = new Map(
        visibleFiles.map((file) => [file.id, file]),
    );
    const requestedTabs = learnerVisibleTabFiles(args.nodes, args.tabFiles);
    const requestedActiveFile = visibleFileById(
        visibleFilesById,
        args.activeFileId,
    );
    const requestedEntryFile = visibleFileById(
        visibleFilesById,
        args.entryFileId,
    );

    const activeFile =
        requestedActiveFile ??
        requestedEntryFile ??
        requestedTabs[0] ??
        visibleFiles[0] ??
        null;
    const entryFile = requestedEntryFile ?? activeFile;

    const tabFiles = activeFile
        ? [
            ...requestedTabs,
            ...(requestedTabs.some((file) => file.id === activeFile.id)
                ? []
                : [activeFile]),
        ]
        : requestedTabs;

    return {
        nodes,
        tabFiles,
        activeFileId: activeFile?.id ?? null,
        entryFileId: entryFile?.id ?? null,
        activeFile,
        entryFile,
    };
}
