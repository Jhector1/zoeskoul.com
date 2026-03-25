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

function makeDenyMultiFile(access: IdeWorkspaceAccess, setToast: Setters["setToast"]) {
  return (message?: string) => {
    setToast({
      kind: "error",
      text:
        message ??
        (access.hasUser
          ? "Multiple files are not available for this user."
          : "Log in to unlock multiple files."),
    });
  };
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
  language: CodeLanguage;
  nodes: FSNode[];
  parentId: NodeId | null;
  setExpanded: Setters["setExpanded"];
  setInlineEdit: Setters["setInlineEdit"];
  setToast: Setters["setToast"];
}) {
  const { access, language, nodes, parentId, setExpanded, setInlineEdit, setToast } = args;
  if (!access.canUseMultiFile) {
    makeDenyMultiFile(access, setToast)();
    return;
  }

  const desired = ensureUniqueSiblingName(nodes, parentId, `untitled${defaultExt(language)}`);

  if (parentId) {
    setExpanded((s) => new Set(s).add(parentId));
  }

  setInlineEdit({ mode: "new-file", parentId, value: desired });
}

export function startNewFolder(args: {
  access: IdeWorkspaceAccess;
  nodes: FSNode[];
  parentId: NodeId | null;
  setExpanded: Setters["setExpanded"];
  setInlineEdit: Setters["setInlineEdit"];
  setToast: Setters["setToast"];
}) {
  const { access, nodes, parentId, setExpanded, setInlineEdit, setToast } = args;
  if (!access.canUseMultiFile) {
    makeDenyMultiFile(access, setToast)();
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
  nodes: FSNode[];
  nodeId: NodeId;
  setInlineEdit: Setters["setInlineEdit"];
  setToast: Setters["setToast"];
}) {
  const { access, nodes, nodeId, setInlineEdit, setToast } = args;
  if (!access.canUseMultiFile) {
    makeDenyMultiFile(access, setToast)();
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

export function commitInlineEdit(args: {
  access: IdeWorkspaceAccess;
  inlineEdit: InlineEdit;
  language: CodeLanguage;
  nodes: FSNode[];
  setNodes: Setters["setNodes"];
  setExpanded: Setters["setExpanded"];
  setInlineEdit: Setters["setInlineEdit"];
  setActiveFileId: Setters["setActiveFileId"];
  setOpenTabs: Setters["setOpenTabs"];
  setToast: Setters["setToast"];
}) {
  const {
    access,
    inlineEdit,
    nodes,
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

  if (!access.canUseMultiFile) {
    makeDenyMultiFile(access, setToast)();
    setInlineEdit(null);
    return;
  }

  if (inlineEdit.mode === "rename") {
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
    const newId = uid();

    setNodes((prev) => {
      const safe = ensureUniqueSiblingName(prev, inlineEdit.parentId, raw);

      const folder: FolderNode = {
        id: newId,
        kind: "folder",
        name: safe,
        parentId: inlineEdit.parentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      return [...prev, folder];
    });

    setExpanded((s) => new Set(s).add(newId));
    setInlineEdit(null);
    return;
  }

  if (inlineEdit.mode === "new-file") {
    const newId = uid();

    setNodes((prev) => {
      const safe = ensureUniqueSiblingName(prev, inlineEdit.parentId, raw);

      const file: FileNode = {
        id: newId,
        kind: "file",
        name: safe,
        parentId: inlineEdit.parentId,
        content: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      return [...prev, file];
    });

    setActiveFileId(newId);
    setOpenTabs((tabs) => (tabs.includes(newId) ? tabs : [...tabs, newId]));
    setInlineEdit(null);
  }
}

export function requestDelete(args: {
  access: IdeWorkspaceAccess;
  nodes: FSNode[];
  id: NodeId;
  language: CodeLanguage;
  entryFileId: NodeId;
  setPendingDeleteId: Setters["setPendingDeleteId"];
  setToast: Setters["setToast"];
}) {
  const { access, nodes, id, language, entryFileId, setPendingDeleteId, setToast } = args;
  if (!access.canUseMultiFile) {
    makeDenyMultiFile(access, setToast)();
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
