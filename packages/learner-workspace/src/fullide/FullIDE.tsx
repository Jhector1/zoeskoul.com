"use client";

import { resolveExerciseExplorerAvailability } from "./explorerAvailability";
import { getLearnerWorkspaceEnv, getLearnerWorkspaceStaticConfig } from "@zoeskoul/learner-workspace/runtime/appRuntime";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import {
    useFullIDEAuthenticatedUserId,
    useFullIDERouter,
} from "@zoeskoul/learner-workspace/runtime/appRuntime";

import { DEFAULT_SQL_DIALECT } from "@zoeskoul/learner-workspace/runner/constants";
import { useProjectDirtyState } from "@zoeskoul/learner-workspace/projects/hooks/useProjectDirtyState";
import { useProjectsList } from "@zoeskoul/learner-workspace/projects/hooks/useProjectsList";

import { pathOf, exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";
import { planV6InlineIntent, planV6MoveIntent, planV6DeleteIntent } from "./v6ExplorerIntent";
import { v6ExplorerFailureMessage } from "./v6ExplorerFeedback";
import { V6StructuralHistory, supportsV6StructuralHistory } from "./v6StructuralHistory";
import { planV6ExecutorHistoryPublication, v6FileActionLabel } from "./v6ExecutorHistoryLease";
import { prepareV6SessionDownload, saveV6BrowserDownload,
    type V6DownloadSelection } from "./workspaceDownloadV6Session";
import { startV6TabDraftLease, type LeaseIdentity } from "./v6TabDraftLease";
import type { WorkspaceExplorerExecutorV6 } from "@zoeskoul/learner-workspace/runner/runtime";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { useIdeWorkspace } from "@zoeskoul/learner-workspace/ide/workspaceHook/useIdeWorkspace";
import { cn } from "@zoeskoul/learner-workspace/ide/utils";
import IdeDesktopLayout from "@zoeskoul/learner-workspace/fullide/chrome/IdeDesktopLayout";
import IdeHeader from "./IdeHeader";
import { planV6Import } from "./v6ImportPlan";
import { waitForV6ImportView } from "./v6ImportViewBarrier";
import IdeMobileLayout from "@zoeskoul/learner-workspace/fullide/chrome/IdeMobileLayout";
import IdeStatusBanners from "@zoeskoul/learner-workspace/ide/fullide/chrome/IdeStatusBanners";
import IdeToastHost from "@zoeskoul/learner-workspace/fullide/chrome/IdeToastHost";
import IdeConflictBanner from "@zoeskoul/learner-workspace/ide/fullide/chrome/IdeConflictBanner";
import IdeCloudConflictDialog from "./modals/IdeCloudConflictDialog";
import { cloudSaveIntent } from "./hooks/v6CloudConflictPolicy";
import { useIdeProjectSession } from "@zoeskoul/learner-workspace/fullide/hooks/useIdeProjectSession";
import { useIdeRunner } from "@zoeskoul/learner-workspace/fullide/hooks/useIdeRunner";
import { useIdeViewport } from "@zoeskoul/learner-workspace/ide/fullide/hooks/useIdeViewport";
import IdeProjectModals from "@zoeskoul/learner-workspace/fullide/modals/IdeProjectModals";
import IdeEditorPane from "@zoeskoul/learner-workspace/fullide/panes/IdeEditorPane";
import IdeExplorerPane from "@zoeskoul/learner-workspace/fullide/panes/IdeExplorerPane";
import type {FullIDEProps, WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import { CodeRunnerRuntime, ExecutionBackend } from "@zoeskoul/learner-workspace/runner/runtime";
import { mergeTerminalSnapshotIntoWorkspace } from "@zoeskoul/learner-workspace/lib/projects/mergeTerminalSnapshotIntoWorkspace";
import {FullIDEServices, resolveFullIDEServices} from "@zoeskoul/learner-workspace/ide/fullide/services";
import { resolveLearnerWorkspacePresentation } from "@zoeskoul/learner-workspace/fullide/workspacePresentation";
import { resolveExternalWorkspaceApplyKey, resolveReadyWorkspaceReplacementRevision,
    workspaceControlledContentKey,
} from "@zoeskoul/learner-workspace/ide/fullide/externalWorkspaceControl";
import { buildFullIdeSessionRemountKey } from "./sessionRemountKey";
import type { EditorSplitPlacement } from "@zoeskoul/learner-workspace/runner/types";
import {
    resolveFullIdeWorkspaceChangeOrigin,
    type PendingUserWorkspaceMutation,
} from "@zoeskoul/learner-workspace/ide/fullide/workspaceChangeOrigin";
// import {
//     FullIDEServices,
//     resolveFullIDEServices,
// } from "@zoeskoul/learner-workspace/ide/fullide/services";

type WorkspaceHookResult = ReturnType<typeof useIdeWorkspace>;

type FullIDEInnerProps = {
    actorKey: string;
    title: string;
    height: number;
    fullHeight: boolean;
    lessonHref?: string;
    lessonLabel: string;
    showSettingsMenu?: FullIDEProps["showSettingsMenu"];
    access: FullIDEProps["access"];
    loginHref: string;
    billingHref: string;
    initialProjectId: string | null;
    projectTitle?: string | null;
    projectDescription?: string | null;
    projectScope: FullIDEProps["projectScope"];
    readOnly: boolean;
    fileSyncMode?: "v5" | "v6";
    v6DraftTabId?: string | null;
    v6InheritedDraftTabId?: string | null;
    /** Umbrella policy for every browser-local learner-state cache below FullIDE. */
    draftStorageMode: NonNullable<FullIDEProps["draftStorageMode"]>;
    router: ReturnType<typeof useFullIDERouter>;
    splitRef: React.RefObject<HTMLDivElement | null>;
    rootRef: React.RefObject<HTMLDivElement | null>;
    editorHostRef: React.RefObject<HTMLDivElement | null>;
    showMobileExplorer: boolean;
    setShowMobileExplorer: React.Dispatch<React.SetStateAction<boolean>>;
    services: FullIDEServices;
    onBeforeRun?: FullIDEProps["onBeforeRun"];
    onRunResult?: FullIDEProps["onRunResult"];
    remoteWebPreview?: FullIDEProps["remoteWebPreview"];
    remoteWebPreviewSurface?: FullIDEProps["remoteWebPreviewSurface"];
    webPreviewCommerceRequest?: FullIDEProps["webPreviewCommerceRequest"];
    webPreviewSessionKey?: FullIDEProps["webPreviewSessionKey"];
    forceDesktopLayout?: boolean;
    exerciseStateKey?: string;
    workspaceReplacementRevision?: string | number;
    onWorkspaceReplacementApplied?: FullIDEProps["onWorkspaceReplacementApplied"];
    sqlDatasetId?: FullIDEProps["sqlDatasetId"];
    sqlResultShape?: FullIDEProps["sqlResultShape"];
    sqlPaneOptions?: FullIDEProps["sqlPaneOptions"];
    runnerPaneOptions?: FullIDEProps["runnerPaneOptions"];
    defaultSurface?: FullIDEProps["defaultSurface"];
    sqlSchemaSql?: FullIDEProps["sqlSchemaSql"];
    sqlSeedSql?: FullIDEProps["sqlSeedSql"];
    sqlSetupSql?: FullIDEProps["sqlSetupSql"];
    onWorkspaceChange?: FullIDEProps["onWorkspaceChange"];
    onTerminalEvidenceChange?: FullIDEProps["onTerminalEvidenceChange"];
    onTerminalSyncReady?: FullIDEProps["onTerminalSyncReady"];
    sqlInitialTableSnapshots?: FullIDEProps["sqlInitialTableSnapshots"];
    sqlDialect: any;
    setSqlDialect: React.Dispatch<React.SetStateAction<any>>;
    onChangeLanguage?: FullIDEProps["onChangeLanguage"];
    history: WorkspaceHookResult["history"];
    state: WorkspaceHookResult["state"];
    derived: WorkspaceHookResult["derived"];
    actions: WorkspaceHookResult["actions"];
};

function createGuestActorId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getOrCreateGuestActorKey(
    draftStorageMode: NonNullable<FullIDEProps["draftStorageMode"]>,
) {
    if (typeof window === "undefined") return "guest:server";

    const id = createGuestActorId();

    // "off" is authoritative: even actor identity must stay memory-only.
    if (draftStorageMode !== "local") {
        return `guest:${id}`;
    }

    const key = `${getLearnerWorkspaceStaticConfig().appName}.ide.guest-actor.v1`;

    try {
        const existing = window.localStorage.getItem(key);
        if (existing) return `guest:${existing}`;

        window.localStorage.setItem(key, id);
        return `guest:${id}`;
    } catch {
        return `guest:${id}`;
    }
}

function buildScopeKey(projectScope: FullIDEProps["projectScope"]) {
    return projectScope?.scopeKey ?? null;
}

function buildLocalWorkspaceIdSeed(args: {
    projectScope: FullIDEProps["projectScope"];
    forcedLanguage?: FullIDEProps["language"];
}) {
    return [
        "draft",
        args.projectScope?.scopeKey ?? args.projectScope?.kind ?? "global",
        args.forcedLanguage ?? "any",
    ].join("::");
}

function hrefToString(
    href: FullIDEProps["loginHref"],
    fallback = "/authenticate",
) {
    if (!href) return fallback;
    if (typeof href === "string") return href;

    const pathname = href.pathname ?? fallback;
    const query = href.query ?? {};
    const qs = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
        if (value == null) continue;
        qs.set(key, String(value));
    }

    const queryString = qs.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
}

function FullIDEInner({
                          actorKey,
                          title,
                          height,
                          fullHeight,
                          lessonHref,
                          lessonLabel,
                          showSettingsMenu,
                          access,
                          loginHref,
                          billingHref,
                          initialProjectId,
                          projectTitle,
                          projectDescription,
                          projectScope,
                          draftStorageMode,
                          readOnly,
                          fileSyncMode = "v5",
                          v6DraftTabId,
                          v6InheritedDraftTabId,
                          exerciseStateKey,
                          workspaceReplacementRevision,
                          onWorkspaceReplacementApplied,
                          router,
                          splitRef,
                          rootRef,
                          editorHostRef,
                          showMobileExplorer,
                          setShowMobileExplorer,
                          services,
                          onBeforeRun,
                          onRunResult,
                          remoteWebPreview,
                          remoteWebPreviewSurface,
                          webPreviewCommerceRequest,
                          webPreviewSessionKey,
                          forceDesktopLayout,
                          sqlDatasetId,
                          sqlResultShape,
                          sqlPaneOptions,
                          runnerPaneOptions,
                          defaultSurface,
                          sqlSchemaSql,
                          sqlSeedSql,
                          sqlSetupSql,
                          sqlInitialTableSnapshots,
                          sqlDialect,
                          setSqlDialect,
                          onChangeLanguage,
                          state,
                          derived,
                          history,
                          actions,
                          onWorkspaceChange,
                          onTerminalEvidenceChange,
                          onTerminalSyncReady,
                      }: FullIDEInnerProps) {
    const {
        language,
        nodes,
        activeFileId: workspaceActiveFileId,
        entryFileId: workspaceEntryFileId,
        stdin,
        expanded,
        leftPct,
        filter,
        inlineEdit,
        pendingDeleteId,
        toast,
    } = state;

    const { tabFiles, currentWorkspace } = derived;
    const learnerWorkspace = useMemo(
        () =>
            resolveLearnerWorkspacePresentation({
                nodes,
                tabFiles,
                activeFileId: workspaceActiveFileId,
                entryFileId: workspaceEntryFileId,
            }),
        [nodes, tabFiles, workspaceActiveFileId, workspaceEntryFileId],
    );
    const visibleWorkspaceNodes = learnerWorkspace.nodes;
    const visibleTabFiles = learnerWorkspace.tabFiles;
    const activeFileId = learnerWorkspace.activeFileId ?? "";
    const entryFileId = learnerWorkspace.entryFileId ?? "";
    const activeFile = learnerWorkspace.activeFile ?? null;
    const entryFile = learnerWorkspace.entryFile ?? undefined;
    const learnerVisibleFileCount = learnerWorkspace.nodes.reduce(
        (count, node) => count + (node.kind === "file" ? 1 : 0),
        0,
    );
    const explorerAvailable = resolveExerciseExplorerAvailability({
        explorerEnabled: services.explorer.enabled,
        exerciseStateKey,
        learnerVisibleFileCount,
        canCreateFiles: state.policy.canCreateFiles,
        maxFiles: state.policy.maxFiles,
    });
    const [explorerCollapsed, setExplorerCollapsed] = useState(false);
    const [cloudConflictDialogOpen, setCloudConflictDialogOpen] = useState(false);
    const [editorSplit, setEditorSplit] = useState<{
        fileId: string;
        placement: EditorSplitPlacement;
    } | null>(null);
    const splitFile = editorSplit
        ? visibleWorkspaceNodes.find(
              (node): node is import("@zoeskoul/learner-workspace/ide/types").FileNode =>
                  node.kind === "file" && node.id === editorSplit.fileId,
          ) ?? null
        : null;
    const [workspaceFileSelectionVersion, setWorkspaceFileSelectionVersion] =
        useState(0);
    const lastCommittedWorkspaceActiveFileIdRef = useRef(workspaceActiveFileId);

    /**
     * Signal Monaco only after the workspace reducer has committed the active file.
     * Explorer/tab click handlers must not bump this version before openFile /
     * setActiveFileId commits, otherwise CodeRunner can replace the editor using
     * the previous file while the tab/header already show the new selection.
     */
    useEffect(() => {
        if (
            lastCommittedWorkspaceActiveFileIdRef.current ===
            workspaceActiveFileId
        ) {
            return;
        }

        lastCommittedWorkspaceActiveFileIdRef.current =
            workspaceActiveFileId;
        setWorkspaceFileSelectionVersion((version) => version + 1);
    }, [workspaceActiveFileId]);

    const currentWorkspaceRef = useRef(currentWorkspace);

    useEffect(() => {
        if (editorSplit && !splitFile) {
            setEditorSplit(null);
        }
    }, [editorSplit, splitFile]);

    useEffect(() => {
        if (activeFileId && activeFileId !== workspaceActiveFileId) {
            actions.setActiveFileId(activeFileId);
        }
        if (entryFileId && entryFileId !== workspaceEntryFileId) {
            actions.setEntryFileId(entryFileId);
        }
    }, [
        activeFileId,
        actions.setActiveFileId,
        actions.setEntryFileId,
        entryFileId,
        workspaceActiveFileId,
        workspaceEntryFileId,
    ]);

    const emitImmediateWorkspaceChange = useCallback(
        (workspace: WorkspaceStateV2 | null) => {
            if (readOnly) return;
            onWorkspaceChange?.(workspace, { origin: "user" });
        },
        [onWorkspaceChange, readOnly],
    );

    const handleChangeFileCode = useCallback(
        (fileId: string, nextCode: string) => {
            if (readOnly) return;
            const current = currentWorkspaceRef.current;

            if (
                !fileId ||
                !current ||
                current.version !== 2 ||
                !Array.isArray(current.nodes)
            ) {
                return;
            }

            let changed = false;

            const nextWorkspace: WorkspaceStateV2 = {
                ...current,
                nodes: current.nodes.map((node) => {
                    if (node.kind !== "file" || node.id !== fileId || node.binary) {
                        return node;
                    }

                    if ((node.content ?? "") === nextCode) {
                        return node;
                    }

                    changed = true;

                    return {
                        ...node,
                        content: nextCode,
                        updatedAt: Date.now(),
                    };
                }),
            };

            if (!changed) {
                return;
            }

            actions.replaceWorkspace(nextWorkspace);
            emitImmediateWorkspaceChange(nextWorkspace);
        },
        [actions, emitImmediateWorkspaceChange, readOnly],
    );
    const handleChangeStdin = useCallback(
        (nextStdin: string) => {
            if (readOnly) return;
            actions.setStdin(nextStdin);

            const current = currentWorkspaceRef.current;

            if (!current || current.version !== 2) {
                return;
            }

            emitImmediateWorkspaceChange({
                ...current,
                stdin: nextStdin,
            });
        },
        [actions, emitImmediateWorkspaceChange, readOnly],
    );
    useEffect(() => {
        currentWorkspaceRef.current = currentWorkspace;
    }, [currentWorkspace]);

    const dirty = useProjectDirtyState(currentWorkspace, language);
    const lastCleanWorkspaceReplacementRevisionRef = useRef<
        string | number | null
    >(null);

    useEffect(() => {
        if (
            !readOnly ||
            typeof workspaceReplacementRevision === "undefined" ||
            !currentWorkspace
        ) {
            return;
        }

        if (
            lastCleanWorkspaceReplacementRevisionRef.current ===
            workspaceReplacementRevision
        ) {
            return;
        }

        /**
         * Review navigation applies the next authored/saved workspace while the
         * controlled editor is temporarily read-only. That replacement is
         * hydration, not a learner edit, so establish it as the dirty baseline.
         */
        lastCleanWorkspaceReplacementRevisionRef.current =
            workspaceReplacementRevision;
        dirty.markLoaded(currentWorkspace);
    }, [
        currentWorkspace,
        dirty.markLoaded,
        readOnly,
        workspaceReplacementRevision,
    ]);
    const projects = useProjectsList({
        enabled: access.canSaveCloud,
    });

    const visibleProjects = useMemo(
        () => projects.projects.filter((p) => p.language === language),
        [projects.projects, language],
    );

    const projectSession = useIdeProjectSession({
        actorKey,
        title,
        projectTitle,
        projectDescription,
        projectScope,
        initialProjectId,
        draftStorageMode,
        v6DraftTabId,
        v6InheritedDraftTabId,
        access,
        loginHref,
        billingHref,
        routerPush: router.push,
        language,
        sqlDialect,
        currentWorkspace,
        workspaceHydrated: derived.storageHydrated,
        nodes,
        activeFile,
        entryFile,
        replaceWorkspace: actions.replaceWorkspace,
        markLoaded: dirty.markLoaded,
        markSaved: dirty.markSaved,
        clearSavedBaseline: dirty.clearSavedBaseline,
        isDirty: dirty.isDirty,
        setToast: actions.setToast,
        refreshProjects: projects.refresh,
    });

    const handleCloseMobileExplorer = useCallback(() => {
        setShowMobileExplorer(false);
    }, [setShowMobileExplorer]);

    const viewport = useIdeViewport({
        height,
        activeFileId,
        showMobileExplorer: explorerAvailable && showMobileExplorer,
        forceDesktopLayout,
        rootRef,
        editorHostRef,
        onCloseMobileExplorer: handleCloseMobileExplorer,
    });
    const mobileExplorerAvailable =
        explorerAvailable && !viewport.isDesktop;

    const isSql = language === "sql";
    const canUseWorkspaceTerminal =
        services.runner.enableWorkspaceTerminal && language !== "sql" && language !== "web";

    const codeBackend: ExecutionBackend =
        isSql || !canUseWorkspaceTerminal ? "judge0" : "pty";

    const runnerRuntime: CodeRunnerRuntime =
        codeBackend === "pty"
            ? { backend: "pty", terminalView: "xterm" }
            : { backend: "judge0", terminalView: "plain" };

    const runner = useIdeRunner({
        nodes,
        activeFile,
        entryFile,
        activeFileId,
        entryFileId,
        sqlDialect,
        sqlDatasetId,
        sqlResultShape,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        canUseMultiFile: access.canUseMultiFile,
        backend: runnerRuntime.backend,
    });

    const measuredRunnerHeight = viewport.editorHeight || height;
    const runnerHeight: number | "auto" = fullHeight
        ? "auto"
        : Math.max(
              viewport.isDesktop ? 360 : 320,
              Math.min(height, measuredRunnerHeight),
          );
    const shouldShowUpgradeText =
        services.projects.showSaveControls ||
        services.projects.showCloudProjects ||
        services.explorer.showFooter;

    const upgradeText = !shouldShowUpgradeText
        ? null
        : !access.hasUser
        ? "Log in to unlock multiple files and cloud save."
        : !access.canSaveCloud
            ? "Subscribe to save projects to your account."
            : null;

    const runnerTitle = activeFile
        ? viewport.isDesktop
            ? pathOf(nodes, activeFile.id)
            : activeFile.name
        : title;

    const headerProjectTitle =
        projectSession.currentProjectName || projectTitle || title;

    const setLangUI = useCallback(
        (nextLanguage: any) => {
            if (readOnly) return;
            if (onChangeLanguage) onChangeLanguage(nextLanguage);
            else actions.switchLanguage(nextLanguage);
        },
        [onChangeLanguage, actions, readOnly],
    );

    const goBack = useCallback(() => {
        router.push("/sandbox");
    }, [router]);
    const applyTerminalSnapshotFiles = useCallback(
        async (
            files: WorkspaceSyncEntry[],
            meta: {
                dirtyUiPaths: Set<string>;
                baselinePaths?: Set<string>;
            },
        ) => {
            if (readOnly) return;
            const prior = currentWorkspaceRef.current;
            if (!prior) return;

            const nextWorkspace = mergeTerminalSnapshotIntoWorkspace({
                prior,
                snapshotFiles: files,
                dirtyUiPaths: meta.dirtyUiPaths,
                terminalBaselinePaths: meta.baselinePaths,
            });

            if (nextWorkspace === prior) {
                return;
            }

            actions.replaceWorkspace(nextWorkspace);

            /**
             * Terminal commands are learner edits.
             *
             * Without this immediate user-origin emission, FullIDE shows the new
             * terminal-created files in Explorer, but review/practice submission
             * still reads the old workspace and reports required files as missing.
             */
            emitImmediateWorkspaceChange(nextWorkspace);
        },
        [actions, emitImmediateWorkspaceChange, readOnly],
    );
    const handleOpenWorkspaceFile = useCallback(
        (id: string) => {
            actions.openFile(id);
        },
        [actions],
    );
    const handleOpenWorkspaceFileInSplit = useCallback(
        (id: string, placement: EditorSplitPlacement) => {
            const file = visibleWorkspaceNodes.find(
                (node) => node.kind === "file" && node.id === id,
            );

            if (!file) return;

            if (!viewport.isDesktop || !activeFile) {
                handleOpenWorkspaceFile(id);
                return;
            }

            setEditorSplit({ fileId: id, placement });
        },
        [activeFile, handleOpenWorkspaceFile, viewport.isDesktop, visibleWorkspaceNodes],
    );
    const handleCloseEditorSplit = useCallback(() => {
        setEditorSplit(null);
    }, []);
    const handleSelectWorkspaceTab = useCallback(
        (id: string | null) => {
            if (!id) return;
            actions.setActiveFileId(id);
        },
        [actions],
    );
    const explorerPolicy = useMemo(
        () =>
            readOnly
                ? {
                      ...state.policy,
                      canCreateFiles: false,
                      canCreateFolders: false,
                      canRenameNodes: false,
                      canDeleteNodes: false,
                      canMoveNodes: false,
                      canUploadFiles: false,
                      canUploadBinaryFiles: false,
                  }
                : state.policy,
        [readOnly, state.policy],
    );
    const noOp = useCallback(() => undefined, []);
    const useV6Explorer = fileSyncMode === "v6" && canUseWorkspaceTerminal && !readOnly;
    const v6HistoryRef = useRef<V6StructuralHistory>(new V6StructuralHistory());
    const [v6HistoryVersion, setV6HistoryVersion] = useState(0);
    const updateV6History = useCallback(() => setV6HistoryVersion(value => value + 1), []);
    void v6HistoryVersion;
    const v6ExecutorRef = useRef<WorkspaceExplorerExecutorV6 | null>(null);
    const v6HistorySessionIdRef = useRef<string | null>(null);
    const v6UiBusyRef = useRef(false);
    const [v6BusyLabel, setV6BusyLabel] = useState<string | null>(null);
    const onV6ExplorerExecutorReady = useCallback((executor: WorkspaceExplorerExecutorV6 | null, sessionId?: string | null) => {
        const next = planV6ExecutorHistoryPublication(v6HistorySessionIdRef.current, sessionId, Boolean(executor));
        if (next.resetHistory) v6HistoryRef.current.clear();
        v6HistorySessionIdRef.current = next.sessionId;
        // Temporary unpublishing during reconciliation must not erase valid Undo.
        // A new terminal session always starts with an empty history.
        v6ExecutorRef.current = next.acceptExecutor ? executor : null;
        updateV6History();
    }, [updateV6History]);
    useEffect(() => () => { v6ExecutorRef.current = null; }, []);
    const runV6ExplorerIntent = useCallback(async (intent: import("@zoeskoul/learner-workspace/runner/runtime").WorkspaceExplorerIntentV6) => {
        if (v6UiBusyRef.current) {
            actions.setToast({kind:"error", text:"A file operation is already in progress."});
            return false;
        }
        const executor = v6ExecutorRef.current;
        if (!executor) {
            actions.setToast({kind:"error", text:"Start and connect the V6 terminal before changing files or folders."});
            return false;
        }
        v6UiBusyRef.current = true;
        const boundSessionId = v6HistorySessionIdRef.current;
        setV6BusyLabel(v6FileActionLabel(intent));
        try {
            const canRecord = supportsV6StructuralHistory(intent);
            // Drain acknowledged writes before a structural mutation, using
            // the SAME authenticated snapshot as its authoritative pre-state.
            // This avoids a duplicate full workspace export on every action.
            let before: import("@zoeskoul/code-contracts").WorkspaceSyncEntry[] | null = null;
            if (canRecord) {
                const synced = await executor({kind:"sync_editor",path:""});
                if (synced.state !== "reconciliation_required" || !synced.files || !synced.committed ||
                    !v6HistoryRef.current.recordCommittedFiles(synced.committed,synced.files)) {
                    v6HistoryRef.current.clear();
                    throw new Error("Could not verify pending editor changes before the file operation.");
                }
                before = synced.files;
            }
            const result = await executor(intent); // authoritative mutation + reconciliation
            if (!boundSessionId || v6HistorySessionIdRef.current !== boundSessionId) {
                v6HistoryRef.current.clear();
                throw new Error("Terminal session changed during the file operation. Verify the workspace before retrying.");
            }
            if (before) {
                try {
                    if (v6HistorySessionIdRef.current !== boundSessionId) {
                        throw new Error("Terminal session changed while verifying the operation.");
                    }
                    // The mutation result carries the exact Runner snapshot
                    // accepted during reconciliation, not a second export
                    // racing React's pending state update.
                    v6HistoryRef.current.recordReconciled(intent,result,before);
                } catch {
                    // Mutations are not rolled back on a failed *post* snapshot.
                    // Clear history so a future Undo cannot replay uncertainty.
                    v6HistoryRef.current.clear();
                }
            } else {
                v6HistoryRef.current.clear();
            }
            updateV6History();
            actions.cancelInlineEdit();
            actions.setPendingDeleteId(null);
            if (intent.kind === "trash_directory") {
                actions.setToast({kind:"success", text: v6HistoryRef.current.canUndo
                    ? "Folder moved to recoverable trash. Use Undo to restore it."
                    : "Folder moved to recoverable trash. Open Recovery options to restore it."});
            } else if (intent.kind === "restore_directory") {
                actions.setToast({kind:"success", text:"Folder restored from the terminal session's recoverable trash."});
            } else if (intent.kind === "delete_file") {
                actions.setToast({kind:"success", text:v6HistoryRef.current.canUndo
                    ? "File deleted. Use Undo to restore it."
                    : "File deleted. Undo is unavailable because its recovery state could not be verified."});
            }
            return true;
        } catch (error) {
            actions.setToast({kind:"error", text:v6ExplorerFailureMessage(error)});
            return false;
        } finally {
            v6UiBusyRef.current = false;
            setV6BusyLabel(null);
        }
    }, [actions, updateV6History]);
    const runV6HistoryStep = useCallback(async (direction: "undo" | "redo") => {
        const executor = v6ExecutorRef.current;
        if (!executor || v6UiBusyRef.current) return;
        v6UiBusyRef.current = true;
        const boundSessionId = v6HistorySessionIdRef.current;
        setV6BusyLabel(direction === "undo" ? "Undoing file operation…" : "Redoing file operation…");
        try {
            // A pending edit must be journaled before Undo selects its target.
            // Otherwise an earlier filesystem operation could be undone while
            // the newest text draft is still in flight.
            const synced = await executor({kind:"sync_editor",path:""});
            if (synced.state !== "reconciliation_required" || !synced.files || !synced.committed ||
                !v6HistoryRef.current.recordCommittedFiles(synced.committed,synced.files)) {
                v6HistoryRef.current.clear();
                throw new Error("Could not verify editor changes before Undo/Redo.");
            }
            const snapshot = async () => {
                const result = await executor({kind:"history_snapshot",path:""});
                if (result.state !== "read_only" || !result.files) {
                    throw new Error("Could not verify the terminal workspace for Undo/Redo.");
                }
                return result.files;
            };
            if (!boundSessionId || boundSessionId !== v6HistorySessionIdRef.current) {
                throw new Error("The terminal session changed. Undo/Redo was canceled.");
            }
            if (direction === "undo") await v6HistoryRef.current.undo(executor,snapshot);
            else await v6HistoryRef.current.redo(executor,snapshot);
            if (boundSessionId !== v6HistorySessionIdRef.current) {
                v6HistoryRef.current.clear();
                throw new Error("The terminal session changed during Undo/Redo. Verify the workspace.");
            }
            actions.cancelInlineEdit();
            actions.setPendingDeleteId(null);
            actions.setToast({kind:"success",text: direction === "undo" ? "Undo completed in the terminal workspace." : "Redo completed in the terminal workspace."});
        } catch (error) {
            actions.setToast({kind:"error",text:v6ExplorerFailureMessage(error)});
        } finally {
            v6UiBusyRef.current = false;
            setV6BusyLabel(null);
            updateV6History();
        }
    },[actions,updateV6History]);
    const v6EditSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const v6EditSyncEpochRef = useRef(0);
    const v6EditSyncSessionRef = useRef<string | null>(null);
    const flushV6EditorHistory = useCallback(async (epoch:number) => {
        if (epoch !== v6EditSyncEpochRef.current) return;
        if (v6UiBusyRef.current) {
            // Defer before the next CAS begins; never automatically retry an
            // ambiguous server mutation.
            v6EditSyncTimerRef.current = setTimeout(() => {
                v6EditSyncTimerRef.current = null;
                void flushV6EditorHistory(epoch);
            }, 300);
            return;
        }
        const executor = v6ExecutorRef.current;
        const session = v6HistorySessionIdRef.current;
        if (!executor || !session || session !== v6EditSyncSessionRef.current) return;
        v6UiBusyRef.current = true;
        try {
            const result = await executor({kind:"sync_editor",path:""});
            if (session !== v6HistorySessionIdRef.current) {
                v6HistoryRef.current.clear();return;
            }
            // A learner may keep typing while a previous commit is in flight.
            // Record exactly the acknowledged bytes; the latest draft remains
            // pending for the next debounce cycle.
            if (result.state !== "reconciliation_required" || !result.files || !result.committed ||
                !v6HistoryRef.current.recordCommittedFiles(result.committed,result.files)) {
                v6HistoryRef.current.clear();
                throw new Error("Editor changes were synchronized but cannot be safely added to Undo history.");
            }
        } catch (error) {
            actions.setToast({kind:"error",text:v6ExplorerFailureMessage(error)});
        } finally {
            v6UiBusyRef.current = false;
            updateV6History();
        }
    },[actions,updateV6History]);
    const v6ChangeFileCode = useCallback((id:string,code:string) => {
        handleChangeFileCode(id,code);
        if (!useV6Explorer) return;
        v6EditSyncSessionRef.current = v6HistorySessionIdRef.current;
        const epoch = ++v6EditSyncEpochRef.current;
        if (v6EditSyncTimerRef.current !== null) clearTimeout(v6EditSyncTimerRef.current);
        v6EditSyncTimerRef.current = setTimeout(() => {
            v6EditSyncTimerRef.current = null;
            void flushV6EditorHistory(epoch);
        }, 900);
    },[handleChangeFileCode,useV6Explorer,flushV6EditorHistory]);
    useEffect(() => () => {
        if (v6EditSyncTimerRef.current !== null) clearTimeout(v6EditSyncTimerRef.current);
        v6EditSyncEpochRef.current++;
    }, []);
    const listV6Trash = useCallback(async () => {
        const executor = v6ExecutorRef.current;
        if (!executor) throw new Error("The V6 terminal session must be connected to list recoverable folders.");
        const result = await executor({kind:"list_trash",path:""});
        if (result.state !== "read_only" || !result.entries) {
            throw new Error("Invalid recoverable-folder response.");
        }
        return result.entries;
    }, []);
    const restoreV6Trash = useCallback(async (entry: Readonly<{originalPath:string;trashId:string}>) => {
        return runV6ExplorerIntent({kind:"restore_directory",path:entry.originalPath,trashId:entry.trashId});
    }, [runV6ExplorerIntent]);
    const downloadV6Selection = useCallback(async (selection: V6DownloadSelection) => {
        const executor = v6ExecutorRef.current;
        if (!executor || v6UiBusyRef.current) {
            actions.setToast({kind:"error",text:"Connect the V6 terminal and finish pending file operations before downloading."});
            return;
        }
        v6UiBusyRef.current = true;
        setV6BusyLabel("Preparing download…");
        try {
            const result = await executor({kind:"export_snapshot",path:""});
            if (result.state !== "read_only" || !result.files) {
                throw new Error("The terminal did not return a verified workspace snapshot.");
            }
            const prepared = prepareV6SessionDownload(result.files,
                selection.kind === "project" ? {...selection,projectName:headerProjectTitle} : selection);
            saveV6BrowserDownload(prepared);
        } catch (error) {
            actions.setToast({kind:"error",text:v6ExplorerFailureMessage(error)});
        } finally {
            v6UiBusyRef.current = false;
            setV6BusyLabel(null);
        }
    },[actions,headerProjectTitle]);
    const v6CommitInlineEdit = useCallback(() => {
        if (!useV6Explorer || !inlineEdit) {
            actions.commitInlineEdit();
            return;
        }
        try {
            const intent = planV6InlineIntent(nodes, inlineEdit);
            if (intent) void runV6ExplorerIntent(intent);
            else actions.cancelInlineEdit();
        } catch (error) {
            actions.setToast({kind:"error",text:error instanceof Error ? error.message : "Invalid file action."});
        }
    }, [actions, inlineEdit, nodes, runV6ExplorerIntent, useV6Explorer, updateV6History]);
    const v6MoveNode = useCallback((id:string, parentId:string|null) => {
        if (!useV6Explorer) { actions.moveNode(id,parentId); return; }
        try {
            const intent=planV6MoveIntent(nodes,id,parentId);
            if (intent) void runV6ExplorerIntent(intent);
        } catch (error) {
            actions.setToast({kind:"error",text:error instanceof Error ? error.message : "Invalid folder move."});
        }
    },[actions,nodes,runV6ExplorerIntent,useV6Explorer]);
    const v6ImportFiles = useCallback(async (files: import("@zoeskoul/learner-workspace/ide/workspaceHook/workspace.policy").ImportedWorkspaceFile[])=> {
        if (!useV6Explorer) { actions.importExternalFiles(files); return; }
        const executor = v6ExecutorRef.current;
        if (!executor || v6UiBusyRef.current) {
            actions.setToast({kind:"error",text:"Connect the terminal and finish the active file operation before importing."});
            return;
        }
        v6UiBusyRef.current = true;
        const boundSessionId = v6HistorySessionIdRef.current;
        setV6BusyLabel("Importing files into terminal workspace…");
        let completed=0;
        try {
            // Never upload against unsynchronized local edits. Journal only
            // acknowledged changes before modifying the Runner filesystem.
            const synced = await executor({kind:"sync_editor",path:""});
            if (synced.state !== "reconciliation_required" || !synced.files || !synced.committed ||
                !v6HistoryRef.current.recordCommittedFiles(synced.committed,synced.files)) {
                throw new Error("Editor synchronization must be verified before importing.");
            }
            const plan = planV6Import(files,synced.files,{
                maxFiles:explorerPolicy.maxImportFiles,
                maxDepth:explorerPolicy.maxDepth,
                maxTextBytes:explorerPolicy.maxFileContentBytes,
                maxBinaryBytes:explorerPolicy.maxUploadFileBytes,
            });
            // Each mutation returns an acknowledged server snapshot. Wait for
            // React to reflect it before another CAS operation; otherwise the
            // next clean() guard can reject the previous successful mutation.
            const awaitImportHandoff = async (result: Awaited<ReturnType<WorkspaceExplorerExecutorV6>>) => {
                if (!result.files) throw new Error("Runner did not acknowledge an import snapshot.");
                await waitForV6ImportView({
                    verified: result.files,
                    readView: () => exportWorkspaceEntries(currentWorkspaceRef.current?.nodes ?? []),
                    sameSession: () => v6HistorySessionIdRef.current === boundSessionId,
                });
            };
            for (const dir of plan.directories) {
                if (v6HistorySessionIdRef.current !== boundSessionId) throw new Error("Terminal session changed during import.");
                try {
                    await awaitImportHandoff(await executor({kind:"mkdir",path:dir}));
                } catch (error) {
                    throw new Error(`Folder ${dir}: ${v6ExplorerFailureMessage(error)}`);
                }
            }
            for (const entry of plan.entries) {
                if (v6HistorySessionIdRef.current !== boundSessionId) throw new Error("Terminal session changed during import.");
                try {
                    await awaitImportHandoff(await executor({kind:"import_file",path:entry.path,entry}));
                } catch (error) {
                    throw new Error(`File ${entry.path}: ${v6ExplorerFailureMessage(error)}`);
                }
                completed++;
                setV6BusyLabel(`Importing files… ${completed}/${plan.entries.length}`);
            }
            // Import is not an editor-typed change. Do not reuse pre-import
            // Undo entries against a workspace with newly created paths.
            v6HistoryRef.current.clear();
            actions.setToast({kind:"success",text:`Imported ${completed} file${completed === 1 ? "" : "s"} into the terminal workspace.`});
        } catch (error) {
            v6HistoryRef.current.clear();
            actions.setToast({kind:"error",text:`Import stopped after ${completed} file${completed === 1 ? "" : "s"}. Existing files were not overwritten. ${v6ExplorerFailureMessage(error)}`});
        } finally {
            v6UiBusyRef.current = false;
            setV6BusyLabel(null);
            updateV6History();
        }
    },[actions,useV6Explorer,explorerPolicy.maxImportFiles,explorerPolicy.maxDepth,
        explorerPolicy.maxFileContentBytes,explorerPolicy.maxUploadFileBytes,updateV6History]);
    const explorerPane = (
        <IdeExplorerPane
            isSql={isSql}
            sqlDialect={sqlDialect}
            entryPath={entryFile ? pathOf(nodes, entryFile.id) : "—"}
            upgradeText={upgradeText}
            filter={filter}
            nodes={visibleWorkspaceNodes}
            expanded={expanded}
            activeFileId={activeFileId}
            entryFileId={entryFileId}
            language={language}
            inlineEdit={inlineEdit}
            stdin={stdin}
            access={access}
            policy={explorerPolicy}
            onUpgrade={() => router.push(access.hasUser ? billingHref : loginHref)}
            onChangeFilter={actions.setFilter}
            onChangeStdin={handleChangeStdin}
            canUndo={!readOnly && (useV6Explorer ? v6HistoryRef.current.canUndo : history.canUndo)}
            canRedo={!readOnly && (useV6Explorer ? v6HistoryRef.current.canRedo : history.canRedo)}
            onUndo={readOnly ? noOp : useV6Explorer ? () => void runV6HistoryStep("undo") : actions.undo}
            onRedo={readOnly ? noOp : useV6Explorer ? () => void runV6HistoryStep("redo") : actions.redo}
            onToggleExplorer={
                viewport.isDesktop
                    ? () => setExplorerCollapsed(true)
                    : services.explorer.allowMobileDrawer
                        ? handleCloseMobileExplorer
                        : undefined
            }
            services={services}
            onV6ListTrash={useV6Explorer ? listV6Trash : undefined}
            onV6RestoreTrash={useV6Explorer ? restoreV6Trash : undefined}
            onV6Download={useV6Explorer ? downloadV6Selection : undefined}
            actions={{
                setInlineEdit: readOnly ? noOp : actions.setInlineEdit,
                setToast: actions.setToast,
                openFile: handleOpenWorkspaceFile,
                openFileInSplit: handleOpenWorkspaceFileInSplit,
                toggleFolder: actions.toggleFolder,
                startNewFile: readOnly ? noOp : actions.startNewFile,
                startNewFolder: readOnly ? noOp : actions.startNewFolder,
                startRename: readOnly ? noOp : actions.startRename,
                setEntry: readOnly ? noOp : actions.setEntry,
                moveNode: readOnly ? noOp : v6MoveNode,
                importExternalFiles: readOnly ? noOp : v6ImportFiles,
                requestDelete: readOnly ? noOp : actions.requestDelete,
                commitInlineEdit: readOnly ? noOp : v6CommitInlineEdit,
                cancelInlineEdit: actions.cancelInlineEdit,
            }}
        />
    );
    const terminalHistoryScopeKey = useMemo(() => {
        const stableProjectId = initialProjectId ?? projectSession.projectId ?? null;

        if (stableProjectId) {
            return `project:${stableProjectId}`;
        }

        return [
            "local",
            actorKey,
            projectScope?.scopeKey ?? projectScope?.kind ?? "global",
            language,
        ].join("::");
    }, [
        initialProjectId,
        projectSession.projectId,
        actorKey,
        projectScope,
        language,
    ]);
    const editorPane = (
        <IdeEditorPane
            panelRef={editorHostRef}
            nodes={nodes}
            tabFiles={visibleTabFiles}
            activeFileId={activeFileId}
            activeFile={activeFile}
            splitFile={splitFile}
            splitPlacement={editorSplit?.placement ?? null}
            onOpenFileInSplit={handleOpenWorkspaceFileInSplit}
            onCloseSplit={handleCloseEditorSplit}
            runnerHeight={runnerHeight}
            title={runnerTitle}
            isSql={isSql}
            language={language}
            sqlDialect={sqlDialect}
            runtime={runnerRuntime}
            services={services}
            onChangeLanguage={setLangUI}
            isAuthenticated={access.hasUser}
            onChangeFileCode={v6ChangeFileCode}
            onChangeSqlDialect={setSqlDialect}
            onBeforeRun={onBeforeRun}
            onRunResult={onRunResult}
            remoteWebPreview={remoteWebPreview}
            remoteWebPreviewSurface={remoteWebPreviewSurface}
            webPreviewCommerceRequest={webPreviewCommerceRequest}
            webPreviewSessionKey={webPreviewSessionKey}
            onRun={runner.onRunProject}
            setActiveFileId={handleSelectWorkspaceTab}
            workspaceFileSelectionVersion={workspaceFileSelectionVersion}
            closeTab={actions.closeTab}
            isDesktop={viewport.isDesktop}
            projectId={projectSession.projectId}
            exerciseStateKey={exerciseStateKey}
            workspace={currentWorkspace}
            workspaceReplacementRevision={workspaceReplacementRevision}
            onWorkspaceReplacementApplied={onWorkspaceReplacementApplied}
            draftStorageMode={draftStorageMode}
            readOnly={readOnly}
            terminalHistoryScopeKey={terminalHistoryScopeKey}
            onApplyTerminalSnapshotFiles={applyTerminalSnapshotFiles}
            onTerminalSyncReady={onTerminalSyncReady}
            fileSyncMode={useV6Explorer ? "v6" : "v5"}
            onV6ExplorerExecutorReady={useV6Explorer ? onV6ExplorerExecutorReady : undefined}
            onTerminalEvidenceChange={onTerminalEvidenceChange}
            sqlDatasetId={sqlDatasetId}
            sqlResultShape={sqlResultShape}
            sqlPaneOptions={sqlPaneOptions}
            runnerPaneOptions={runnerPaneOptions}
            defaultSurface={defaultSurface}
            sqlSchemaSql={sqlSchemaSql}
            sqlSeedSql={sqlSeedSql}
            sqlSetupSql={sqlSetupSql}
            sqlInitialTableSnapshots={sqlInitialTableSnapshots}
        />
    );

    const handleConfirmDelete = () => {
        if (readOnly || !pendingDeleteId) return;
        if (!useV6Explorer) { actions.performDelete(); return; }
        try {
            const intent = planV6DeleteIntent(nodes, pendingDeleteId);
            void runV6ExplorerIntent(intent);
        } catch (error) {
            actions.setToast({kind:"error",text:error instanceof Error ? error.message : "Invalid delete."});
        }
    };

    useEffect(() => {
        if (!projectSession.conflictInfo) setCloudConflictDialogOpen(false);
    }, [projectSession.conflictInfo]);

    const handlePrimarySave = () => {
        if (readOnly || (useV6Explorer && v6UiBusyRef.current)) return;
        if (cloudSaveIntent(Boolean(projectSession.conflictInfo)) === "resolve") {
            setCloudConflictDialogOpen(true);
            return;
        }
        if (!access.canSaveCloud) {
            router.push(access.hasUser ? billingHref : loginHref);
            return;
        }
        void projectSession.saveProject();
    };

    const handleSaveAsIntent = () => {
        if (readOnly) return;
        if (!access.canSaveCloud) {
            router.push(access.hasUser ? billingHref : loginHref);
            return;
        }
        projectSession.setSaveAsOpen(true);
    };

    const showProjectsUi =
        services.projects.showProjectSwitcher || services.projects.showCloudProjects;

    return (
        <>
            <IdeToastHost toast={toast} />
            {useV6Explorer && v6BusyLabel ? (
                <div role="status" aria-live="polite" aria-atomic="true"
                     className="fixed inset-0 flex items-center justify-center bg-black/25 p-4"
                     style={{zIndex: 2147483000}}>
                    <div className="flex min-w-[230px] max-w-sm items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 text-sm font-semibold text-neutral-900 shadow-2xl dark:border-white/15 dark:bg-neutral-900 dark:text-white">
                        <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-emerald-600" aria-hidden="true" />
                        <span>{v6BusyLabel}</span>
                    </div>
                </div>
            ) : null}

            <IdeStatusBanners
                loadingProject={projectSession.loadingProject}
                saveError={projectSession.conflictInfo ? null : projectSession.saveError}
            />

            {projectSession.conflictInfo ? (
                <IdeConflictBanner
                    projectTitle={projectSession.conflictInfo.title || headerProjectTitle}
                    serverVersion={projectSession.conflictInfo.serverVersion}
                    clientBaseVersion={projectSession.conflictInfo.clientBaseVersion}
                />
            ) : null}

            <IdeCloudConflictDialog
                open={cloudConflictDialogOpen}
                conflict={projectSession.conflictInfo}
                busy={projectSession.isSavingProject || projectSession.loadingProject}
                onKeepEditing={() => setCloudConflictDialogOpen(false)}
                onSaveCopy={() => {
                    setCloudConflictDialogOpen(false);
                    handleSaveAsIntent();
                }}
                onReloadCloud={projectSession.reloadProjectFromCloud}
            />

            {services.chrome.showHeader ? (
                <IdeHeader
                    isDesktop={viewport.isDesktop}
                    showTopLanguageButtons={services.chrome.showTopLanguageButtons}
                    showBackButton={services.chrome.showBackButton}
                    showMobileFilesButton={mobileExplorerAvailable}
                    showProjectSwitcher={services.projects.showProjectSwitcher}
                    showNewWorkspace={!readOnly && showProjectsUi}
                    onNewWorkspace={() => projectSession.setProjectsOpen(true)}
                    showActivePath={services.chrome.showActivePath}
                    showStatus={services.chrome.showStatus}
                    showSaveControls={services.projects.showSaveControls}
                    showSaveAs={!readOnly && services.projects.showSaveAs}
                    showLessonLink={services.chrome.showLessonLink}
                    showSettingsMenu={Boolean(showSettingsMenu)}
                    language={language}
                    sqlDialect={sqlDialect}
                    onChangeSqlDialect={setSqlDialect}
                    onChangeLanguage={setLangUI}
                    onBack={goBack}
                    onOpenFiles={() => setShowMobileExplorer(true)}
                    onOpenProjects={() => {
                        if (!showProjectsUi) return;
                        projectSession.setProjectsOpen(true);
                    }}
                    activePath={activeFile ? pathOf(nodes, activeFile.id) : "No file selected"}
                    projectTitle={headerProjectTitle}
                    dirty={dirty.isDirty}
                    conflict={!!projectSession.conflictInfo}
                    lastSavedAt={projectSession.lastSavedAt}
                    lessonHref={lessonHref}
                    lessonLabel={lessonLabel}
                    saveDisabled={
                        readOnly ||
                        projectSession.isSavingProject ||
                        projectSession.loadingProject ||
                        !currentWorkspace
                    }
                    saveBusy={projectSession.isSavingProject}
                    saveAsDisabled={
                        readOnly || projectSession.isSavingProject || projectSession.loadingProject || !currentWorkspace
                    }
                    canSaveCloud={access.canSaveCloud}
                    hasUser={access.hasUser}
                    onSave={handlePrimarySave}
                    onSaveAs={handleSaveAsIntent}
                />
            ) : null}

            <div className="min-h-0 flex-1">
                {viewport.isDesktop ? (
                    <IdeDesktopLayout
                        splitRef={splitRef}
                        leftPct={leftPct}
                        dividerValue={leftPct}
                        onMouseDownDivider={(e) => actions.onMouseDownDivider(e, splitRef.current)}
                        onPointerDownDivider={(e) => actions.onPointerDownDivider(e, splitRef.current)}
                        onKeyDownDivider={(e) => actions.onKeyDownDivider(e, splitRef.current)}
                        explorerCollapsed={!explorerAvailable || explorerCollapsed}
                        onToggleExplorer={() => {
                            if (!explorerAvailable) return;
                            setExplorerCollapsed((value) => !value);
                        }}
                        showHistoryControls={
                            services.explorer.enabled &&
                            services.explorer.showHistoryControls
                        }
                        canUndo={services.explorer.enabled && (useV6Explorer ? v6HistoryRef.current.canUndo : history.canUndo)}
                        canRedo={services.explorer.enabled && (useV6Explorer ? v6HistoryRef.current.canRedo : history.canRedo)}
                        onUndo={useV6Explorer ? () => void runV6HistoryStep("undo") : actions.undo}
                        onRedo={useV6Explorer ? () => void runV6HistoryStep("redo") : actions.redo}
                        explorer={explorerAvailable ? explorerPane : null}
                        editor={editorPane}
                    />
                ) : (
                    <IdeMobileLayout
                        open={
                            explorerAvailable &&
                            mobileExplorerAvailable &&
                            showMobileExplorer
                        }
                        onOpen={() => {
                            if (!explorerAvailable) return;
                            setShowMobileExplorer(true);
                        }}
                        onClose={handleCloseMobileExplorer}
                        showExplorerRail={
                            explorerAvailable &&
                            mobileExplorerAvailable &&
                            !showMobileExplorer
                        }
                        explorer={explorerAvailable ? explorerPane : null}
                        editor={editorPane}
                    />
                )}
            </div>

            <IdeProjectModals
                showDeleteModal={!readOnly && services.explorer.showActions}
                showProjects={showProjectsUi}
                showSaveAs={services.projects.showSaveAs}
                saveAsCopyMode={Boolean(projectSession.conflictInfo)}
                showRename={!readOnly && services.projects.showCloudProjects}
                nodes={nodes}
                pendingDeleteId={pendingDeleteId}
                onCancelDelete={() => actions.setPendingDeleteId(null)}
                onConfirmDelete={handleConfirmDelete}
                projectsOpen={projectSession.projectsOpen}
                onProjectsOpenChange={projectSession.setProjectsOpen}
                projectId={projectSession.projectId}
                headerProjectTitle={headerProjectTitle}
                language={language}
                canCreateProjects={access.canCreateProjects}
                loadingProjects={projects.loading}
                projectsError={projects.error}
                projects={visibleProjects}
                onRefreshProjects={projects.refresh}
                onSelectProject={projectSession.requestOpenProject}
                onCreateBlankProject={projectSession.startBlankProject}
                onSaveAsIntent={handleSaveAsIntent}
                onRenameIntent={(project: any) => {
                    projectSession.setRenamingProject(project);
                    projectSession.setRenameOpen(true);
                }}
                onArchiveProject={projectSession.archiveProject}
                confirmSwitchOpen={projectSession.confirmSwitchOpen}
                isSavingProject={projectSession.isSavingProject}
                onSaveAndContinue={() => void projectSession.handleSaveAndContinue()}
                onDiscardAndContinue={projectSession.handleDiscardAndContinue}
                onCancelSwitch={projectSession.cancelPendingSwitch}
                saveAsOpen={projectSession.saveAsOpen}
                saveAsInitialValue={`${headerProjectTitle} Copy`}
                onSaveAsConfirm={(value: string) => void projectSession.saveAsProject(value)}
                onSaveAsCancel={() => projectSession.setSaveAsOpen(false)}
                renameOpen={projectSession.renameOpen}
                projectModalBusy={projectSession.projectModalBusy}
                renameInitialValue={projectSession.renamingProject?.title ?? ""}
                onRenameConfirm={(value: string) => void projectSession.renameProject(value)}
                onRenameCancel={() => {
                    projectSession.setRenameOpen(false);
                    projectSession.setRenamingProject(null);
                }}
            />
        </>
    );
}




function workspaceNotifyKey(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return "null";
    }

    return JSON.stringify({
        version: 2,
        language: workspace.language,
        activeFileId: workspace.activeFileId,
        entryFileId: workspace.entryFileId,
        openTabs: workspace.openTabs ?? [],
        stdin: workspace.stdin ?? "",
        expanded: workspace.expanded ?? [],
        leftPct: workspace.leftPct ?? 26,
        nodes: workspace.nodes.map((node: any) => {
            if (node?.kind === "file") {
                return {
                    id: node.id,
                    kind: node.kind,
                    name: node.name,
                    parentId: node.parentId ?? null,
                    content: node.binary ? "" : node.content ?? "",
                    binary: node.binary
                        ? {
                            encoding: node.binary.encoding,
                            data: node.binary.data,
                            mimeType: node.binary.mimeType,
                            sizeBytes: node.binary.sizeBytes,
                            checksum: node.binary.checksum ?? null,
                          }
                        : null,
                };
            }

            return {
                id: node?.id,
                kind: node?.kind,
                name: node?.name,
                parentId: node?.parentId ?? null,
            };
        }),
    });
}
export default function FullIDE(props: FullIDEProps) {
    const {
        title = "IDE",
        height = 720,
        className,
        fullHeight = false,
        storageKey = `${getLearnerWorkspaceStaticConfig().appName}.ide.workspace.v2`,
        language: forcedLanguage,
        onChangeLanguage,
        resetOnForcedLanguageChange = false,
        showTopLanguageButtons = true,
        lessonHref,
        lessonLabel = "Lesson",
        showSettingsMenu = false,
        access,
        loginHref,
        billingHref = "/billing",
        initialProjectId = null,
        projectTitle,
        projectDescription = null,
        projectScope,
        draftStorageMode = "local",
        readOnly = false,
        fileSyncMode = "v5",
        onReadyChange,
        servicePreset,
        services: serviceOverrides,
        initialWorkspace,
        externalWorkspace,
        externalWorkspaceRevision,
        onWorkspaceChange,
        onTerminalEvidenceChange,
        onTerminalSyncReady,
        onBeforeRun,
        onRunResult,
        remoteWebPreview,
        remoteWebPreviewSurface,
        webPreviewCommerceRequest,
        webPreviewSessionKey,
        initialSqlDialect = DEFAULT_SQL_DIALECT,
        forceDesktopLayout = false,
        sqlDatasetId,
        sqlResultShape,
        sqlPaneOptions,
        runnerPaneOptions,
        defaultSurface,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
    } = props;

    const router = useFullIDERouter();
    const authenticatedUserId = useFullIDEAuthenticatedUserId();

    const splitRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const editorHostRef = useRef<HTMLDivElement | null>(null);

    const [showMobileExplorer, setShowMobileExplorer] = useState(false);
    const [sqlDialect, setSqlDialect] = useState(initialSqlDialect);
    const [guestActorKey, setGuestActorKey] = useState<string>("guest:pending");

    useEffect(() => {
        setSqlDialect(initialSqlDialect);
    }, [initialSqlDialect]);

    useEffect(() => {
        if (access.hasUser) return;
        setGuestActorKey(getOrCreateGuestActorKey(draftStorageMode));
    }, [access.hasUser, draftStorageMode]);

    const actorKey = useMemo(() => {
        if (access.hasUser) {
            return authenticatedUserId ? `user:${authenticatedUserId}` : "user:pending";
        }
        return guestActorKey;
    }, [access.hasUser, authenticatedUserId, guestActorKey]);

    const actorReady = access.hasUser
        ? !!authenticatedUserId
        : guestActorKey !== "guest:pending";

    const scopeKey = useMemo(() => buildScopeKey(projectScope), [projectScope]);

    const normalizedLoginHref = useMemo(
        () => hrefToString(loginHref, "/authenticate"),
        [loginHref],
    );

    const v6DraftNamespace = `${storageKey}:${scopeKey ?? "global"}`;
    const [v6DraftLease, setV6DraftLease] = useState<(LeaseIdentity & {namespace: string}) | null>(null);
    const reservedV6DraftLease = v6DraftLease?.namespace === v6DraftNamespace
        ? v6DraftLease : null;
    useEffect(() => {
        if (fileSyncMode !== "v6" || draftStorageMode !== "local") {
            setV6DraftLease(null);
            return;
        }
        let cancelled = false;
        const lease = startV6TabDraftLease({ namespace: v6DraftNamespace });
        void lease.ready.then((identity) => {
            if (!cancelled) setV6DraftLease({...identity, namespace: v6DraftNamespace});
        });
        return () => { cancelled = true; lease.close(); };
    }, [fileSyncMode, draftStorageMode, v6DraftNamespace]);

    const localWorkspaceId = useMemo(
        () =>
            buildLocalWorkspaceIdSeed({
                projectScope,
                forcedLanguage,
            }),
        [projectScope, forcedLanguage],
    );

    const previousSharedStorageKey = useMemo(
        () => `${storageKey}:${scopeKey ?? "global"}`,
        [storageKey, scopeKey],
    );
    const scopedStorageKey = useMemo(() =>
        fileSyncMode === "v6" && reservedV6DraftLease
            ? `${previousSharedStorageKey}:v6tab:${reservedV6DraftLease.id}`
            : previousSharedStorageKey,
        [fileSyncMode, reservedV6DraftLease, previousSharedStorageKey],
    );
    const legacyDraftBaseStorageKeys = useMemo(() =>
        fileSyncMode === "v6" && reservedV6DraftLease
            ? [
                ...(reservedV6DraftLease.inheritedFromId
                    ? [`${previousSharedStorageKey}:v6tab:${reservedV6DraftLease.inheritedFromId}`]
                    : []),
                previousSharedStorageKey,
              ]
            : [],
        [fileSyncMode, reservedV6DraftLease, previousSharedStorageKey],
    );

    const requestedDraftStorageMode = (draftStorageMode ?? "local") as "off" | "local";
    const waitingForV6DraftLease = fileSyncMode === "v6" &&
        requestedDraftStorageMode === "local" && !reservedV6DraftLease;
    const effectiveDraftStorageMode = actorReady && !waitingForV6DraftLease
        ? requestedDraftStorageMode : "off";

    const services = useMemo(
        () =>
            resolveFullIDEServices({
                preset: servicePreset ?? "runner",
                showTopLanguageButtons,
                overrides: serviceOverrides,
            }),
        [serviceOverrides, servicePreset, showTopLanguageButtons],
    );

    const pendingUserWorkspaceMutationRef =
        useRef<PendingUserWorkspaceMutation | null>(null);
    const pendingUserWorkspaceMutationTokenRef = useRef(0);
    const pendingUserWorkspaceMutationTimerRef = useRef<number | null>(null);

    const clearPendingUserWorkspaceMutation = useCallback(() => {
        pendingUserWorkspaceMutationRef.current = null;

        if (pendingUserWorkspaceMutationTimerRef.current != null) {
            window.clearTimeout(pendingUserWorkspaceMutationTimerRef.current);
            pendingUserWorkspaceMutationTimerRef.current = null;
        }
    }, []);

    const markNextWorkspaceChangeAsUser = useCallback(
        (workspaceBeforeMutation: WorkspaceStateV2 | null) => {
            const token = ++pendingUserWorkspaceMutationTokenRef.current;

            pendingUserWorkspaceMutationRef.current = {
                beforeKey: workspaceNotifyKey(workspaceBeforeMutation),
                token,
            };

            if (pendingUserWorkspaceMutationTimerRef.current != null) {
                window.clearTimeout(pendingUserWorkspaceMutationTimerRef.current);
            }

            pendingUserWorkspaceMutationTimerRef.current = window.setTimeout(() => {
                if (pendingUserWorkspaceMutationRef.current?.token === token) {
                    pendingUserWorkspaceMutationRef.current = null;
                }
                pendingUserWorkspaceMutationTimerRef.current = null;
            }, 2_000);
        },
        [],
    );

    useEffect(() => clearPendingUserWorkspaceMutation, [clearPendingUserWorkspaceMutation]);

    const workspace = useIdeWorkspace({
        storageKey: scopedStorageKey,
        legacyDraftBaseStorageKeys,
        forcedLanguage,
        resetOnForcedLanguageChange,
        access,
        initialWorkspace,
        actorKey,
        projectId: effectiveDraftStorageMode === "local" ? null : initialProjectId,
        scopeKey,
        exerciseStateKey: props.exerciseStateKey,
        draftStorageMode: effectiveDraftStorageMode,
        localWorkspaceId,
        fileActions: services.explorer.fileActions,
        disableHistoryRewind: fileSyncMode === "v6",
        onUserWorkspaceMutation: markNextWorkspaceChangeAsUser,
    });

    /**
     * Controlled hydration owns semantic workspace content, not local IDE presentation.
     *
     * File selection, tabs, expanded folders, and splitter width are local presentation
     * state. Using the full notify key here lets a stale parent snapshot immediately
     * overwrite a learner's Explorer/tab selection, which makes a newly selected file
     * appear to require a second click. Explicit replacement revisions remain fully
     * authoritative below.
     */
    const externalWorkspaceControlKey = useMemo(
        () => workspaceControlledContentKey(externalWorkspace),
        [externalWorkspace],
    );
    const hasExternalWorkspaceProp = typeof externalWorkspace !== "undefined";
    const initialWorkspaceControlKey = useMemo(
        () => workspaceControlledContentKey(initialWorkspace),
        [initialWorkspace],
    );
    const externalWorkspaceApplyKey = useMemo(
        () =>
            resolveExternalWorkspaceApplyKey({
                externalWorkspaceKey: externalWorkspaceControlKey,
                initialWorkspaceKey: initialWorkspaceControlKey,
                revision: externalWorkspaceRevision,
            }),
        [
            externalWorkspaceControlKey,
            externalWorkspaceRevision,
            initialWorkspaceControlKey,
        ],
    );
    const lastAppliedExternalWorkspaceJsonRef = useRef<string | null>(null);
    const suppressWorkspaceEchoKeyRef = useRef<string | null>(null);

    /**
     * Programmatic parent-controlled hydration can normalize/remap the workspace
     * before FullIDE emits it back through onWorkspaceChange. For SQL workspaces,
     * the emitted key may differ from the incoming key even though it is still the
     * same hydration pass. Suppress the first emission after replace/reset by
     * intent, not only by exact key, to avoid parent <-> FullIDE echo loops.
     */
    const suppressNextWorkspaceEchoRef = useRef(false);

    const lastNotifiedWorkspaceKeyRef = useRef<string | null>(null);

    const emitWorkspaceChange = useCallback<
        NonNullable<FullIDEProps["onWorkspaceChange"]>
    >(
        (nextWorkspace, meta) => {
            lastNotifiedWorkspaceKeyRef.current = workspaceNotifyKey(nextWorkspace);

            if (meta?.origin === "user") {
                clearPendingUserWorkspaceMutation();
            }

            onWorkspaceChange?.(nextWorkspace, meta);
        },
        [clearPendingUserWorkspaceMutation, onWorkspaceChange],
    );

    const replaceWorkspaceActionRef = useRef(workspace.actions.replaceWorkspace);
    const resetWorkspaceForLanguageActionRef = useRef(workspace.actions.resetWorkspaceForLanguage);
    const workspaceLanguageRef = useRef(workspace.state.language);

    useLayoutEffect(() => {
        replaceWorkspaceActionRef.current = workspace.actions.replaceWorkspace;
        resetWorkspaceForLanguageActionRef.current = workspace.actions.resetWorkspaceForLanguage;
        workspaceLanguageRef.current = workspace.state.language;
    }, [
        workspace.actions.replaceWorkspace,
        workspace.actions.resetWorkspaceForLanguage,
        workspace.state.language,
    ]);

    const currentWorkspaceJson = useMemo(
        () => JSON.stringify(workspace.derived.currentWorkspace ?? null),
        [workspace.derived.currentWorkspace],
    );
    const currentWorkspaceNotifyKey = useMemo(
        () => workspaceNotifyKey(workspace.derived.currentWorkspace),
        [workspace.derived.currentWorkspace],
    );
    const currentWorkspaceControlKey = useMemo(
        () => workspaceControlledContentKey(workspace.derived.currentWorkspace),
        [workspace.derived.currentWorkspace],
    );
    const externalWorkspaceRef = useRef(externalWorkspace);
    const initialWorkspaceRef = useRef(initialWorkspace);
    const currentWorkspaceJsonRef = useRef(currentWorkspaceJson);
    const currentWorkspaceNotifyKeyRef = useRef(currentWorkspaceNotifyKey);
    const currentWorkspaceControlKeyRef = useRef(currentWorkspaceControlKey);

    useLayoutEffect(() => {
        externalWorkspaceRef.current = externalWorkspace;
        initialWorkspaceRef.current = initialWorkspace;
    }, [externalWorkspace, initialWorkspace]);

    useEffect(() => {
        currentWorkspaceJsonRef.current = currentWorkspaceJson;
        currentWorkspaceNotifyKeyRef.current = currentWorkspaceNotifyKey;
        currentWorkspaceControlKeyRef.current = currentWorkspaceControlKey;
    }, [
        currentWorkspaceControlKey,
        currentWorkspaceJson,
        currentWorkspaceNotifyKey,
    ]);

    useLayoutEffect(() => {
        if (!hasExternalWorkspaceProp) return;

        const applyKey = externalWorkspaceApplyKey;
        if (lastAppliedExternalWorkspaceJsonRef.current === applyKey) return;

        const nextWorkspace =
            externalWorkspaceRef.current ?? initialWorkspaceRef.current ?? null;

        const nextNotifyKey = workspaceNotifyKey(nextWorkspace);
        const nextControlKey = workspaceControlledContentKey(nextWorkspace);

        lastAppliedExternalWorkspaceJsonRef.current = applyKey;
        clearPendingUserWorkspaceMutation();

        if (nextWorkspace) {
            if (
                typeof externalWorkspaceRevision !== "undefined" ||
                nextControlKey !== currentWorkspaceControlKeyRef.current
            ) {
                /**
                 * This hydration is parent-controlled/programmatic.
                 * The next internal workspace emission should not be sent back upward,
                 * otherwise FullIDE and CodeToolPane can echo the same SQL workspace
                 * until React hits maximum update depth.
                 */
                suppressWorkspaceEchoKeyRef.current = nextNotifyKey;
                suppressNextWorkspaceEchoRef.current = true;
                replaceWorkspaceActionRef.current(nextWorkspace);
            }
        } else {
            suppressWorkspaceEchoKeyRef.current = null;
            suppressNextWorkspaceEchoRef.current = true;

            resetWorkspaceForLanguageActionRef.current(
                forcedLanguage ?? workspaceLanguageRef.current,
            );
        }
    }, [
        hasExternalWorkspaceProp,
        externalWorkspaceApplyKey,
        externalWorkspaceRevision,
        forcedLanguage,
        clearPendingUserWorkspaceMutation,
    ]);

    /**
     * Deliver a Monaco replacement command only after the workspace hook has
     * committed its requested snapshot. This avoids consuming the revision
     * against the previous active file during the hydration render. When React
     * state already matches but Monaco is stale, the command is ready immediately.
     */
    const readyWorkspaceReplacementRevision = resolveReadyWorkspaceReplacementRevision({
        revision: externalWorkspaceRevision,
        requestedWorkspaceKey: externalWorkspaceControlKey,
        committedWorkspaceKey: currentWorkspaceControlKey,
    });

    useEffect(() => {
        const current = workspace.derived.currentWorkspace;
        const currentKey = currentWorkspaceNotifyKey;

        if (
            suppressNextWorkspaceEchoRef.current ||
            suppressWorkspaceEchoKeyRef.current === currentKey
        ) {
            suppressNextWorkspaceEchoRef.current = false;
            suppressWorkspaceEchoKeyRef.current = null;
            lastNotifiedWorkspaceKeyRef.current = currentKey;
            return;
        }

        if (lastNotifiedWorkspaceKeyRef.current === currentKey) {
            return;
        }

        const resolvedOrigin = resolveFullIdeWorkspaceChangeOrigin({
            pending: pendingUserWorkspaceMutationRef.current,
            currentKey,
        });

        if (resolvedOrigin.consumePending) {
            clearPendingUserWorkspaceMutation();
        }

        emitWorkspaceChange(current, { origin: resolvedOrigin.origin });
    }, [
        clearPendingUserWorkspaceMutation,
        emitWorkspaceChange,
        workspace.derived.currentWorkspace,
        currentWorkspaceNotifyKey,
    ]);
    const sessionRuntimeLanguage =
        forcedLanguage ?? workspace.state.language;
    const sessionRemountKey = useMemo(
        () =>
            buildFullIdeSessionRemountKey({
                actorKey,
                runtimeLanguage: sessionRuntimeLanguage,
                initialProjectId,
                scopeKey,
                exerciseStateKey: props.exerciseStateKey,
                controlledWorkspace:
                    hasExternalWorkspaceProp ||
                    String(props.projectScope?.scopeKey ?? "").startsWith("review-tool:"),
            }),
        [
            actorKey,
            hasExternalWorkspaceProp,
            initialProjectId,
            props.projectScope?.scopeKey,
            props.exerciseStateKey,
            scopeKey,
            sessionRuntimeLanguage,
        ],
    );

    const isIdeReady = !!(
        actorReady && !waitingForV6DraftLease &&
        workspace.derived.storageHydrated &&
        workspace.derived.currentWorkspace &&
        workspace.state.nodes.length > 0 &&
        workspace.state.activeFileId &&
        workspace.state.entryFileId
    );

    useEffect(() => {
        if (!onReadyChange) return;

        if (!isIdeReady) {
            onReadyChange(false);
            return;
        }

        let raf1 = 0;
        let raf2 = 0;

        raf1 = window.requestAnimationFrame(() => {
            raf2 = window.requestAnimationFrame(() => {
                onReadyChange(true);
            });
        });

        return () => {
            window.cancelAnimationFrame(raf1);
            window.cancelAnimationFrame(raf2);
        };
    }, [isIdeReady, onReadyChange, workspace.state.language]);

    return (
        <div
            ref={rootRef}
            className={cn(
                "relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]",
                className,
            )}
            style={fullHeight ? { height: "100%" } : { minHeight: height }}
        >
            {(fileSyncMode !== "v6" ||
              (actorReady && !waitingForV6DraftLease && workspace.derived.storageHydrated)) && (
            <FullIDEInner
                key={sessionRemountKey}
                actorKey={actorKey}
                title={title}
                height={height}
                fullHeight={fullHeight}
                lessonHref={lessonHref}
                lessonLabel={lessonLabel}
                showSettingsMenu={showSettingsMenu}
                access={access}
                loginHref={normalizedLoginHref}
                billingHref={billingHref}
                initialProjectId={initialProjectId}
                projectTitle={projectTitle}
                projectDescription={projectDescription}
                projectScope={projectScope}
                draftStorageMode={effectiveDraftStorageMode}
                readOnly={readOnly}
                fileSyncMode={fileSyncMode}
                v6DraftTabId={fileSyncMode === "v6" ? reservedV6DraftLease?.id : null}
                v6InheritedDraftTabId={fileSyncMode === "v6" ? reservedV6DraftLease?.inheritedFromId : null}
                exerciseStateKey={props.exerciseStateKey}
                workspaceReplacementRevision={
                    readyWorkspaceReplacementRevision
                }
                onWorkspaceReplacementApplied={
                    props.onWorkspaceReplacementApplied
                }
                router={router}
                splitRef={splitRef}
                rootRef={rootRef}
                editorHostRef={editorHostRef}
                showMobileExplorer={showMobileExplorer}
                setShowMobileExplorer={setShowMobileExplorer}
                services={services}
                onBeforeRun={onBeforeRun}
                onRunResult={onRunResult}
                remoteWebPreview={remoteWebPreview}
            remoteWebPreviewSurface={remoteWebPreviewSurface}
            webPreviewCommerceRequest={webPreviewCommerceRequest}
            webPreviewSessionKey={webPreviewSessionKey}
                forceDesktopLayout={forceDesktopLayout}
                sqlDatasetId={sqlDatasetId}
                sqlResultShape={sqlResultShape}
                sqlPaneOptions={sqlPaneOptions}
                runnerPaneOptions={runnerPaneOptions}
                defaultSurface={defaultSurface}
                sqlSchemaSql={sqlSchemaSql}
                sqlSeedSql={sqlSeedSql}
                sqlSetupSql={sqlSetupSql}
                sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                sqlDialect={sqlDialect}
                setSqlDialect={setSqlDialect}
                onChangeLanguage={onChangeLanguage}
                history={workspace.history}
                state={workspace.state}
                derived={workspace.derived}
                actions={workspace.actions}
                onWorkspaceChange={emitWorkspaceChange}
                onTerminalEvidenceChange={onTerminalEvidenceChange}
                onTerminalSyncReady={onTerminalSyncReady}
            />
            )}
        </div>
    );
}
