"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
    FileNode,
    FolderNode,
    FSNode,
    InlineEdit,
    NodeId,
    Toast,
    WorkspaceStateV2,
} from "../types";
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
    importExternalFiles as importExternalFilesAction,
    moveNode as moveNodeAction,
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
import {
    IdeWorkspacePolicy,
    ImportedWorkspaceFile,
    resolveWorkspacePolicy
} from "@/components/ide/workspaceHook/workspace.policy";

export { type IdeWorkspaceAccess, type UseIdeWorkspaceOpts, type UseIdeWorkspaceResult } from "./workspace.types";

function buildEphemeralLocalWorkspaceId() {
    return `local:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

type WorkspaceHistorySnapshot = {
    language: CodeLanguage;
    nodes: FSNode[];
    openTabs: NodeId[];
    activeFileId: NodeId;
    entryFileId: NodeId;
    stdin: string;
    expanded: NodeId[];
};

const HISTORY_LIMIT = 100;

function cloneNode<T extends FSNode>(node: T): T {
    return { ...node } as T;
}

function cloneSnapshot(s: WorkspaceHistorySnapshot): WorkspaceHistorySnapshot {
    return {
        language: s.language,
        nodes: s.nodes.map((n) => cloneNode(n)),
        openTabs: [...s.openTabs],
        activeFileId: s.activeFileId,
        entryFileId: s.entryFileId,
        stdin: s.stdin,
        expanded: [...s.expanded],
    };
}

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    if (target.closest("[contenteditable='true']")) return true;
    if (target.closest("[role='textbox']")) return true;
    if (target.closest(".monaco-editor")) return true;

    return false;
}
export function useIdeWorkspace(opts?: UseIdeWorkspaceOpts): UseIdeWorkspaceResult {
    const baseStorageKey = opts?.storageKey ?? STORAGE_KEY_V2;
    const forcedLanguage = opts?.forcedLanguage;
    const resetOnForcedLanguageChange = !!opts?.resetOnForcedLanguageChange;
    const access = opts?.access ?? DEFAULT_ACCESS;
    const policy = useMemo<IdeWorkspacePolicy>(
        () => opts?.policy ?? resolveWorkspacePolicy(access),
        [opts?.policy, access],
    );
    const draftStorageMode = opts?.draftStorageMode ?? "local";
    const initialWorkspace = opts?.initialWorkspace ?? null;

    const actorKey = opts?.actorKey ?? (access.hasUser ? "user" : "anonymous");
    const projectId = opts?.projectId ?? null;
    const scopeKey = opts?.scopeKey ?? null;

    const localWorkspaceIdRef = useRef<string>(
        opts?.localWorkspaceId ?? buildEphemeralLocalWorkspaceId(),
    );

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
    const prevIdentityRef = useRef<string>("");

    const draftIdentity = useMemo(
        () =>
            JSON.stringify({
                actorKey,
                projectId,
                scopeKey,
                localWorkspaceId: projectId ? null : localWorkspaceIdRef.current,
            }),
        [actorKey, projectId, scopeKey],
    );

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



    const historyRef = useRef<{
        past: WorkspaceHistorySnapshot[];
        future: WorkspaceHistorySnapshot[];
    }>({
        past: [],
        future: [],
    });

    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const syncHistoryFlags = useCallback(() => {
        setCanUndo(historyRef.current.past.length > 0);
        setCanRedo(historyRef.current.future.length > 0);
    }, []);

    const takeHistorySnapshot = useCallback(
        (): WorkspaceHistorySnapshot => ({
            language,
            nodes: nodes.map((n) => cloneNode(n)),
            openTabs: [...openTabs],
            activeFileId,
            entryFileId,
            stdin,
            expanded: Array.from(expanded),
        }),
        [language, nodes, openTabs, activeFileId, entryFileId, stdin, expanded],
    );

    const restoreHistorySnapshot = useCallback(
        (snap: WorkspaceHistorySnapshot) => {
            setLanguageState(snap.language);
            setNodes(snap.nodes.map((n) => cloneNode(n)));
            setOpenTabs([...snap.openTabs]);
            setActiveFileId(snap.activeFileId);
            setEntryFileId(snap.entryFileId);
            setStdin(snap.stdin);
            setExpanded(new Set(snap.expanded));
            setInlineEdit(null);
            setPendingDeleteId(null);
        },
        [
            setLanguageState,
            setNodes,
            setOpenTabs,
            setActiveFileId,
            setEntryFileId,
            setStdin,
            setExpanded,
            setInlineEdit,
            setPendingDeleteId,
        ],
    );

    const pushUndoSnapshot = useCallback(() => {
        const snap = cloneSnapshot(takeHistorySnapshot());
        const last = historyRef.current.past[historyRef.current.past.length - 1];

        if (last && JSON.stringify(last) === JSON.stringify(snap)) {
            return;
        }

        historyRef.current.past.push(snap);

        if (historyRef.current.past.length > HISTORY_LIMIT) {
            historyRef.current.past.shift();
        }

        historyRef.current.future = [];
        syncHistoryFlags();
    }, [takeHistorySnapshot, syncHistoryFlags]);

    const undo = useCallback(() => {
        const prev = historyRef.current.past.pop();
        if (!prev) return;

        const current = cloneSnapshot(takeHistorySnapshot());
        historyRef.current.future.push(current);

        if (historyRef.current.future.length > HISTORY_LIMIT) {
            historyRef.current.future.shift();
        }

        restoreHistorySnapshot(prev);
        syncHistoryFlags();
    }, [takeHistorySnapshot, restoreHistorySnapshot, syncHistoryFlags]);

    const redo = useCallback(() => {
        const next = historyRef.current.future.pop();
        if (!next) return;

        const current = cloneSnapshot(takeHistorySnapshot());
        historyRef.current.past.push(current);

        if (historyRef.current.past.length > HISTORY_LIMIT) {
            historyRef.current.past.shift();
        }

        restoreHistorySnapshot(next);
        syncHistoryFlags();
    }, [takeHistorySnapshot, restoreHistorySnapshot, syncHistoryFlags]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod || e.altKey) return;
            if (isEditableTarget(e.target)) return;

            const key = e.key.toLowerCase();

            if (key === "z" && !e.shiftKey) {
                if (!canUndo) return;
                e.preventDefault();
                undo();
                return;
            }

            if ((key === "z" && e.shiftKey) || key === "y") {
                if (!canRedo) return;
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [undo, redo, canUndo, canRedo]);

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
    currentWorkspaceRef.current = currentWorkspace;

    const loadWorkspaceForLanguage = useCallback(
        (next: CodeLanguage) =>
            loadWorkspaceForLanguageRaw({
                baseStorageKey,
                next,
                draftStorageMode,
                actorKey,
                projectId,
                scopeKey,
                localWorkspaceId: projectId ? null : localWorkspaceIdRef.current,
            }),
        [baseStorageKey, draftStorageMode, actorKey, projectId, scopeKey],
    );

    const saveWorkspaceForLanguage = useCallback(
        (ws: WorkspaceStateV2 | null) =>
            saveWorkspaceForLanguageRaw({
                baseStorageKey,
                ws,
                draftStorageMode,
                actorKey,
                projectId,
                scopeKey,
                localWorkspaceId: projectId ? null : localWorkspaceIdRef.current,
            }),
        [baseStorageKey, draftStorageMode, actorKey, projectId, scopeKey],
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
        if (prevIdentityRef.current === draftIdentity) return;
        prevIdentityRef.current = draftIdentity;

        if (initialWorkspace) {
            hydrateWorkspace(initialWorkspace);
            hydratedRef.current = true;
            prevForcedRef.current = forcedLanguage ?? null;
            return;
        }

        const meta =
            draftStorageMode === "local" ? readWorkspaceMeta(baseStorageKey) : null;

        const wanted =
            forcedLanguage ??
            (meta &&
            meta.actorKey === (actorKey?.trim() || "anonymous") &&
            (meta.projectId ?? null) === projectId &&
            (meta.scopeKey ?? null) === scopeKey &&
            (meta.localWorkspaceId ?? null) === (projectId ? null : localWorkspaceIdRef.current)
                ? meta.lastLanguage
                : null) ??
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
        actorKey,
        projectId,
        scopeKey,
        draftIdentity,
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
        if (draftStorageMode !== "local") return;

        return () => {
            saveWorkspaceForLanguage(currentWorkspaceRef.current);
        };
    }, [saveWorkspaceForLanguage, draftStorageMode]);
    useEffect(() => {
        if (!hydratedRef.current) return;
        if (draftStorageMode !== "local") return;

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                saveWorkspaceForLanguage(currentWorkspaceRef.current);
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
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



    const importExternalFiles = useCallback(
        (files: ImportedWorkspaceFile[]) => {
            pushUndoSnapshot();
            return importExternalFilesAction({
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
            });
        },
        [pushUndoSnapshot, access, policy, nodes, activeFileId],
    );

    const startNewFile = useCallback(
        (parentId: NodeId | null) =>
            startNewFileAction({
                access,
                policy,
                language,
                nodes,
                parentId,
                setExpanded,
                setInlineEdit,
                setToast,
            }),
        [access, policy, language, nodes],
    );

    const startNewFolder = useCallback(
        (parentId?: NodeId | null) =>
            startNewFolderAction({
                policy,
                nodes,
                parentId: parentId ?? null,
                setExpanded,
                setInlineEdit,
                setToast,
            }),
        [policy, nodes],
    );

    const startRename = useCallback(
        (nodeId: NodeId) =>
            startRenameAction({
                access,
                policy,
                nodes,
                nodeId,
                setInlineEdit,
                setToast,
            }),
        [access, policy, nodes],
    );

    const commitInlineEdit = useCallback(() => {
        pushUndoSnapshot();
        return commitInlineEditAction({
            access,
            policy,
            language,
            inlineEdit,
            nodes,
            activeFileId,
            setNodes,
            setOpenTabs,
            setActiveFileId,
            setExpanded,
            setInlineEdit,
            setToast,
        });
    }, [
        pushUndoSnapshot,
        access,
        policy,
        language,
        inlineEdit,
        nodes,
        activeFileId,
    ]);

    const requestDelete = useCallback(
        (id: NodeId) =>
            requestDeleteAction({
                policy,
                nodes,
                id,
                language,
                entryFileId,
                setPendingDeleteId,
                setToast,
            }),
        [policy, nodes, language, entryFileId],
    );

    const moveNode = useCallback(
        (id: NodeId, parentId: NodeId | null) => {
            pushUndoSnapshot();
            return moveNodeAction({
                policy,
                nodes,
                id,
                parentId,
                setNodes,
                setExpanded,
                setToast,
            });
        },
        [pushUndoSnapshot, policy, nodes],
    );




    const cancelInlineEdit = useCallback(() => setInlineEdit(null), []);
    const setEntry = useCallback(
        (id: NodeId) => {
            pushUndoSnapshot();
            setEntryFileId(id);
        },
        [pushUndoSnapshot, setEntryFileId],
    );


    const performDelete = useCallback(() => {
        if (!pendingDeleteId) return;

        pushUndoSnapshot();

        return performDeleteAction({
            nodes,
            id: pendingDeleteId,
            language,
            entryFileId,
            setNodes,
            setOpenTabs,
            setActiveFileId,
            setExpanded,
            setPendingDeleteId,
            setToast,
        });
    }, [
        pushUndoSnapshot,
        nodes,
        pendingDeleteId,
        language,
        entryFileId,
    ]);

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
        history: {
            canUndo,
            canRedo,
        },
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
            policy
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
           importExternalFiles ,
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
undo, redo,
            setEntry,
            requestDelete,
            performDelete,
moveNode,
            onMouseDownDivider,
            onPointerDownDivider,
            onKeyDownDivider,
        },
        constants: {
            allLanguages: ALL_LANGUAGES,
        },
    };
}