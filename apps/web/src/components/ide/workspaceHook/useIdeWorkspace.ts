"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FileNode, FolderNode, FSNode, InlineEdit, NodeId, Toast, WorkspaceStateV2 } from "../types";
import type { CodeLanguage } from "@/lib/practice/types";
import type { UseIdeWorkspaceOpts, UseIdeWorkspaceResult } from "./workspace.types";

import { findFile } from "../fsTree";
import { ALL_LANGUAGES, DEFAULT_ACCESS, SAVE_DEBOUNCE_MS } from "./workspace.constants";
import {
  STORAGE_KEY_V2,
  isCodeLanguage,
  loadWorkspaceForLanguage as loadWorkspaceForLanguageRaw,
  readWorkspaceMeta,
  saveWorkspaceForLanguage as saveWorkspaceForLanguageRaw,
  tryMigrateInitialWorkspace,
} from "./workspace.persistence";
import {
  buildSingleFileWorkspace,
  createDefaultStateForLanguage,
  normalizeWorkspaceForAccess,
} from "./workspace.normalization";
import {
  closeTab as closeTabAction,
  commitInlineEdit as commitInlineEditAction,
  onChangeCode as onChangeCodeAction,
  openFile as openFileAction,
  performDelete as performDeleteAction,
  requestDelete as requestDeleteAction,
  startNewFile as startNewFileAction,
  startNewFolder as startNewFolderAction,
  startRename as startRenameAction,
  toggleFolder as toggleFolderAction,
} from "./workspace.fileActions";
import { beginDividerDrag, handleDividerKeyDown } from "./workspace.splitter";

export { type IdeWorkspaceAccess, type UseIdeWorkspaceOpts, type UseIdeWorkspaceResult } from "./workspace.types";

export function useIdeWorkspace(opts?: UseIdeWorkspaceOpts): UseIdeWorkspaceResult {
  const baseStorageKey = opts?.storageKey ?? STORAGE_KEY_V2;
  const forcedLanguage = opts?.forcedLanguage;
  const resetOnForcedLanguageChange = !!opts?.resetOnForcedLanguageChange;
  const access = opts?.access ?? DEFAULT_ACCESS;
  const draftStorageMode = opts?.draftStorageMode ?? "local";
  const initialWorkspace = opts?.initialWorkspace ?? null;

  const [language, setLanguageState] = useState<CodeLanguage>("python");
  const [nodes, setNodes] = useState<FSNode[]>([]);
  const [openTabs, setOpenTabs] = useState<NodeId[]>([]);
  const [activeFileId, setActiveFileId] = useState<NodeId>("");
  const [entryFileId, setEntryFileId] = useState<NodeId>("");
  const [stdin, setStdin] = useState("");

  const [expanded, setExpanded] = useState<Set<NodeId>>(new Set());
  const [leftPct, setLeftPct] = useState(26);
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);

  const [filter, setFilter] = useState("");
  const [inlineEdit, setInlineEdit] = useState<InlineEdit>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<NodeId | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const hydratedRef = useRef(false);
  const prevForcedRef = useRef<CodeLanguage | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const clearTransientUi = useCallback(() => {
    setFilter("");
    setInlineEdit(null);
    setPendingDeleteId(null);
  }, []);

  const hydrateWorkspace = useCallback(
    (ws: WorkspaceStateV2) => {
      const normalized = normalizeWorkspaceForAccess(ws, access);

      setLanguageState(normalized.language);
      setNodes(normalized.nodes);
      setOpenTabs(normalized.openTabs?.length ? normalized.openTabs : [normalized.activeFileId]);
      setActiveFileId(normalized.activeFileId);
      setEntryFileId(normalized.entryFileId);
      setStdin(normalized.stdin ?? "");
      setExpanded(new Set(normalized.expanded ?? []));
      setLeftPct(normalized.leftPct ?? 26);
    },
    [access],
  );

  const replaceWorkspace = useCallback(
    (ws: WorkspaceStateV2) => {
      hydrateWorkspace(ws);
      clearTransientUi();
      setToast(null);
    },
    [hydrateWorkspace, clearTransientUi],
  );

  const resetWorkspaceForLanguage = useCallback(
    (next: CodeLanguage) => {
      const base = createDefaultStateForLanguage(next);
      hydrateWorkspace(access.canUseMultiFile ? base : buildSingleFileWorkspace(next, base));
      clearTransientUi();
    },
    [hydrateWorkspace, clearTransientUi, access.canUseMultiFile],
  );

  const currentWorkspace = useMemo<WorkspaceStateV2 | null>(() => {
    if (!nodes.length || !activeFileId || !entryFileId) return null;

    return {
      version: 2,
      language,
      nodes,
      openTabs: openTabs.length ? openTabs : [activeFileId],
      activeFileId,
      entryFileId,
      stdin,
      expanded: Array.from(expanded),
      leftPct,
    };
  }, [language, nodes, openTabs, activeFileId, entryFileId, stdin, expanded, leftPct]);

  const currentWorkspaceRef = useRef<WorkspaceStateV2 | null>(null);
  useEffect(() => {
    currentWorkspaceRef.current = currentWorkspace;
  }, [currentWorkspace]);

  const loadWorkspaceForLanguage = useCallback(
    (next: CodeLanguage) =>
      loadWorkspaceForLanguageRaw({
        baseStorageKey,
        next,
        draftStorageMode,
      }),
    [baseStorageKey, draftStorageMode],
  );

  const saveWorkspaceForLanguage = useCallback(
    (ws: WorkspaceStateV2 | null) =>
      saveWorkspaceForLanguageRaw({
        baseStorageKey,
        ws,
        draftStorageMode,
      }),
    [baseStorageKey, draftStorageMode],
  );

  const switchLanguage = useCallback(
    (next: CodeLanguage) => {
      if (!isCodeLanguage(next)) return;
      if (next === language) return;

      saveWorkspaceForLanguage(currentWorkspaceRef.current);

      const loaded = loadWorkspaceForLanguage(next);
      if (loaded) {
        hydrateWorkspace(loaded);
      } else {
        const base = createDefaultStateForLanguage(next);
        hydrateWorkspace(access.canUseMultiFile ? base : buildSingleFileWorkspace(next, base));
      }

      clearTransientUi();
      setToast(null);
    },
    [
      language,
      saveWorkspaceForLanguage,
      loadWorkspaceForLanguage,
      hydrateWorkspace,
      clearTransientUi,
      access.canUseMultiFile,
    ],
  );

  useEffect(() => {
    if (initialWorkspace) {
      hydrateWorkspace(initialWorkspace);
      hydratedRef.current = true;
      prevForcedRef.current = forcedLanguage ?? null;
      return;
    }

    const wanted =
      forcedLanguage ??
      (draftStorageMode === "local" ? readWorkspaceMeta(baseStorageKey)?.lastLanguage : null) ??
      "python";

    const initialLanguage = isCodeLanguage(wanted) ? wanted : "python";

    if (forcedLanguage && resetOnForcedLanguageChange) {
      resetWorkspaceForLanguage(forcedLanguage);
      hydratedRef.current = true;
      prevForcedRef.current = forcedLanguage;
      return;
    }

    let ws = loadWorkspaceForLanguage(initialLanguage);

    if (!ws) {
      ws = tryMigrateInitialWorkspace({
        baseStorageKey,
        initialLanguage,
        forcedLanguage,
        draftStorageMode,
        saveWorkspaceForLanguage,
      });
    }

    if (ws) {
      hydrateWorkspace(ws);
    } else {
      const base = createDefaultStateForLanguage(initialLanguage);
      hydrateWorkspace(
        access.canUseMultiFile ? base : buildSingleFileWorkspace(initialLanguage, base),
      );
    }

    hydratedRef.current = true;
    prevForcedRef.current = forcedLanguage ?? null;
  }, [
    initialWorkspace,
    baseStorageKey,
    forcedLanguage,
    resetOnForcedLanguageChange,
    loadWorkspaceForLanguage,
    saveWorkspaceForLanguage,
    hydrateWorkspace,
    resetWorkspaceForLanguage,
    access.canUseMultiFile,
    draftStorageMode,
  ]);

  useEffect(() => {
    if (!hydratedRef.current || !forcedLanguage) return;
    if (prevForcedRef.current === forcedLanguage) return;

    prevForcedRef.current = forcedLanguage;

    if (resetOnForcedLanguageChange) {
      resetWorkspaceForLanguage(forcedLanguage);
    } else {
      switchLanguage(forcedLanguage);
    }
  }, [forcedLanguage, resetOnForcedLanguageChange, resetWorkspaceForLanguage, switchLanguage]);

  useEffect(() => {
    if (!hydratedRef.current || !currentWorkspace) return;
    if (draftStorageMode !== "local") return;

    const id = window.setTimeout(() => {
      saveWorkspaceForLanguage(currentWorkspace);
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(id);
  }, [currentWorkspace, saveWorkspaceForLanguage, draftStorageMode]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (draftStorageMode !== "local") return;

    const flush = () => {
      saveWorkspaceForLanguage(currentWorkspaceRef.current);
    };

    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);

    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [saveWorkspaceForLanguage, draftStorageMode]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (access.canUseMultiFile) return;

    const ws = currentWorkspaceRef.current;
    if (!ws) return;

    const fileCount = ws.nodes.filter((n): n is FileNode => n.kind === "file").length;
    if (fileCount <= 1) return;

    hydrateWorkspace(normalizeWorkspaceForAccess(ws, access));
    clearTransientUi();
    setToast({
      kind: "error",
      text: access.hasUser
        ? "This workspace was reduced to one file because multi-file is locked."
        : "Log in to unlock multiple files.",
    });
  }, [access, hydrateWorkspace, clearTransientUi]);

  const activeFile = useMemo(() => findFile(nodes, activeFileId), [nodes, activeFileId]);
  const entryFile = useMemo(() => findFile(nodes, entryFileId), [nodes, entryFileId]);

  const tabFiles = useMemo(() => {
    const map = new Map(
      nodes.filter((n): n is FileNode => n.kind === "file").map((f) => [f.id, f] as const),
    );

    return openTabs.map((id) => map.get(id)).filter(Boolean) as FileNode[];
  }, [nodes, openTabs]);

  const rootSrc = useMemo(
    () =>
      nodes.find(
        (n) => n.kind === "folder" && n.name === "src" && n.parentId === null,
      ) as FolderNode | undefined,
    [nodes],
  );

  const openFile = useCallback(
    (id: NodeId) =>
      openFileAction({
        nodes,
        id,
        setActiveFileId,
        setOpenTabs,
      }),
    [nodes],
  );

  const closeTab = useCallback(
    (id: NodeId) =>
      closeTabAction({
        id,
        activeFileId,
        setActiveFileId,
        setOpenTabs,
      }),
    [activeFileId],
  );

  const onChangeCode = useCallback(
    (code: string) =>
      onChangeCodeAction({
        activeFile,
        code,
        setNodes,
      }),
    [activeFile],
  );

  const toggleFolder = useCallback(
    (id: NodeId) =>
      toggleFolderAction({
        id,
        setInlineEdit,
        setExpanded,
      }),
    [],
  );

  const startNewFile = useCallback(
      (parentId: NodeId | null ) =>
      startNewFileAction({
        access,
        language,
        nodes,
        parentId,
        setExpanded,
        setInlineEdit,
        setToast,
      }),
    [access, language, nodes],
  );

    const startNewFolder = useCallback(
        (parentId?: NodeId | null) =>
            startNewFolderAction({
                access,
                nodes,
                parentId: parentId ?? null,
                setExpanded,
                setInlineEdit,
                setToast,
            }),
        [access, nodes],
    );

  const startRename = useCallback(
    (nodeId: NodeId) =>
      startRenameAction({
        access,
        nodes,
        nodeId,
        setInlineEdit,
        setToast,
      }),
    [access, nodes],
  );

  const commitInlineEdit = useCallback(
    () =>
      commitInlineEditAction({
        access,
        inlineEdit,
        language,
        nodes,
        setNodes,
        setExpanded,
        setInlineEdit,
        setActiveFileId,
        setOpenTabs,
        setToast,
      }),
    [access, inlineEdit, language, nodes],
  );

  const cancelInlineEdit = useCallback(() => setInlineEdit(null), []);
  const setEntry = useCallback((id: NodeId) => setEntryFileId(id), []);

  const requestDelete = useCallback(
    (id: NodeId) =>
      requestDeleteAction({
        access,
        nodes,
        id,
        language,
        entryFileId,
        setPendingDeleteId,
        setToast,
      }),
    [access, nodes, language, entryFileId],
  );

  const performDelete = useCallback(
    (id: NodeId) =>
      performDeleteAction({
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
      }),
    [nodes, language, entryFileId],
  );

  const onMouseDownDivider = useCallback(
    (e: React.MouseEvent, rootEl: HTMLElement | null) => {
      e.preventDefault();
      beginDividerDrag({ clientX: e.clientX, rootEl, leftPct, dragRef, setLeftPct });
    },
    [leftPct],
  );

  const onPointerDownDivider = useCallback(
    (e: React.PointerEvent, rootEl: HTMLElement | null) => {
      e.preventDefault();
      beginDividerDrag({ clientX: e.clientX, rootEl, leftPct, dragRef, setLeftPct });
    },
    [leftPct],
  );

  const onKeyDownDivider = useCallback(
    (e: React.KeyboardEvent, rootEl: HTMLElement | null) => {
      handleDividerKeyDown({ e, rootEl, setLeftPct });
    },
    [],
  );

  return {
    state: {
      language,
      nodes,
      openTabs,
      activeFileId,
      entryFileId,
      stdin,
      expanded,
      leftPct,
      filter,
      inlineEdit,
      pendingDeleteId,
      toast,
      access,
    },
    derived: {
      activeFile,
      entryFile,
      tabFiles,
      rootSrc,
      currentWorkspace,
      isSingleFileMode: !access.canUseMultiFile,
    },
    actions: {
      setLanguage: switchLanguage,
      setNodes,
      setOpenTabs,
      setActiveFileId,
      setEntryFileId,
      setStdin,
      setExpanded,
      setLeftPct,
      setFilter,
      setInlineEdit,
      setPendingDeleteId,
      setToast,

      replaceWorkspace,
      resetWorkspaceForLanguage,
      switchLanguage,

      openFile,
      closeTab,
      onChangeCode,
      toggleFolder,

      startNewFile,
      startNewFolder,
      startRename,
      commitInlineEdit,
      cancelInlineEdit,

      setEntry,
      requestDelete,
      performDelete,

      onMouseDownDivider,
      onPointerDownDivider,
      onKeyDownDivider,
    },
    constants: {
      allLanguages: ALL_LANGUAGES,
    },
  };
}
