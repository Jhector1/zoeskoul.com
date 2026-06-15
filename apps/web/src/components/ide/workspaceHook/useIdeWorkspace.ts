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
import type { WorkspaceLanguage } from "@/lib/practice/types";
import type { UseIdeWorkspaceOpts, UseIdeWorkspaceResult } from "./workspace.types";

import { findFile, pathOf } from "../fsTree";
import { ALL_LANGUAGES, DEFAULT_ACCESS, SAVE_DEBOUNCE_MS } from "./workspace.constants";
import {
    STORAGE_KEY_V2,
    isWorkspaceLanguage,
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
    resolveWorkspacePolicy,
} from "@/components/ide/workspaceHook/workspace.policy";

export {
    type IdeWorkspaceAccess,
    type UseIdeWorkspaceOpts,
    type UseIdeWorkspaceResult,
} from "./workspace.types";

function buildEphemeralLocalWorkspaceId() {
    return `local:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

type WorkspaceHistorySnapshot = {
    language: WorkspaceLanguage;
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

function remapExpandedFolderIds(
    prevNodes: FSNode[],
    prevExpanded: Iterable<NodeId>,
    nextNodes: FSNode[],
): NodeId[] {
    const nextFoldersByPath = new Map<string, FolderNode>();

    for (const node of nextNodes) {
        if (node.kind !== "folder") continue;
        nextFoldersByPath.set(pathOf(nextNodes, node.id), node);
    }

    const out: NodeId[] = [];
    const seen = new Set<NodeId>();

    for (const id of prevExpanded) {
        const prevFolder = prevNodes.find(
            (n): n is FolderNode => n.kind === "folder" && n.id === id,
        );
        if (!prevFolder) continue;

        const nextFolder = nextFoldersByPath.get(pathOf(prevNodes, prevFolder.id));
        if (!nextFolder) continue;
        if (seen.has(nextFolder.id)) continue;

        seen.add(nextFolder.id);
        out.push(nextFolder.id);
    }

    return out;
}



function arrayShallowEqual<T>(a: readonly T[], b: readonly T[]) {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }

    return true;
}

function setShallowEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>) {
    if (a === b) return true;
    if (a.size !== b.size) return false;

    for (const value of a) {
        if (!b.has(value)) return false;
    }

    return true;
}

function nodeHydrationSnapshots(nodes: readonly FSNode[]) {
    return nodes
        .map((node) => {
            const nodePath = pathOf(nodes as FSNode[], (node as any).id);
            if ((node as any).kind === "file") {
                return {
                    path: nodePath,
                    kind: (node as any).kind,
                    content: (node as any).content ?? "",
                };
            }

            return {
                path: nodePath,
                kind: (node as any).kind,
            };
        })
        .sort((a, b) => String(a.path).localeCompare(String(b.path)));
}

function nodePathById(nodes: readonly FSNode[], id: NodeId | null | undefined) {
    if (!id) return null;
    return pathOf(nodes as FSNode[], id);
}

function nodePathsById(nodes: readonly FSNode[], ids: readonly NodeId[] | undefined) {
    return (ids ?? [])
        .map((id) => nodePathById(nodes, id))
        .filter((path): path is string => typeof path === "string" && path.length > 0);
}

function nodesHydrationKey(nodes: readonly FSNode[]) {
    return JSON.stringify(nodeHydrationSnapshots(nodes));
}

function workspaceStateHydrationKey(ws: Pick<
    WorkspaceStateV2,
    "language" | "nodes" | "openTabs" | "activeFileId" | "entryFileId" | "stdin" | "expanded" | "leftPct"
>) {
    return JSON.stringify({
        language: ws.language,
        nodes: nodeHydrationSnapshots(ws.nodes),
        openTabs: nodePathsById(ws.nodes, ws.openTabs?.length ? ws.openTabs : [ws.activeFileId]),
        activePath: nodePathById(ws.nodes, ws.activeFileId),
        entryPath: nodePathById(ws.nodes, ws.entryFileId),
        stdin: ws.stdin ?? "",
        expanded: nodePathsById(ws.nodes, ws.expanded ?? []),
        leftPct: ws.leftPct ?? 26,
    });
}

export function useIdeWorkspace(opts?: UseIdeWorkspaceOpts): UseIdeWorkspaceResult {
    const baseStorageKey = opts?.storageKey ?? STORAGE_KEY_V2;
    const forcedLanguage = opts?.forcedLanguage;
    const resetOnForcedLanguageChange = !!opts?.resetOnForcedLanguageChange;
    const access = opts?.access ?? DEFAULT_ACCESS;

    const [language, setLanguageState] = useState<WorkspaceLanguage>(
        forcedLanguage ?? "python",
    );

    const policy = useMemo<IdeWorkspacePolicy>(
        () => opts?.policy ?? resolveWorkspacePolicy(access, language, opts?.fileActions ?? null),
        [opts?.policy, opts?.fileActions, access, language],
    );

    const draftStorageMode = opts?.draftStorageMode ?? "local";
    const initialWorkspace = opts?.initialWorkspace ?? null;

    const localWorkspaceIdRef = useRef<string>(
        opts?.localWorkspaceId ?? buildEphemeralLocalWorkspaceId(),
    );

    const actorKey = useMemo(() => {
        const explicit = opts?.actorKey?.trim();
        if (explicit) return explicit;

        if (access.hasUser) {
            return `unsafe-user:${localWorkspaceIdRef.current}`;
        }

        return "anonymous";
    }, [opts?.actorKey, access.hasUser]);

    const projectId = draftStorageMode === "local" ? null : (opts?.projectId ?? null);
    const scopeKey = opts?.scopeKey ?? null;
    const exerciseStateKey = opts?.exerciseStateKey ?? null;

    // const [language, setLanguageState] = useState<WorkspaceLanguage>("python");
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
    const prevForcedRef = useRef<WorkspaceLanguage | null>(null);
    const hydrateRequestIdRef = useRef(0);
    const completedHydrationIdentityRef = useRef<string>("");

    const [storageHydrated, setStorageHydrated] = useState(
        draftStorageMode !== "local" || !!initialWorkspace,
    );

    const draftIdentity = useMemo(
        () =>
            JSON.stringify({
                actorKey,
                projectId,
                scopeKey,
                exerciseStateKey,
                localWorkspaceId: projectId ? null : localWorkspaceIdRef.current,
            }),
        [actorKey, projectId, scopeKey, exerciseStateKey],
    );

    const hydrationIdentity = useMemo(
        () =>
            JSON.stringify({
                draftIdentity,
                forcedLanguage: forcedLanguage ?? null,
                draftStorageMode,
                hasInitialWorkspace: !!initialWorkspace,
            }),
        [draftIdentity, forcedLanguage, draftStorageMode, initialWorkspace],
    );

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 2600);
        return () => clearTimeout(t);
    }, [toast]);

    const clearTransientUi = useCallback(() => {
        setFilter((prev) => (prev === "" ? prev : ""));
        setInlineEdit((prev) => (prev == null ? prev : null));
        setPendingDeleteId((prev) => (prev == null ? prev : null));
    }, []);

    const materializeWorkspaceForAccess = useCallback(
        (nextLanguage: WorkspaceLanguage, base: WorkspaceStateV2) => {
            if (nextLanguage === "web") return base;
            return access.canUseMultiFile ? base : buildSingleFileWorkspace(nextLanguage, base);
        },
        [access.canUseMultiFile],
    );


    const lastHydratedWorkspaceKeyRef = useRef<string>("");
    const hydrateWorkspace = useCallback(
        (ws: WorkspaceStateV2) => {
            const normalized = normalizeWorkspaceForAccess(ws, access);
            const nextOpenTabs = normalized.openTabs?.length
                ? normalized.openTabs
                : [normalized.activeFileId];
            const nextExpanded = new Set(normalized.expanded ?? []);
            const nextLeftPct = normalized.leftPct ?? 26;
            const nextKey = workspaceStateHydrationKey({
                ...normalized,
                openTabs: nextOpenTabs,
                expanded: Array.from(nextExpanded),
                leftPct: nextLeftPct,
            });
            const currentKey = workspaceStateHydrationKey({
                language,
                nodes,
                openTabs: openTabs.length ? openTabs : [activeFileId],
                activeFileId,
                entryFileId,
                stdin,
                expanded: Array.from(expanded),
                leftPct,
            });

            if (currentKey === nextKey) {
                lastHydratedWorkspaceKeyRef.current = nextKey;
                return;
            }

            // Critical loop guard:
            // FullIDE and tool bindings may ask us to hydrate the same workspace many times.
            // Hydrating the same workspace must be a no-op.
            if (lastHydratedWorkspaceKeyRef.current === nextKey) {
                return;
            }

            lastHydratedWorkspaceKeyRef.current = nextKey;

            if (language !== normalized.language) {
                setLanguageState(normalized.language);
            }

            if (nodesHydrationKey(nodes) !== nodesHydrationKey(normalized.nodes)) {
                setNodes(normalized.nodes);
            }

            if (!arrayShallowEqual(openTabs, nextOpenTabs)) {
                setOpenTabs(nextOpenTabs);
            }

            if (activeFileId !== normalized.activeFileId) {
                setActiveFileId(normalized.activeFileId);
            }

            if (entryFileId !== normalized.entryFileId) {
                setEntryFileId(normalized.entryFileId);
            }

            if (stdin !== (normalized.stdin ?? "")) {
                setStdin(normalized.stdin ?? "");
            }

            if (!setShallowEqual(expanded, nextExpanded)) {
                setExpanded(nextExpanded);
            }

            if (leftPct !== nextLeftPct) {
                setLeftPct(nextLeftPct);
            }
        },
        [access, activeFileId, entryFileId, expanded, language, leftPct, nodes, openTabs, stdin],
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

    const restoreHistorySnapshot = useCallback((snap: WorkspaceHistorySnapshot) => {
        setLanguageState(snap.language);
        setNodes(snap.nodes.map((n) => cloneNode(n)));
        setOpenTabs([...snap.openTabs]);
        setActiveFileId(snap.activeFileId);
        setEntryFileId(snap.entryFileId);
        setStdin(snap.stdin);
        setExpanded(new Set(snap.expanded));
        setInlineEdit(null);
        setPendingDeleteId(null);
    }, []);

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
            const normalized = normalizeWorkspaceForAccess(ws, access);
            const preservedExpanded = remapExpandedFolderIds(
                nodes,
                expanded,
                normalized.nodes,
            );

            const nextWorkspace = {
                ...normalized,
                expanded: preservedExpanded,
            };

            hydrateWorkspace(nextWorkspace);

            clearTransientUi();
            setToast((prev) => (prev == null ? prev : null));
            setStorageHydrated((prev) => (prev === true ? prev : true));
        },
        [hydrateWorkspace, clearTransientUi, access, nodes, expanded],
    );

    const resetWorkspaceForLanguage = useCallback(
        (next: WorkspaceLanguage) => {
            const base = createDefaultStateForLanguage(next);
            hydrateWorkspace(materializeWorkspaceForAccess(next, base));
            clearTransientUi();
            setStorageHydrated((prev) => (prev === true ? prev : true));
        },
        [hydrateWorkspace, clearTransientUi, materializeWorkspaceForAccess],
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
        async (next: WorkspaceLanguage) =>
            await loadWorkspaceForLanguageRaw({
                baseStorageKey,
                next,
                draftStorageMode,
                actorKey,
                projectId,
                scopeKey,
                exerciseStateKey,
                localWorkspaceId: projectId ? null : localWorkspaceIdRef.current,
            }),
        [
            baseStorageKey,
            draftStorageMode,
            actorKey,
            projectId,
            scopeKey,
            exerciseStateKey,
        ],
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
                exerciseStateKey,
                localWorkspaceId: projectId ? null : localWorkspaceIdRef.current,
            }),
        [
            baseStorageKey,
            draftStorageMode,
            actorKey,
            projectId,
            scopeKey,
            exerciseStateKey,
        ],
    );

    const switchLanguage = useCallback(
        (next: WorkspaceLanguage) => {
            if (!isWorkspaceLanguage(next)) return;
            if (next === language) return;

            const requestId = ++hydrateRequestIdRef.current;
            setStorageHydrated(false);

            saveWorkspaceForLanguage(currentWorkspaceRef.current);

            void (async () => {
                try {
                    const loaded = await loadWorkspaceForLanguage(next);

                    if (hydrateRequestIdRef.current !== requestId) {
                        return;
                    }

                    if (loaded) {
                        hydrateWorkspace(loaded);
                    } else {
                        const base = createDefaultStateForLanguage(next);
                        hydrateWorkspace(materializeWorkspaceForAccess(next, base));
                    }

                    clearTransientUi();
                    setToast(null);
                } catch (error) {
                    console.error("[ide] switchLanguage failed", error);

                    if (hydrateRequestIdRef.current !== requestId) return;

                    const base = createDefaultStateForLanguage(next);
                    hydrateWorkspace(materializeWorkspaceForAccess(next, base));

                    setToast({
                        kind: "error",
                        text: `Could not restore ${next}. Loaded a fresh workspace instead.`,
                    });
                } finally {
                    if (hydrateRequestIdRef.current !== requestId) return;
                    hydratedRef.current = true;
                    setStorageHydrated(true);
                }
            })();
        },
        [
            language,
            saveWorkspaceForLanguage,
            loadWorkspaceForLanguage,
            hydrateWorkspace,
            clearTransientUi,
            materializeWorkspaceForAccess,
        ],
    );

    useEffect(() => {
        if (
            completedHydrationIdentityRef.current === hydrationIdentity &&
            hydratedRef.current
        ) {
            return;
        }

        const requestId = ++hydrateRequestIdRef.current;
        let cancelled = false;

        void (async () => {
            try {
                if (initialWorkspace) {
                    if (cancelled || hydrateRequestIdRef.current !== requestId) return;
                    hydrateWorkspace(initialWorkspace);
                    return;
                }

                if (draftStorageMode !== "local") {
                    const baseLanguage =
                        forcedLanguage && isWorkspaceLanguage(forcedLanguage)
                            ? forcedLanguage
                            : "python";
                    const base = createDefaultStateForLanguage(baseLanguage);

                    if (cancelled || hydrateRequestIdRef.current !== requestId) return;

                    hydrateWorkspace(materializeWorkspaceForAccess(baseLanguage, base));
                    return;
                }

                setStorageHydrated(false);

                const meta = readWorkspaceMeta(baseStorageKey);

                const wanted =
                    forcedLanguage ??
                    (meta &&
                    meta.actorKey === (actorKey?.trim() || "anonymous") &&
                    (meta.projectId ?? null) === projectId &&
                    (meta.scopeKey ?? null) === scopeKey &&
                    (meta.localWorkspaceId ?? null) ===
                    (projectId ? null : localWorkspaceIdRef.current)
                        ? meta.lastLanguage
                        : null) ??
                    "python";

                const initialLanguage = isWorkspaceLanguage(wanted) ? wanted : "python";

                if (forcedLanguage && resetOnForcedLanguageChange) {
                    if (cancelled || hydrateRequestIdRef.current !== requestId) return;

                    const base = createDefaultStateForLanguage(forcedLanguage);
                    hydrateWorkspace(materializeWorkspaceForAccess(forcedLanguage, base));
                    return;
                }

                let ws = await loadWorkspaceForLanguage(initialLanguage);

                if (cancelled || hydrateRequestIdRef.current !== requestId) return;

                if (!ws) {
                    ws = tryMigrateInitialWorkspace({
                        baseStorageKey,
                        initialLanguage,
                        forcedLanguage,
                        draftStorageMode,
                        saveWorkspaceForLanguage,
                    });
                }

                if (cancelled || hydrateRequestIdRef.current !== requestId) return;

                if (ws) {
                    hydrateWorkspace(ws);
                } else {
                    const base = createDefaultStateForLanguage(initialLanguage);
                    hydrateWorkspace(materializeWorkspaceForAccess(initialLanguage, base));
                }
            } catch (error) {
                console.error("[ide] initial hydrate failed", error);

                const fallbackLanguage =
                    forcedLanguage && isWorkspaceLanguage(forcedLanguage)
                        ? forcedLanguage
                        : "python";

                if (cancelled || hydrateRequestIdRef.current !== requestId) return;

                const base = createDefaultStateForLanguage(fallbackLanguage);
                hydrateWorkspace(materializeWorkspaceForAccess(fallbackLanguage, base));

                setToast({
                    kind: "error",
                    text: "Could not restore your draft. Loaded a fresh workspace instead.",
                });
            } finally {
                if (cancelled || hydrateRequestIdRef.current !== requestId) return;

                completedHydrationIdentityRef.current = hydrationIdentity;
                hydratedRef.current = true;
                prevForcedRef.current = forcedLanguage ?? null;
                setStorageHydrated(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        initialWorkspace,
        baseStorageKey,
        forcedLanguage,
        resetOnForcedLanguageChange,
        loadWorkspaceForLanguage,
        saveWorkspaceForLanguage,
        hydrateWorkspace,
        draftStorageMode,
        actorKey,
        projectId,
        scopeKey,
        hydrationIdentity,
        materializeWorkspaceForAccess,
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
        if (!hydratedRef.current || !storageHydrated || !currentWorkspace) return;
        if (draftStorageMode !== "local") return;

        const id = window.setTimeout(() => {
            saveWorkspaceForLanguage(currentWorkspace);
        }, SAVE_DEBOUNCE_MS);

        return () => window.clearTimeout(id);
    }, [currentWorkspace, saveWorkspaceForLanguage, draftStorageMode, storageHydrated]);

    useEffect(() => {
        if (!hydratedRef.current || !storageHydrated) return;
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
    }, [saveWorkspaceForLanguage, draftStorageMode, storageHydrated]);

    useEffect(() => {
        if (!storageHydrated) return;
        if (draftStorageMode !== "local") return;

        return () => {
            saveWorkspaceForLanguage(currentWorkspaceRef.current);
        };
    }, [saveWorkspaceForLanguage, draftStorageMode, storageHydrated]);

    useEffect(() => {
        if (!hydratedRef.current || !storageHydrated) return;
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
    }, [saveWorkspaceForLanguage, draftStorageMode, storageHydrated]);

    useEffect(() => {
        if (!hydratedRef.current || !storageHydrated) return;
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
    }, [access, hydrateWorkspace, clearTransientUi, storageHydrated]);

    const activeFile = useMemo(() => findFile(nodes, activeFileId), [nodes, activeFileId]);
    const entryFile = useMemo(() => findFile(nodes, entryFileId), [nodes, entryFileId]);

    const tabFiles = useMemo(() => {
        const map = new Map(
            nodes
                .filter((n): n is FileNode => n.kind === "file")
                .map((f) => [f.id, f] as const),
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
        [pushUndoSnapshot],
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
            policy,
        },
        derived: {
            activeFile,
            entryFile,
            tabFiles,
            rootSrc,
            currentWorkspace,
            isSingleFileMode: !access.canUseMultiFile,
            storageHydrated,
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
            importExternalFiles,
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
            undo,
            redo,
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
