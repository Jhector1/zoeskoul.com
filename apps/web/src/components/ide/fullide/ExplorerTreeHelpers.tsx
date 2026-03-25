import type { FSNode, NodeId } from "../types";
import {
    buildFsIndex,
    childrenOf as _childrenOf,
    pathOf as _pathOf,
    subtreeIds as _subtreeIds,
} from "../fsTree";

export const childrenOf = _childrenOf;
export const pathOf = _pathOf;

export function nodeMatchesFilterFactory(nodes: FSNode[], filterLower: string) {
    const needle = String(filterLower ?? "").trim().toLocaleLowerCase();

    return (id: NodeId) => {
        if (!needle) return true;
        const p = _pathOf(nodes, id).toLocaleLowerCase();
        return p.includes(needle);
    };
}

export function folderHasMatchFactory(
    nodes: FSNode[],
    nodeMatchesFilter: (id: NodeId) => boolean,
) {
    const { childrenByParent } = buildFsIndex(nodes);
    const memo = new Map<NodeId, boolean>();

    const visit = (folderId: NodeId): boolean => {
        if (memo.has(folderId)) return memo.get(folderId)!;

        for (const child of childrenByParent.get(folderId) ?? []) {
            if (nodeMatchesFilter(child.id)) {
                memo.set(folderId, true);
                return true;
            }

            if (child.kind === "folder" && visit(child.id)) {
                memo.set(folderId, true);
                return true;
            }
        }

        memo.set(folderId, false);
        return false;
    };

    return visit;
}

export function subtreeIds(nodes: FSNode[], rootId: NodeId) {
    return _subtreeIds(nodes, rootId);
}