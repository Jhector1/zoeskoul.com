"use client";

import type React from "react";
import type { CodeLanguage } from "@/lib/practice/types";

import type {
  FileNode,
  FolderNode,
  FSNode,
  InlineEdit,
  NodeId,
  Toast,
} from "../types";
import { uid } from "../utils";
import { defaultExt } from "../languageDefaults";
import { ensureUniqueSiblingName, findFile, subtreeIds } from "../fsTree";
import { fileIdsOf, pickFirstRemainingFileId } from "./workspace.normalization";
import type { IdeWorkspaceAccess } from "./workspace.types";
import type { IdeWorkspacePolicy } from "./workspace.policy";
import {
  validateImportedFiles,
  validateWorkspaceNodes,
  type ImportedWorkspaceFile,
} from "./workspace.policy";

type Setters = {
  setNodes: React.Dispatch<React.SetStateAction<FSNode[]>>;
  setOpenTabs: React.Dispatch<React.SetStateAction<NodeId[]>>;
  setActiveFileId: React.Dispatch<React.SetStateAction<NodeId>>;
  setEntryFileId: React.Dispatch<React.SetStateAction<NodeId>>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<NodeId>>>;
  setInlineEdit: React.Dispatch<React.SetStateAction<InlineEdit>>;
  setPendingDeleteId: React.Dispatch<React.SetStateAction<NodeId | null>>;
  setToast: React.Dispatch<React.SetStateAction<Toast>>;
};

function denyWithToast(setToast: Setters["setToast"], text: string) {
  setToast({ kind: "error", text });
}

function normalizeImportPath(input: string) {
  return String(input ?? "")
      .replace(/\\/g, "/")
      .split("/")
      .map((x) => x.trim())
      .filter((x) => !!x && x !== "." && x !== "..");
}

function findFolderChild(
    nodes: FSNode[],
    parentId: NodeId | null,
    name: string,
): FolderNode | undefined {
  const want = name.toLocaleLowerCase();

  return nodes.find(
      (n): n is FolderNode =>
          n.kind === "folder" &&
          n.parentId === parentId &&
          n.name.toLocaleLowerCase() === want,
  );
}

export function openFile(args: {
  nodes: FSNode[];
  id: NodeId;
  setActiveFileId: Setters["setActiveFileId"];
  setOpenTabs: Setters["setOpenTabs"];
}) {
  const { nodes, id, setActiveFileId, setOpenTabs } = args;
  const f = findFile(nodes, id);
  if (!f) return;

  setActiveFileId(id);
  setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
}

export function closeTab(args: {
  id: NodeId;
  activeFileId: NodeId;
  setActiveFileId: Setters["setActiveFileId"];
  setOpenTabs: Setters["setOpenTabs"];
}) {
  const { id, activeFileId, setActiveFileId, setOpenTabs } = args;
  setOpenTabs((prev) => {
    const nextTabs = prev.filter((x) => x !== id);

    if (id === activeFileId) {
      const pick = nextTabs[nextTabs.length - 1] ?? "";
      setActiveFileId(pick);
    }

    return nextTabs;
  });
}

export function onChangeCode(args: {
  activeFile: FileNode | undefined;
  code: string;
  setNodes: Setters["setNodes"];
}) {
  const { activeFile, code, setNodes } = args;
  if (!activeFile) return;

  setNodes((prev) =>
      prev.map((n) =>
          n.id === activeFile.id && n.kind === "file"
              ? { ...n, content: code, updatedAt: Date.now() }
              : n,
      ),
  );
}

export function toggleFolder(args: {
  id: NodeId;
  setInlineEdit: Setters["setInlineEdit"];
  setExpanded: Setters["setExpanded"];
}) {
  const { id, setInlineEdit, setExpanded } = args;
  setInlineEdit(null);
  setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
}

export function startNewFile(args: {
  access: IdeWorkspaceAccess;
  policy: IdeWorkspacePolicy;
  language: CodeLanguage;
  nodes: FSNode[];
  parentId: NodeId | null;
  setExpanded: Setters["setExpanded"];
  setInlineEdit: Setters["setInlineEdit"];
  setToast: Setters["setToast"];
}) {
  const {
    access,
    policy,
    language,
    nodes,
    parentId,
    setExpanded,
    setInlineEdit,
    setToast,
  } = args;

  if (!policy.canCreateFiles) {
    denyWithToast(
        setToast,
        access.hasUser
            ? "Creating files is not available for this account."
            : "Log in to create files.",
    );
    return;
  }

  const desired = ensureUniqueSiblingName(
      nodes,
      access.canUseMultiFile ? parentId : null,
      `untitled${defaultExt(language)}`,
  );

  if (access.canUseMultiFile && parentId) {
    setExpanded((s) => new Set(s).add(parentId));
  }

  setInlineEdit({
    mode: "new-file",
    parentId: access.canUseMultiFile ? parentId : null,
    value: desired,
  });
}

export function startNewFolder(args: {
  policy: IdeWorkspacePolicy;
  nodes: FSNode[];
  parentId: NodeId | null;
  setExpanded: Setters["setExpanded"];
  setInlineEdit: Setters["setInlineEdit"];
  setToast: Setters["setToast"];
}) {
  const { policy, nodes, parentId, setExpanded, setInlineEdit, setToast } = args;

  if (!policy.canCreateFolders) {
    denyWithToast(setToast, "Folders are not available in this workspace.");
    return;
  }

  const desired = ensureUniqueSiblingName(nodes, parentId, "folder");

  if (parentId) {
    setExpanded((s) => new Set(s).add(parentId));
  }

  setInlineEdit({ mode: "new-folder", parentId, value: desired });
}

export function startRename(args: {
  access: IdeWorkspaceAccess;
  policy: IdeWorkspacePolicy;
  nodes: FSNode[];
  nodeId: NodeId;
  setInlineEdit: Setters["setInlineEdit"];
  setToast: Setters["setToast"];
}) {
  const { access, policy, nodes, nodeId, setInlineEdit, setToast } = args;

  if (!policy.canRenameNodes) {
    denyWithToast(
        setToast,
        access.hasUser
            ? "Renaming is not available for this account."
            : "Log in to rename files.",
    );
    return;
  }

  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return;

  setInlineEdit({
    mode: "rename",
    parentId: n.parentId,
    targetId: n.id,
    value: n.name,
  });
}

export function requestDelete(args: {
  policy: IdeWorkspacePolicy;
  nodes: FSNode[];
  id: NodeId;
  language: CodeLanguage;
  entryFileId: NodeId;
  setPendingDeleteId: Setters["setPendingDeleteId"];
  setToast: Setters["setToast"];
}) {
  const { policy, nodes, id, language, entryFileId, setPendingDeleteId, setToast } = args;

  if (!policy.canDeleteNodes) {
    denyWithToast(setToast, "Delete is not available in this workspace.");
    return;
  }

  const n = nodes.find((x) => x.id === id);
  if (!n) return;

  if (language !== "sql") {
    if (n.kind === "file" && n.id === entryFileId) {
      setToast({
        kind: "error",
        text: "Entry file can’t be deleted. Set another Entry first.",
      });
      return;
    }

    if (n.kind === "folder") {
      const ids = subtreeIds(nodes, n.id);
      if (ids.has(entryFileId)) {
        setToast({
          kind: "error",
          text: "This folder contains the Entry file. Change Entry first.",
        });
        return;
      }
    }
  }

  setPendingDeleteId(id);
}

export function performDelete(args: {
  nodes: FSNode[];
  id: NodeId;
  language: CodeLanguage;
  entryFileId: NodeId;
  setNodes: Setters["setNodes"];
  setOpenTabs: Setters["setOpenTabs"];
  setActiveFileId: Setters["setActiveFileId"];
  setExpanded: Setters["setExpanded"];
  setPendingDeleteId: Setters["setPendingDeleteId"];
  setToast: Setters["setToast"];
}) {
  const {
    nodes,
    id,
    language,
    entryFileId,
    setNodes,
    setOpenTabs,
    setActiveFileId,
    setExpanded,
    setPendingDeleteId,
    setToast,
  } = args;

  setNodes((prevNodes) => {
    const target = prevNodes.find((x) => x.id === id);
    if (!target) return prevNodes;

    const toDelete =
        target.kind === "folder"
            ? subtreeIds(prevNodes, target.id)
            : new Set<NodeId>([target.id]);

    if (language !== "sql" && toDelete.has(entryFileId)) {
      setToast({ kind: "error", text: "Delete blocked: contains Entry file." });
      setPendingDeleteId(null);
      return prevNodes;
    }

    const nextNodes = prevNodes.filter((x) => !toDelete.has(x.id));
    const nextFileIds = fileIdsOf(nextNodes);

    setOpenTabs((prevTabs) => {
      const nextTabs = prevTabs.filter((t) => !toDelete.has(t));

      setActiveFileId((prevActive) => {
        if (!toDelete.has(prevActive)) return prevActive;

        const preferredOpen = nextTabs[nextTabs.length - 1];
        if (preferredOpen && nextFileIds.has(preferredOpen)) {
          return preferredOpen;
        }

        return pickFirstRemainingFileId(nextNodes);
      });

      return nextTabs;
    });

    setExpanded((prevExpanded) => {
      const next = new Set(prevExpanded);
      for (const did of toDelete) next.delete(did);
      return next;
    });

    setPendingDeleteId(null);
    return nextNodes;
  });
}

export function commitInlineEdit(args: {
  access: IdeWorkspaceAccess;
  policy: IdeWorkspacePolicy;
  inlineEdit: InlineEdit;
  language: CodeLanguage;
  nodes: FSNode[];
  activeFileId: NodeId;
  setNodes: Setters["setNodes"];
  setExpanded: Setters["setExpanded"];
  setInlineEdit: Setters["setInlineEdit"];
  setActiveFileId: Setters["setActiveFileId"];
  setOpenTabs: Setters["setOpenTabs"];
  setToast: Setters["setToast"];
}) {
  const {
    access,
    policy,
    inlineEdit,
    nodes,
    activeFileId,
    setNodes,
    setExpanded,
    setInlineEdit,
    setActiveFileId,
    setOpenTabs,
    setToast,
  } = args;

  if (!inlineEdit) return;

  const raw = inlineEdit.value.trim();
  if (!raw) {
    setToast({ kind: "error", text: "Name can’t be empty." });
    return;
  }

  if (inlineEdit.mode === "rename") {
    if (!policy.canRenameNodes) {
      denyWithToast(setToast, "Renaming is not available in this workspace.");
      setInlineEdit(null);
      return;
    }

    const id = inlineEdit.targetId!;

    setNodes((prev) => {
      const cur = prev.find((x) => x.id === id);
      if (!cur) return prev;

      const safe = ensureUniqueSiblingName(
          prev.filter((x) => x.id !== id),
          cur.parentId,
          raw,
      );

      return prev.map((x) =>
          x.id === id ? { ...x, name: safe, updatedAt: Date.now() } : x,
      );
    });

    setInlineEdit(null);
    return;
  }

  if (inlineEdit.mode === "new-folder") {
    if (!policy.canCreateFolders) {
      denyWithToast(setToast, "Folders are not available in this workspace.");
      setInlineEdit(null);
      return;
    }

    const folderId = uid();
    const safe = ensureUniqueSiblingName(nodes, inlineEdit.parentId, raw);

    const nextNodes: FSNode[] = [
      ...nodes,
      {
        id: folderId,
        kind: "folder",
        name: safe,
        parentId: inlineEdit.parentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as FolderNode,
    ];

    const quotaError = validateWorkspaceNodes(nextNodes, policy);
    if (quotaError) {
      setToast({ kind: "error", text: quotaError });
      return;
    }

    setNodes(nextNodes);
    if (inlineEdit.parentId) {
      setExpanded((s) => new Set(s).add(inlineEdit.parentId!));
    }
    setInlineEdit(null);
    return;
  }

  if (!policy.canCreateFiles) {
    denyWithToast(
        setToast,
        access.hasUser
            ? "Creating files is not available for this account."
            : "Log in to create files.",
    );
    setInlineEdit(null);
    return;
  }

  const safeName = ensureUniqueSiblingName(
      nodes,
      access.canUseMultiFile ? inlineEdit.parentId : null,
      raw,
  );

  if (!access.canUseMultiFile) {
    const target =
        findFile(nodes, activeFileId) ??
        nodes.find((n): n is FileNode => n.kind === "file");

    const replacementId = target?.id ?? uid();

    const nextNodes: FSNode[] = [
      {
        id: replacementId,
        kind: "file",
        name: safeName,
        parentId: null,
        content: target?.content ?? "",
        createdAt: target?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      } as FileNode,
    ];

    const quotaError = validateWorkspaceNodes(nextNodes, policy);
    if (quotaError) {
      setToast({ kind: "error", text: quotaError });
      return;
    }

    setNodes(nextNodes);
    setOpenTabs([replacementId]);
    setActiveFileId(replacementId);
    setExpanded(new Set());
    setInlineEdit(null);
    return;
  }

  const fileId = uid();
  const nextNodes: FSNode[] = [
    ...nodes,
    {
      id: fileId,
      kind: "file",
      name: safeName,
      parentId: inlineEdit.parentId,
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as FileNode,
  ];

  const quotaError = validateWorkspaceNodes(nextNodes, policy);
  if (quotaError) {
    setToast({ kind: "error", text: quotaError });
    return;
  }

  setNodes(nextNodes);
  setOpenTabs((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]));
  setActiveFileId(fileId);

  if (inlineEdit.parentId) {
    setExpanded((prev) => new Set(prev).add(inlineEdit.parentId!));
  }

  setInlineEdit(null);
}

export function moveNode(args: {
  policy: IdeWorkspacePolicy;
  nodes: FSNode[];
  id: NodeId;
  parentId: NodeId | null;
  setNodes: Setters["setNodes"];
  setExpanded: Setters["setExpanded"];
  setToast: Setters["setToast"];
}) {
  const { policy, nodes, id, parentId, setNodes, setExpanded, setToast } = args;

  if (!policy.canMoveNodes) {
    denyWithToast(setToast, "Moving files is not available in this workspace.");
    return;
  }

  const moving = nodes.find((n) => n.id === id);
  if (!moving) return;
  if (moving.id === parentId) return;

  if (moving.kind === "folder" && parentId != null) {
    const descendants = subtreeIds(nodes, moving.id);
    if (descendants.has(parentId)) {
      setToast({ kind: "error", text: "Folder cannot be moved into itself." });
      return;
    }
  }

  setNodes((prev) => {
    const target = prev.find((n) => n.id === id);
    if (!target) return prev;

    const safeName = ensureUniqueSiblingName(
        prev.filter((n) => n.id !== id),
        parentId,
        target.name,
    );

    return prev.map((n) =>
        n.id === id
            ? {
              ...n,
              parentId,
              name: safeName,
              updatedAt: Date.now(),
            }
            : n,
    );
  });

  if (parentId) {
    setExpanded((prev) => new Set(prev).add(parentId));
  }
}

export function importExternalFiles(args: {
  access: IdeWorkspaceAccess;
  policy: IdeWorkspacePolicy;
  nodes: FSNode[];
  activeFileId: NodeId;
  files: ImportedWorkspaceFile[];
  setNodes: Setters["setNodes"];
  setOpenTabs: Setters["setOpenTabs"];
  setActiveFileId: Setters["setActiveFileId"];
  setExpanded: Setters["setExpanded"];
  setToast: Setters["setToast"];
}) {
  const {
    access,
    policy,
    nodes,
    activeFileId,
    files,
    setNodes,
    setOpenTabs,
    setActiveFileId,
    setExpanded,
    setToast,
  } = args;

  const cleaned = files
      .map((f) => ({
        path: normalizeImportPath(f.path).join("/"),
        content: String(f.content ?? ""),
      }))
      .filter((f) => !!f.path);

  const importError = validateImportedFiles(cleaned, policy);
  if (importError) {
    setToast({ kind: "error", text: importError });
    return;
  }

  if (!access.canUseMultiFile) {
    const imported = cleaned[0];
    const parts = normalizeImportPath(imported.path);
    const fileName = parts[parts.length - 1] ?? "file";

    const target =
        findFile(nodes, activeFileId) ??
        nodes.find((n): n is FileNode => n.kind === "file");

    const chosenId = target?.id ?? uid();

    const nextNodes: FSNode[] = [
      {
        id: chosenId,
        kind: "file",
        name: fileName,
        parentId: null,
        content: imported.content,
        createdAt: target?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      } as FileNode,
    ];

    const quotaError = validateWorkspaceNodes(nextNodes, policy);
    if (quotaError) {
      setToast({ kind: "error", text: quotaError });
      return;
    }

    setNodes(nextNodes);
    setExpanded(new Set());
    setActiveFileId(chosenId);
    setOpenTabs([chosenId]);
    setToast({ kind: "success", text: `Opened ${fileName}.` });
    return;
  }

  const importedFileIds: NodeId[] = [];
  const expandedIds = new Set<NodeId>();
  const sorted = [...cleaned].sort(
      (a, b) => normalizeImportPath(a.path).length - normalizeImportPath(b.path).length,
  );

  let next = [...nodes];

  for (const imported of sorted) {
    const parts = normalizeImportPath(imported.path);
    if (!parts.length) continue;

    const fileNameRaw = parts[parts.length - 1];
    const folderParts = parts.slice(0, -1);

    let parentId: NodeId | null = null;

    for (const part of folderParts) {
      const found = findFolderChild(next, parentId, part);
      if (found) {
        parentId = found.id;
        expandedIds.add(found.id);
        continue;
      }

      const folderId = uid();
      next.push({
        id: folderId,
        kind: "folder",
        name: part,
        parentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as FolderNode);

      expandedIds.add(folderId);
      parentId = folderId;
    }

    const fileName = ensureUniqueSiblingName(next, parentId, fileNameRaw);
    const fileId = uid();

    next.push({
      id: fileId,
      kind: "file",
      name: fileName,
      parentId,
      content: imported.content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as FileNode);

    importedFileIds.push(fileId);
  }

  const quotaError = validateWorkspaceNodes(next, policy);
  if (quotaError) {
    setToast({ kind: "error", text: quotaError });
    return;
  }

  setNodes(next);
  setExpanded((prev) => {
    const merged = new Set(prev);
    for (const id of expandedIds) merged.add(id);
    return merged;
  });

  if (importedFileIds.length) {
    setOpenTabs((prev) => [...prev, ...importedFileIds.filter((id) => !prev.includes(id))]);
    setActiveFileId(importedFileIds[0]);
    setToast({
      kind: "success",
      text:
          importedFileIds.length === 1
              ? "Imported 1 file."
              : `Imported ${importedFileIds.length} files.`,
    });
  }
}