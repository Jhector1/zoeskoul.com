"use client";

import React from "react";
import type { FSNode, NodeId } from "../types";
import { subtreeIds } from "./ExplorerTreeHelpers";
import {
    IconFolder,
    IconPlay,
    IconPlus,
    IconPencil,
    IconTrash,
} from "./icons";
import type { ExplorerMenuAction } from "./ExplorerContextMenu";

type BuildNodeActionsArgs = {
    node: FSNode;
    nodes: FSNode[];
    entryFileId: NodeId;
    isSql?: boolean;
    startNewFile: (parentId: NodeId | null) => void;
    startNewFolder: (parentId: NodeId | null) => void;
    startRename: (id: NodeId) => void;
    setEntry: (id: NodeId) => void;
    requestDelete: (id: NodeId) => void;
};

export function buildExplorerRootActions(args: {
    startNewFile: (parentId: NodeId | null) => void;
    startNewFolder: (parentId: NodeId | null) => void;
}): ExplorerMenuAction[] {
    const { startNewFile, startNewFolder } = args;

    return [
        {
            label: "New file",
            onClick: () => startNewFile(null),
            icon: <IconPlus className="h-4 w-4" />,
        },
        {
            label: "New folder",
            onClick: () => startNewFolder(null),
            icon: <IconFolder className="h-4 w-4" />,
        },
    ];
}

export function buildExplorerNodeActions(args: BuildNodeActionsArgs): ExplorerMenuAction[] {
    const {
        node,
        nodes,
        entryFileId,
        isSql = false,
        startNewFile,
        startNewFolder,
        startRename,
        setEntry,
        requestDelete,
    } = args;

    const isFolder = node.kind === "folder";
    const isEntry = !isSql && node.kind === "file" && node.id === entryFileId;

    const disableDelete =
        !isSql &&
        ((node.kind === "file" && node.id === entryFileId) ||
            (node.kind === "folder" && subtreeIds(nodes, node.id).has(entryFileId)));

    if (isFolder) {
        return [
            {
                label: "New file",
                onClick: () => startNewFile(node.id),
                icon: <IconPlus className="h-4 w-4" />,
            },
            {
                label: "New folder",
                onClick: () => startNewFolder(node.id),
                icon: <IconFolder className="h-4 w-4" />,
            },
            {
                label: "Rename",
                onClick: () => startRename(node.id),
                icon: <IconPencil className="h-4 w-4" />,
            },
            {
                label: "Delete",
                onClick: () => requestDelete(node.id),
                icon: <IconTrash className="h-4 w-4" />,
                danger: true,
                disabled: disableDelete,
            },
        ];
    }

    if (isSql) {
        return [
            {
                label: "Rename",
                onClick: () => startRename(node.id),
                icon: <IconPencil className="h-4 w-4" />,
            },
            {
                label: "Delete",
                onClick: () => requestDelete(node.id),
                icon: <IconTrash className="h-4 w-4" />,
                danger: true,
                disabled: disableDelete,
            },
        ];
    }

    return [
        {
            label: isEntry ? "Entry file" : "Set as Entry",
            onClick: () => setEntry(node.id),
            icon: <IconPlay className="h-4 w-4" />,
            disabled: isEntry,
        },
        {
            label: "Rename",
            onClick: () => startRename(node.id),
            icon: <IconPencil className="h-4 w-4" />,
        },
        {
            label: "Delete",
            onClick: () => requestDelete(node.id),
            icon: <IconTrash className="h-4 w-4" />,
            danger: true,
            disabled: disableDelete,
        },
    ];
}