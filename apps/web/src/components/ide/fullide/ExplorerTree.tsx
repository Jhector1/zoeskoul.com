"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FSNode, InlineEdit, NodeId } from "../types";
import { cn } from "../utils";
import {
    childrenOf,
    folderHasMatchFactory,
    nodeMatchesFilterFactory,
    pathOf,
    subtreeIds,
} from "./ExplorerTreeHelpers";
import NodeMenu, { type MenuAction } from "./NodeMenu";
import {
    IconChevronDown,
    IconChevronRight,
    IconFile,
    IconFolder,
    IconPlay,
    IconPlus,
    IconPencil,
    IconTrash,
} from "./icons";
import {IdeWorkspacePolicy} from "@/components/ide/workspaceHook/workspace.policy";

function setInlineValuePreserveCaret(
    setInlineEdit: React.Dispatch<React.SetStateAction<InlineEdit>>,
    el: HTMLInputElement,
    next: string,
) {
    const start = el.selectionStart ?? next.length;
    const end = el.selectionEnd ?? next.length;

    setInlineEdit((s) => (s ? { ...s, value: next } : s));

    requestAnimationFrame(() => {
        if (document.activeElement === el) {
            try {
                el.setSelectionRange(start, end);
            } catch {}
        }
    });
}

function explorerTestIdForNode(name: string) {
    return `tools-file-node-${String(name ?? "")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
}

function IndentGuides({ depth }: { depth: number }) {
    if (depth <= 0) return null;
    return (
        <div className="flex">
            {Array.from({ length: depth }).map((_, i) => (
                <div key={i} className="relative h-8 w-[14px]">
                    <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-neutral-200 dark:bg-white/10" />
                </div>
            ))}
        </div>
    );
}

function InlineNameRow(props: {
    depth: number;
    kind: "file" | "folder";
    initialFocus?: boolean;
    value: string;
    setInlineEdit: React.Dispatch<React.SetStateAction<InlineEdit>>;
    commitInlineEdit: () => void;
    cancelInlineEdit: () => void;
}) {
    const {
        depth,
        kind,
        initialFocus,
        value,
        setInlineEdit,
        commitInlineEdit,
        cancelInlineEdit,
    } = props;

    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!initialFocus) return;
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [initialFocus]);

    return (
        <div className="rounded-md border border-neutral-200 bg-white px-2 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex min-h-[36px] items-center">
                <IndentGuides depth={depth} />
                <div className="grid h-5 w-5 place-items-center opacity-50" />
                <div className="grid h-5 w-5 place-items-center text-neutral-600 dark:text-white/70">
                    {kind === "folder" ? (
                        <IconFolder className="h-3.5 w-3.5" />
                    ) : (
                        <IconFile className="h-3.5 w-3.5" />
                    )}
                </div>

                <input
                    ref={inputRef}
                    value={value}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                        setInlineValuePreserveCaret(
                            setInlineEdit,
                            e.currentTarget,
                            e.target.value,
                        )
                    }
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitInlineEdit();
                        if (e.key === "Escape") cancelInlineEdit();
                    }}
                    className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-900 outline-none transition-colors dark:border-white/10 dark:bg-black/20 dark:text-white/85"
                />
            </div>

            <div className="mt-2 flex items-center gap-1.5 sm:ml-[24px]">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        commitInlineEdit();
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-600/20 bg-emerald-500/10 px-2.5 text-[11px] font-medium text-emerald-900 transition-colors hover:bg-emerald-500/15 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100 dark:hover:bg-emerald-300/15"
                >
                    Save
                </button>

                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelInlineEdit();
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

function canMoveInto(args: {
    nodes: FSNode[];
    sourceId: NodeId;
    targetParentId: NodeId | null;
}) {
    const { nodes, sourceId, targetParentId } = args;

    if (sourceId === targetParentId) return false;
    if (targetParentId == null) return true;

    const source = nodes.find((n) => n.id === sourceId);
    if (!source) return false;

    if (source.kind === "folder") {
        const descendants = subtreeIds(nodes, sourceId);
        if (descendants.has(targetParentId)) return false;
    }

    return true;
}

type TreeProps = {
    parentId: NodeId | null;
    depth: number;

    nodes: FSNode[];
    expanded: Set<NodeId>;
    activeFileId: NodeId;
    entryFileId: NodeId;
    isSql?: boolean;

    filterLower: string;
    nodeMatchesFilter: (id: NodeId) => boolean;
    folderHasMatch: (id: NodeId) => boolean;

    inlineEdit: InlineEdit;
    setInlineEdit: React.Dispatch<React.SetStateAction<InlineEdit>>;

    openFile: (id: NodeId) => void;
    toggleFolder: (id: NodeId) => void;

    startNewFile: (parentId: NodeId | null) => void;
    startNewFolder: (parentId: NodeId | null) => void;
    startRename: (id: NodeId) => void;

    setEntry: (id: NodeId) => void;
    requestDelete: (id: NodeId) => void;
    moveNode: (id: NodeId, parentId: NodeId | null) => void;

    commitInlineEdit: () => void;
    cancelInlineEdit: () => void;

    openContextMenu: (e: React.MouseEvent, actions: MenuAction[]) => void;
    policy: IdeWorkspacePolicy;
    dragState: {
        draggingId: NodeId | null;
        dropParentId: NodeId | null;
        setDraggingId: React.Dispatch<React.SetStateAction<NodeId | null>>;
        setDropParentId: React.Dispatch<React.SetStateAction<NodeId | null>>;
        scheduleAutoExpand: (folderId: NodeId, isOpen: boolean) => void;
        clearAutoExpand: (folderId?: NodeId) => void;
    };

    touchState: {
        isTouchLike: boolean;
        pendingMoveId: NodeId | null;
        setPendingMoveId: React.Dispatch<React.SetStateAction<NodeId | null>>;
        finishMove: (targetParentId: NodeId | null) => void;
    };
};

function Tree(props: TreeProps) {
    const {
        parentId,
        depth,
        nodes,
        expanded,
        activeFileId,
        entryFileId,
        isSql = false,
        filterLower,
        nodeMatchesFilter,
        folderHasMatch,
        inlineEdit,
        setInlineEdit,
        openFile,
        toggleFolder,
        startNewFile,
        startNewFolder,
        startRename,
        setEntry,
        requestDelete,
        moveNode,
        commitInlineEdit,
        cancelInlineEdit,
        openContextMenu,
        dragState,
        touchState,
        policy,
    } = props;

    const {
        draggingId,
        dropParentId,
        setDraggingId,
        setDropParentId,
        scheduleAutoExpand,
        clearAutoExpand,
    } = dragState;

    const { isTouchLike, pendingMoveId, setPendingMoveId, finishMove } = touchState;

    const kids = childrenOf(nodes, parentId).filter((n) => {
        if (!filterLower) return true;
        if (n.kind === "file") return nodeMatchesFilter(n.id);
        return nodeMatchesFilter(n.id) || folderHasMatch(n.id);
    });

    const showInlineNewHere =
        inlineEdit &&
        (inlineEdit.mode === "new-file" || inlineEdit.mode === "new-folder") &&
        inlineEdit.parentId === parentId;

    return (
        <div className="space-y-[2px]">
            {showInlineNewHere ? (
                <InlineNameRow
                    depth={depth}
                    kind={inlineEdit.mode === "new-folder" ? "folder" : "file"}
                    initialFocus
                    value={inlineEdit?.value ?? ""}
                    setInlineEdit={setInlineEdit as React.Dispatch<React.SetStateAction<InlineEdit>>}
                    commitInlineEdit={commitInlineEdit}
                    cancelInlineEdit={cancelInlineEdit}
                />
            ) : null}

            {kids.map((n) => {
                const isFolder = n.kind === "folder";
                const isOpen = isFolder && expanded.has(n.id);
                const isActive = n.kind === "file" && n.id === activeFileId;
                const isEntry = !isSql && n.kind === "file" && n.id === entryFileId;
                const hasChildren = isFolder && childrenOf(nodes, n.id).length > 0;
                const isRenaming = inlineEdit?.mode === "rename" && inlineEdit?.targetId === n.id;

                const disableDelete =
                    !isSql &&
                    ((n.kind === "file" && n.id === entryFileId) ||
                        (n.kind === "folder" && subtreeIds(nodes, n.id).has(entryFileId)));

                const canDropHere =
                    draggingId != null &&
                    isFolder &&
                    canMoveInto({
                        nodes,
                        sourceId: draggingId,
                        targetParentId: n.id,
                    });

                const isDropTarget = canDropHere && dropParentId === n.id;

                const canTapMoveHere =
                    pendingMoveId != null &&
                    isFolder &&
                    canMoveInto({
                        nodes,
                        sourceId: pendingMoveId,
                        targetParentId: n.id,
                    });

                const baseFileActions: MenuAction[] = [
                    ...(!isSql
                        ? [
                            {
                                label: isEntry ? "Entry file" : "Set as Entry",
                                onClick: () => setEntry(n.id),
                                icon: <IconPlay className="h-4 w-4" />,
                                disabled: isEntry,
                            },
                        ]
                        : []),
                    ...(policy.canRenameNodes
                        ? [
                            {
                                label: "Rename",
                                onClick: () => startRename(n.id),
                                icon: <IconPencil className="h-4 w-4" />,
                            },
                        ]
                        : []),
                    ...(policy.canDeleteNodes
                        ? [
                            {
                                label: "Delete",
                                onClick: () => requestDelete(n.id),
                                icon: <IconTrash className="h-4 w-4" />,
                                danger: true,
                                disabled: disableDelete,
                            },
                        ]
                        : []),
                ];

                const baseFolderActions: MenuAction[] = [
                    ...(policy.canCreateFiles
                        ? [
                            {
                                label: "New file",
                                onClick: () => startNewFile(n.id),
                                icon: <IconPlus className="h-4 w-4" />,
                            },
                        ]
                        : []),
                    ...(policy.canCreateFolders
                        ? [
                            {
                                label: "New folder",
                                onClick: () => startNewFolder(n.id),
                                icon: <IconFolder className="h-4 w-4" />,
                            },
                        ]
                        : []),
                    ...(policy.canRenameNodes
                        ? [
                            {
                                label: "Rename",
                                onClick: () => startRename(n.id),
                                icon: <IconPencil className="h-4 w-4" />,
                            },
                        ]
                        : []),
                    ...(policy.canDeleteNodes
                        ? [
                            {
                                label: "Delete",
                                onClick: () => requestDelete(n.id),
                                icon: <IconTrash className="h-4 w-4" />,
                                danger: true,
                                disabled: disableDelete,
                            },
                        ]
                        : []),
                ];



                const moveAction: MenuAction[] =
                    isTouchLike && policy.canMoveNodes
                        ? [
                            {
                                label: "Move to…",
                                onClick: () => setPendingMoveId(n.id),
                                icon: <IconFolder className="h-4 w-4" />,
                            },
                        ]
                        : [];

                const actions = isFolder
                    ? [...moveAction, ...baseFolderActions]
                    : [...moveAction, ...baseFileActions];

                if (isRenaming) {
                    return (
                        <div key={n.id}>
                            <InlineNameRow
                                depth={depth}
                                kind={isFolder ? "folder" : "file"}
                                initialFocus
                                value={inlineEdit?.value ?? ""}
                                setInlineEdit={setInlineEdit as React.Dispatch<React.SetStateAction<InlineEdit>>}
                                commitInlineEdit={commitInlineEdit}
                                cancelInlineEdit={cancelInlineEdit}
                            />

                            {isFolder && isOpen ? (
                                <div className="mt-[2px]">
                                    <Tree
                                        parentId={n.id}
                                        depth={depth + 1}
                                        nodes={nodes}
                                        expanded={expanded}
                                        activeFileId={activeFileId}
                                        entryFileId={entryFileId}
                                        isSql={isSql}
                                        filterLower={filterLower}
                                        nodeMatchesFilter={nodeMatchesFilter}
                                        folderHasMatch={folderHasMatch}
                                        inlineEdit={inlineEdit}
                                        setInlineEdit={setInlineEdit}
                                        openFile={openFile}
                                        toggleFolder={toggleFolder}
                                        startNewFile={startNewFile}
                                        startNewFolder={startNewFolder}
                                        startRename={startRename}
                                        setEntry={setEntry}
                                        policy={policy}
                                        requestDelete={requestDelete}
                                        moveNode={moveNode}
                                        commitInlineEdit={commitInlineEdit}
                                        cancelInlineEdit={cancelInlineEdit}
                                        openContextMenu={openContextMenu}
                                        dragState={dragState}
                                        touchState={touchState}
                                    />
                                </div>
                            ) : null}
                        </div>
                    );
                }

                return (
                    <div key={n.id}>
                        <div
                            data-tree-node-row="true"
                            onContextMenu={(e) => openContextMenu(e, actions)}
                            onDragOver={(e) => {
                                if (draggingId == null) return;
                                e.stopPropagation();

                                if (!canDropHere) return;

                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setDropParentId(n.id);
                                scheduleAutoExpand(n.id, isOpen);
                            }}
                            onDragLeave={(e) => {
                                e.stopPropagation();
                                if (dropParentId === n.id) {
                                    setDropParentId(null);
                                }
                                clearAutoExpand(n.id);
                            }}
                            onDrop={(e) => {
                                e.stopPropagation();

                                if (!canDropHere || draggingId == null) return;

                                e.preventDefault();
                                moveNode(draggingId, n.id);
                                setDraggingId(null);
                                setDropParentId(null);
                                clearAutoExpand();
                            }}
                            className={cn(
                                "group flex min-h-[36px] items-center rounded-md border border-transparent px-2",                                "hover:bg-neutral-50 hover:border-neutral-200 dark:hover:bg-white/[0.06] dark:hover:border-white/10",
                                isActive && "bg-neutral-50 border-neutral-200 dark:bg-white/[0.08] dark:border-white/10",
                                isDropTarget &&
                                "border-emerald-400 bg-emerald-50/80 dark:border-emerald-300/50 dark:bg-emerald-400/10",
                                pendingMoveId === n.id &&
                                "ring-1 ring-sky-300 bg-sky-50/70 dark:ring-sky-300/40 dark:bg-sky-400/10",
                                canTapMoveHere &&
                                "border-dashed border-emerald-400/80",
                            )}
                            title={pathOf(nodes, n.id)}
                        >
                            <IndentGuides depth={depth} />

                            <div
                                draggable={!isTouchLike}
                                onDragStart={(e) => {
                                    if (isTouchLike) return;
                                    e.stopPropagation();
                                    setDraggingId(n.id);
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", String(n.id));
                                }}
                                onDragEnd={(e) => {
                                    e.stopPropagation();
                                    setDraggingId(null);
                                    setDropParentId(null);
                                    clearAutoExpand();
                                }}
                                className={cn(
                                    "mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-neutral-400",
                                    "cursor-grab hover:bg-neutral-100 hover:text-neutral-700 active:cursor-grabbing dark:hover:bg-white/[0.06] dark:hover:text-white/80",
                                    isTouchLike && "opacity-40",
                                    draggingId === n.id && "opacity-50",
                                )}
                                title={isTouchLike ? "Use Move to… from the menu" : "Drag to move"}
                                aria-label={isTouchLike ? "Use Move to action" : "Drag handle"}
                            >
                                <span className="select-none text-[12px] font-medium leading-none">⋮⋮</span>                            </div>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    if (pendingMoveId != null && isFolder && canTapMoveHere) {
                                        finishMove(n.id);
                                        return;
                                    }

                                    if (isFolder) toggleFolder(n.id);
                                    else openFile(n.id);
                                }}
                                className={cn(
                                    "grid h-7 w-7 place-items-center rounded-lg",
                                    "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:text-white/55 dark:hover:text-white/90 dark:hover:bg-white/[0.06]",
                                    !isFolder && "pointer-events-none opacity-0",
                                    isFolder && !hasChildren && "opacity-40",
                                )}
                                title={isFolder ? (isOpen ? "Collapse" : "Expand") : ""}
                            >
                                {isFolder ? (
                                    isOpen ? (
                                        <IconChevronDown className="h-4 w-4" />
                                    ) : (
                                        <IconChevronRight className="h-4 w-4" />
                                    )
                                ) : null}
                            </button>

                            <div className="grid h-7 w-7 place-items-center text-neutral-700 dark:text-white/80">
                                {isFolder ? (
                                    <IconFolder className="h-4 w-4" />
                                ) : (
                                    <IconFile className="h-4 w-4" />
                                )}
                            </div>

                            <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                data-testid={explorerTestIdForNode(n.name)}
                                data-node-kind={n.kind}
                                data-node-active={isActive ? "true" : "false"}
                                data-node-entry={isEntry ? "true" : "false"}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    if (pendingMoveId != null && isFolder && canTapMoveHere) {
                                        finishMove(n.id);
                                        return;
                                    }

                                    if (isFolder) toggleFolder(n.id);
                                    else openFile(n.id);
                                }}
                            >
                                <div className="truncate text-[12px] font-medium text-neutral-900 dark:text-white/85">                                    {n.name}
                                </div>
                            </button>

                            {isEntry ? (
                                <div className="mr-1 ui-pill-good" title="Runs when you click Run">
                                    <IconPlay className="h-3 w-3" />
                                    ENTRY
                                </div>
                            ) : null}

                            <div className="ml-1 flex items-center">
                                <NodeMenu actions={actions} />
                            </div>
                        </div>

                        {isFolder && isOpen ? (
                            <div className="mt-[2px]">
                                <Tree
                                    parentId={n.id}
                                    depth={depth + 1}
                                    nodes={nodes}
                                    expanded={expanded}
                                    activeFileId={activeFileId}
                                    entryFileId={entryFileId}
                                    isSql={isSql}
                                    filterLower={filterLower}
                                    nodeMatchesFilter={nodeMatchesFilter}
                                    folderHasMatch={folderHasMatch}
                                    inlineEdit={inlineEdit}
                                    setInlineEdit={setInlineEdit}
                                    openFile={openFile}
                                    toggleFolder={toggleFolder}
                                    startNewFile={startNewFile}
                                    startNewFolder={startNewFolder}
                                    startRename={startRename}
                                    setEntry={setEntry}
                                    requestDelete={requestDelete}
                                    moveNode={moveNode}
                                    commitInlineEdit={commitInlineEdit}
                                    cancelInlineEdit={cancelInlineEdit}
                                    openContextMenu={openContextMenu}
                                    dragState={dragState}
                                    policy={policy}
                                    touchState={touchState}
                                />
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

export default function ExplorerTree(props: {
    nodes: FSNode[];
    expanded: Set<NodeId>;
    activeFileId: NodeId;
    entryFileId: NodeId;
    isSql?: boolean;

    filter: string;
    inlineEdit: InlineEdit;
    setInlineEdit: React.Dispatch<React.SetStateAction<InlineEdit>>;

    openFile: (id: NodeId) => void;
    toggleFolder: (id: NodeId) => void;

    startNewFile: (parentId: NodeId | null) => void;
    startNewFolder: (parentId: NodeId | null) => void;
    startRename: (id: NodeId) => void;

    setEntry: (id: NodeId) => void;
    requestDelete: (id: NodeId) => void;
    moveNode: (id: NodeId, parentId: NodeId | null) => void;

    commitInlineEdit: () => void;
    cancelInlineEdit: () => void;
    policy: IdeWorkspacePolicy;

}) {
    const {
        nodes,
        expanded,
        activeFileId,
        entryFileId,
        isSql = false,
        filter,
        inlineEdit,
        setInlineEdit,
        openFile,
        toggleFolder,
        startNewFile,
        startNewFolder,
        startRename,
        setEntry,
        requestDelete,
        moveNode,
        commitInlineEdit,
        cancelInlineEdit,
        policy
    } = props;

    const filterLower = filter.trim().toLowerCase();

    const nodeMatchesFilter = useMemo(
        () => nodeMatchesFilterFactory(nodes, filterLower),
        [nodes, filterLower],
    );

    const folderHasMatch = useMemo(
        () => folderHasMatchFactory(nodes, nodeMatchesFilter),
        [nodes, nodeMatchesFilter],
    );

    const [contextMenu, setContextMenu] = useState<{
        open: boolean;
        x: number;
        y: number;
        actions: MenuAction[];
    }>({
        open: false,
        x: 0,
        y: 0,
        actions: [],
    });

    const [draggingId, setDraggingId] = useState<NodeId | null>(null);
    const [dropParentId, setDropParentId] = useState<NodeId | null>(null);

    const hoverExpandTimerRef = useRef<number | null>(null);
    const hoverExpandTargetRef = useRef<NodeId | null>(null);

    const [isTouchLike, setIsTouchLike] = useState(false);
    const [pendingMoveId, setPendingMoveId] = useState<NodeId | null>(null);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const coarseMq = window.matchMedia("(pointer: coarse)");
        const narrowMq = window.matchMedia("(max-width: 767px)");

        const update = () => {
            setIsTouchLike(coarseMq.matches || narrowMq.matches);
        };

        update();

        const add = (mq: MediaQueryList, fn: () => void) => {
            if (typeof mq.addEventListener === "function") mq.addEventListener("change", fn);
            else mq.addListener(fn);
        };

        const remove = (mq: MediaQueryList, fn: () => void) => {
            if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", fn);
            else mq.removeListener(fn);
        };

        add(coarseMq, update);
        add(narrowMq, update);

        return () => {
            remove(coarseMq, update);
            remove(narrowMq, update);
        };
    }, []);

    const clearAutoExpand = useCallback((folderId?: NodeId) => {
        if (
            folderId != null &&
            hoverExpandTargetRef.current != null &&
            hoverExpandTargetRef.current !== folderId
        ) {
            return;
        }

        if (hoverExpandTimerRef.current != null) {
            window.clearTimeout(hoverExpandTimerRef.current);
            hoverExpandTimerRef.current = null;
        }

        hoverExpandTargetRef.current = null;
    }, []);

    const scheduleAutoExpand = useCallback(
        (folderId: NodeId, isOpen: boolean) => {
            if (isOpen) {
                clearAutoExpand(folderId);
                return;
            }

            if (hoverExpandTargetRef.current === folderId && hoverExpandTimerRef.current != null) {
                return;
            }

            clearAutoExpand();

            hoverExpandTargetRef.current = folderId;
            hoverExpandTimerRef.current = window.setTimeout(() => {
                toggleFolder(folderId);
                hoverExpandTimerRef.current = null;
                hoverExpandTargetRef.current = null;
            }, 500);
        },
        [toggleFolder, clearAutoExpand],
    );

    useEffect(() => {
        return () => clearAutoExpand();
    }, [clearAutoExpand]);

    const finishMove = useCallback(
        (targetParentId: NodeId | null) => {
            if (pendingMoveId == null) return;

            if (
                !canMoveInto({
                    nodes,
                    sourceId: pendingMoveId,
                    targetParentId,
                })
            ) {
                return;
            }

            moveNode(pendingMoveId, targetParentId);
            setPendingMoveId(null);
        },
        [pendingMoveId, nodes, moveNode],
    );

    const openContextMenu = useCallback(
        (e: React.MouseEvent, actions: MenuAction[]) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({
                open: true,
                x: e.clientX,
                y: e.clientY,
                actions,
            });
        },
        [],
    );
    const rootActions: MenuAction[] = useMemo(
        () => [
            ...(policy.canCreateFiles
                ? [
                    {
                        label: "New file",
                        onClick: () => startNewFile(null),
                        icon: <IconPlus className="h-4 w-4" />,
                    },
                ]
                : []),
            ...(policy.canCreateFolders
                ? [
                    {
                        label: "New folder",
                        onClick: () => startNewFolder(null),
                        icon: <IconFolder className="h-4 w-4" />,
                    },
                ]
                : []),
        ],
        [policy, startNewFile, startNewFolder],
    );
    const canDropToRoot =
        policy.canMoveNodes &&
        draggingId != null &&
        canMoveInto({
            nodes,
            sourceId: draggingId,
            targetParentId: null,
        });

    const movingNode = pendingMoveId
        ? nodes.find((n) => n.id === pendingMoveId) ?? null
        : null;

    return (
        <>
            {pendingMoveId != null ? (
                <div className="mb-2 rounded-md border border-sky-300/30 bg-sky-50/80 p-3 dark:border-sky-300/20 dark:bg-sky-400/10">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-sky-950 dark:text-white/90">
                                Move {movingNode?.name ?? "item"}
                            </div>
                            <div className="mt-1 text-[11px] font-medium text-sky-800/80 dark:text-white/60">
                                Tap a folder to move into it, or move it back to root.
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => finishMove(null)}
                                className="inline-flex h-8 items-center justify-center rounded-md border border-sky-300/30 bg-white px-2.5 text-[11px] font-medium text-sky-900 transition-colors hover:bg-sky-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85 dark:hover:bg-white/[0.08]"
                            >
                                Move to root
                            </button>

                            <button
                                type="button"
                                onClick={() => setPendingMoveId(null)}
                                className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/65 dark:hover:bg-white/[0.06] dark:hover:text-white/90"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <div
                onContextMenu={(e) => {
                    const target = e.target as HTMLElement | null;
                    if (target?.closest("[data-tree-node-row='true']")) return;
                    if (!rootActions.length) return;
                    openContextMenu(e, rootActions);
                }}
                onDragOver={(e) => {
                    if (!canDropToRoot) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropParentId(null);
                }}
                onDrop={(e) => {
                    if (!canDropToRoot || draggingId == null) return;
                    e.preventDefault();
                    moveNode(draggingId, null);
                    setDraggingId(null);
                    setDropParentId(null);
                    clearAutoExpand();
                }}
                className={cn(
                    "min-h-full rounded-xl transition",
                    canDropToRoot &&
                    dropParentId === null &&
                    "bg-emerald-50/70 ring-1 ring-emerald-300 dark:bg-emerald-400/10 dark:ring-emerald-300/40",
                )}
            >
                <Tree
                    parentId={null}
                    depth={0}
                    nodes={nodes}
                    policy={policy}
                    expanded={expanded}
                    activeFileId={activeFileId}
                    entryFileId={entryFileId}
                    isSql={isSql}
                    filterLower={filterLower}
                    nodeMatchesFilter={nodeMatchesFilter}
                    folderHasMatch={folderHasMatch}
                    inlineEdit={inlineEdit}
                    setInlineEdit={setInlineEdit}
                    openFile={openFile}
                    toggleFolder={toggleFolder}
                    startNewFile={startNewFile}
                    startNewFolder={startNewFolder}
                    startRename={startRename}
                    setEntry={setEntry}
                    requestDelete={requestDelete}
                    moveNode={moveNode}
                    commitInlineEdit={commitInlineEdit}
                    cancelInlineEdit={cancelInlineEdit}
                    openContextMenu={openContextMenu}
                    dragState={{
                        draggingId,
                        dropParentId,
                        setDraggingId,
                        setDropParentId,
                        scheduleAutoExpand,
                        clearAutoExpand,
                    }}
                    touchState={{
                        isTouchLike,
                        pendingMoveId,
                        setPendingMoveId,
                        finishMove,
                    }}
                />
            </div>

            <NodeMenu
                trigger="none"
                open={contextMenu.open}
                onOpenChange={(next) => {
                    if (!next) {
                        setContextMenu((s) => ({ ...s, open: false }));
                    }
                }}
                anchorPoint={
                    contextMenu.open
                        ? { x: contextMenu.x, y: contextMenu.y }
                        : null
                }
                actions={contextMenu.actions}
            />
        </>
    );
}
