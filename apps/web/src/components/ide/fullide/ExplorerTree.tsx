"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { FSNode, InlineEdit, NodeId } from "../types";
import { cn } from "../utils";
import {
    childrenOf,
    folderHasMatchFactory,
    nodeMatchesFilterFactory,
    pathOf,
    subtreeIds,
} from "./ExplorerTreeHelpers";
import NodeMenu from "./NodeMenu";
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
        <div className="rounded-lg border border-neutral-200 bg-white px-2 py-2 dark:border-white/10 dark:bg-white/[0.06]">
            <div className="flex min-h-[44px] items-center">
                <IndentGuides depth={depth} />
                <div className="grid h-6 w-6 place-items-center opacity-60" />
                <div className="grid h-6 w-6 place-items-center text-neutral-700 dark:text-white/80">
                    {kind === "folder" ? (
                        <IconFolder className="h-4 w-4" />
                    ) : (
                        <IconFile className="h-4 w-4" />
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
                    className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white/90"
                />
            </div>

            <div className="mt-2 flex flex-col gap-2 sm:ml-[28px] sm:flex-row sm:items-center">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        commitInlineEdit();
                    }}
                    className="ui-quiz-action ui-quiz-action--primary"
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
                    className="ui-quiz-action ui-quiz-action--ghost"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

function Tree(props: {
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

    commitInlineEdit: () => void;
    cancelInlineEdit: () => void;
}) {
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
        commitInlineEdit,
        cancelInlineEdit,
    } = props;

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
                    kind={inlineEdit!.mode === "new-folder" ? "folder" : "file"}
                    initialFocus
                    value={inlineEdit?.value ?? ""}
                    setInlineEdit={setInlineEdit}
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

                if (isRenaming) {
                    return (
                        <div key={n.id}>
                            <div className="rounded-lg border border-neutral-200 bg-white px-2 py-2 dark:border-white/10 dark:bg-white/[0.06]">
                                <IndentGuides depth={depth} />

                                <div className="grid h-6 w-6 place-items-center text-neutral-500 dark:text-white/60">
                                    {isFolder
                                        ? isOpen
                                            ? <IconChevronDown className="h-4 w-4" />
                                            : <IconChevronRight className="h-4 w-4" />
                                        : null}
                                </div>

                                <div className="grid h-6 w-6 place-items-center text-neutral-700 dark:text-white/80">
                                    {isFolder ? <IconFolder className="h-4 w-4" /> : <IconFile className="h-4 w-4" />}
                                </div>

                                <input
                                    autoFocus
                                    value={inlineEdit?.value ?? ""}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                        setInlineValuePreserveCaret(setInlineEdit, e.currentTarget, e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") commitInlineEdit();
                                        if (e.key === "Escape") cancelInlineEdit();
                                    }}
                                    className="h-7 w-full rounded-md border border-neutral-200 bg-white px-2 text-[12px] font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white/90"
                                />

                                <div className="mt-2 flex flex-col gap-2 sm:ml-2 sm:mt-0 sm:flex-row sm:items-center">                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            commitInlineEdit();
                                        }}
                                        className="ui-quiz-action ui-quiz-action--primary"
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
                                        className="ui-quiz-action ui-quiz-action--ghost"
                                    >
                                        Cancel
                                    </button>
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
                                        commitInlineEdit={commitInlineEdit}
                                        cancelInlineEdit={cancelInlineEdit}
                                    />
                                </div>
                            ) : null}
                        </div>
                    );
                }

                const fileActions = isSql
                    ? [
                        { label: "Rename", onClick: () => startRename(n.id), icon: <IconPencil className="h-4 w-4" /> },
                        {
                            label: "Delete",
                            onClick: () => requestDelete(n.id),
                            icon: <IconTrash className="h-4 w-4" />,
                            danger: true,
                            disabled: disableDelete,
                        },
                    ]
                    : [
                        {
                            label: isEntry ? "Entry file" : "Set as Entry",
                            onClick: () => setEntry(n.id),
                            icon: <IconPlay className="h-4 w-4" />,
                            disabled: isEntry,
                        },
                        { label: "Rename", onClick: () => startRename(n.id), icon: <IconPencil className="h-4 w-4" /> },
                        {
                            label: "Delete",
                            onClick: () => requestDelete(n.id),
                            icon: <IconTrash className="h-4 w-4" />,
                            danger: true,
                            disabled: disableDelete,
                        },
                    ];

                return (
                    <div key={n.id}>
                        <div
                            className={cn(
                                "group flex min-h-[40px] items-center rounded-md px-2 border border-transparent sm:min-h-[32px]",                                "hover:bg-neutral-50 hover:border-neutral-200",
                                "dark:hover:bg-white/[0.06] dark:hover:border-white/10",
                                isActive && "bg-neutral-50 border-neutral-200 dark:bg-white/[0.08] dark:border-white/10",
                            )}
                            title={pathOf(nodes, n.id)}
                        >
                            <IndentGuides depth={depth} />

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isFolder) toggleFolder(n.id);
                                    else openFile(n.id);
                                }}
                                className={cn(
                                    "grid h-6 w-6 place-items-center rounded-md",
                                    "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100",
                                    "dark:text-white/55 dark:hover:text-white/90 dark:hover:bg-white/[0.06]",
                                    !isFolder && "opacity-0 pointer-events-none",
                                    isFolder && !hasChildren && "opacity-40",
                                )}
                                title={isFolder ? (isOpen ? "Collapse" : "Expand") : ""}
                            >
                                {isFolder ? (
                                    isOpen ? <IconChevronDown className="h-4 w-4" /> : <IconChevronRight className="h-4 w-4" />
                                ) : null}
                            </button>

                            <div className="grid h-6 w-6 place-items-center text-neutral-700 dark:text-white/80">
                                {isFolder ? <IconFolder className="h-4 w-4" /> : <IconFile className="h-4 w-4" />}
                            </div>

                            <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isFolder) toggleFolder(n.id);
                                    else openFile(n.id);
                                }}
                            >
                                <div className="truncate text-[12px] font-semibold text-neutral-900 dark:text-white/85">
                                    {n.name}
                                </div>
                            </button>

                            {isEntry ? (
                                <div className="mr-1 ui-pill ui-pill--good" title="Runs when you click Run">
                                    <IconPlay className="h-3 w-3" />
                                    ENTRY
                                </div>
                            ) : null}

                            <div className="ml-1 flex items-center">
                                <NodeMenu
                                    actions={
                                        isFolder
                                            ? [
                                                { label: "New file", onClick: () => startNewFile(n.id), icon: <IconPlus className="h-4 w-4" /> },
                                                { label: "New folder", onClick: () => startNewFolder(n.id), icon: <IconFolder className="h-4 w-4" /> },
                                                { label: "Rename", onClick: () => startRename(n.id), icon: <IconPencil className="h-4 w-4" /> },
                                                {
                                                    label: "Delete",
                                                    onClick: () => requestDelete(n.id),
                                                    icon: <IconTrash className="h-4 w-4" />,
                                                    danger: true,
                                                    disabled: disableDelete,
                                                },
                                            ]
                                            : fileActions
                                    }
                                />
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
                                    commitInlineEdit={commitInlineEdit}
                                    cancelInlineEdit={cancelInlineEdit}
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

    commitInlineEdit: () => void;
    cancelInlineEdit: () => void;
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
        commitInlineEdit,
        cancelInlineEdit,
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

    return (
        <Tree
            parentId={null}
            depth={0}
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
            commitInlineEdit={commitInlineEdit}
            cancelInlineEdit={cancelInlineEdit}
        />
    );
}