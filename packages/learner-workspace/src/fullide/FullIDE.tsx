"use client";

import { resolveExerciseExplorerAvailability } from "./explorerAvailability";
import { getLearnerWorkspaceEnv, getLearnerWorkspaceStaticConfig } from "@zoeskoul/learner-workspace/runtime/appRuntime";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import UnifiedLinuxTerminalPanel from "../runner/components/UnifiedLinuxTerminalPanel";
import { unifiedRequest, unifiedTextRevision, parseUnifiedStatus, UnifiedApiError, terminalIdValid, type UnifiedOwner, type UnifiedLinuxClientConfig, type UnifiedRunControls, type UnifiedRunTerminalState } from "../runner/components/unifiedLinuxClient";
import { UnifiedDrafts, UnifiedAutoSaveGate, sameOwner, validUnifiedPath, validUnifiedText, workspacePath, prepareUnifiedPythonRun, verifiedUnifiedSavedDraft } from "./unifiedWorkspaceDrafts";
type UnifiedEditing = {editable:boolean; createAllowed:boolean; edit:(id:string,code:string)=>boolean; create:(kind:"create"|"mkdir",path:string)=>Promise<boolean>;
    mutateStructure:(operation:"move"|"delete"|"rmdir"|"moveDirectory"|"trashDirectory",path:string,destinationPath?:string)=>Promise<boolean>;
    canQueueExplorer?: boolean; pendingAction?: string|null; pendingActionPath?: string|null;
    listTrash:()=>Promise<ReadonlyArray<Readonly<{originalPath:string;trashId:string}>>>;restoreTrash:(entry:Readonly<{originalPath:string;trashId:string}>)=>Promise<boolean>;
    importFiles:(files:import("@zoeskoul/learner-workspace/ide/workspaceHook/workspace.policy").ImportedWorkspaceFile[])=>Promise<void>;
    download:(selection:V6DownloadSelection)=>Promise<void>;
};
import { emptyUnifiedWorkspace, readUnifiedWorkspaceSnapshot, projectUnifiedWorkspace } from "./unifiedWorkspaceProjection";

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
import { resolveWorkspaceFileCapability, type WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
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
    unifiedTerminalOutput?: React.ReactNode;
    unifiedEditing?: UnifiedEditing;
    unifiedRun?:UnifiedRunControls;
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
                          unifiedTerminalOutput,
                          unifiedEditing,
                          unifiedRun,
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
    const explorerAvailable = !!unifiedTerminalOutput || resolveExerciseExplorerAvailability({
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
            if (unifiedEditing ? (!unifiedEditing.editable || !unifiedEditing.edit(fileId,nextCode)) : readOnly) return;
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
        [actions, emitImmediateWorkspaceChange, readOnly, unifiedEditing],
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
                      canCreateFiles: !!(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer) && state.policy.canCreateFiles,
                      canCreateFolders: !!(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer) && state.policy.canCreateFolders,
                      canRenameNodes: !!(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer),
                      canDeleteNodes: !!(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer),
                      canMoveNodes: !!(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer),
                      canUploadFiles: !!(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer),
                      canUploadBinaryFiles: true,
                      maxImportFiles: 8,
                      maxFileContentBytes: 32768,
                      maxUploadFileBytes: 32768,
                  }
                : state.policy,
        [readOnly, state.policy, unifiedEditing?.editable, unifiedEditing?.canQueueExplorer],
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
        if (unifiedEditing) {
            if (!inlineEdit) return;
            try {
                const intent=planV6InlineIntent(nodes,inlineEdit);
                if (!intent) {actions.cancelInlineEdit();return;}
                if (intent.kind==="create_file" || intent.kind==="mkdir") {
                    void unifiedEditing.create(intent.kind==="create_file"?"create":"mkdir",intent.path).then(ok=>{if(ok)actions.cancelInlineEdit();});
                } else if (intent.kind==="move_file" || intent.kind==="move_directory") {
                    void unifiedEditing.mutateStructure(intent.kind==="move_directory"?"moveDirectory":"move",intent.path,intent.destinationPath).then(ok=>{if(ok)actions.cancelInlineEdit();});
                } else throw Error("Unsupported structural operation.");
            } catch(error) { actions.setToast({kind:"error",text:error instanceof Error?error.message:"Invalid file name."}); }
            return;
        }
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
    }, [actions, inlineEdit, nodes, runV6ExplorerIntent, useV6Explorer, updateV6History, unifiedEditing]);
    const v6MoveNode = useCallback((id:string, parentId:string|null) => {
        if (unifiedEditing) {
            try {
                const intent=planV6MoveIntent(nodes,id,parentId);
                if(intent?.kind==="move_file" || intent?.kind==="move_directory")void unifiedEditing.mutateStructure(intent.kind==="move_directory"?"moveDirectory":"move",intent.path,intent.destinationPath);
            }catch(error){actions.setToast({kind:"error",text:error instanceof Error?error.message:"Invalid move."});}
            return;
        }
        if (!useV6Explorer) { actions.moveNode(id,parentId); return; }
        try {
            const intent=planV6MoveIntent(nodes,id,parentId);
            if (intent) void runV6ExplorerIntent(intent);
        } catch (error) {
            actions.setToast({kind:"error",text:error instanceof Error ? error.message : "Invalid folder move."});
        }
    },[actions,nodes,runV6ExplorerIntent,useV6Explorer,unifiedEditing]);
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
            allowRecoverableFolderTrash={Boolean(unifiedEditing)} pendingAction={unifiedEditing?.pendingAction} pendingActionPath={unifiedEditing?.pendingActionPath}
            onV6ListTrash={unifiedEditing ? unifiedEditing.listTrash : useV6Explorer ? listV6Trash : undefined}
            onV6RestoreTrash={unifiedEditing ? unifiedEditing.restoreTrash : useV6Explorer ? restoreV6Trash : undefined}
            onV6Download={unifiedEditing ? unifiedEditing.download : useV6Explorer ? downloadV6Selection : undefined}
            actions={{
                setInlineEdit: readOnly && !(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer) ? noOp : actions.setInlineEdit,
                setToast: actions.setToast,
                openFile: handleOpenWorkspaceFile,
                openFileInSplit: handleOpenWorkspaceFileInSplit,
                toggleFolder: actions.toggleFolder,
                startNewFile: readOnly && !(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer) ? noOp : actions.startNewFile,
                startNewFolder: readOnly && !(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer) ? noOp : actions.startNewFolder,
                startRename: unifiedEditing ? actions.startRename : readOnly ? noOp : actions.startRename,
                setEntry: readOnly ? noOp : actions.setEntry,
                moveNode: unifiedEditing ? v6MoveNode : readOnly ? noOp : v6MoveNode,
                importExternalFiles: unifiedEditing ? (files)=>void unifiedEditing.importFiles(files) : readOnly ? noOp : v6ImportFiles,
                requestDelete: unifiedEditing ? (id)=>{
                    try {
                        const intent=planV6DeleteIntent(nodes,id);
                        if(intent.kind==="delete_file" || intent.kind==="trash_directory"){
                            const isFolder=intent.kind==="trash_directory";
                            const note=isFolder ? "Move this Linux folder to recoverable trash? Restore it through Explorer → Recovery options. The entire folder will be unavailable until restored." : "Permanently delete this saved Linux file? There is no Undo in the disposable pilot.";
                            if(window.confirm(note))void unifiedEditing.mutateStructure(isFolder?"trashDirectory":"delete",intent.path);
                        }
                    }catch(error){actions.setToast({kind:"error",text:error instanceof Error?error.message:"Invalid delete."});}
                } : readOnly ? noOp : actions.requestDelete,
                commitInlineEdit: readOnly && !(unifiedEditing?.editable || unifiedEditing?.canQueueExplorer) ? noOp : v6CommitInlineEdit,
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
            unifiedTerminalOutput={unifiedTerminalOutput}
            unifiedRun={unifiedRun}
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
            readOnly={unifiedEditing ? !unifiedEditing.editable : readOnly}
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
function FullIDEContent(props: FullIDEProps & { unifiedTerminalOutput?: React.ReactNode; unifiedEditing?: UnifiedEditing; unifiedRun?:UnifiedRunControls }) {
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
        disableHistoryRewind: !!props.unifiedTerminalOutput || fileSyncMode === "v6",
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
                unifiedTerminalOutput={props.unifiedTerminalOutput}
                unifiedEditing={props.unifiedEditing}
                unifiedRun={props.unifiedRun}
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


/** Same bounded directory-tree digest as the Linux worker. Requires a complete
 * authoritative guest projection and refuses unsupported binary entries. */
async function unifiedFolderRevision(guest:WorkspaceStateV2,root:string):Promise<string>{
    const entries:Array<[string,"d"]|[string,"f",string]>=[];
    let total=0;
    for(const node of guest.nodes){
        const full=workspacePath(guest,node.id);
        if(!full?.startsWith(root+"/"))continue;
        const relative=full.slice(root.length+1);
        if(!validUnifiedPath(relative)||entries.length>=48)throw Error("DIRECTORY_SNAPSHOT_LIMIT");
        if(node.kind==="folder"){entries.push([relative,"d"]);continue;}
        let revision:string;
        if(node.binary){
            const value=node.binary;
            const raw=atob(value.data);
            if(btoa(raw)!==value.data||raw.length!==value.sizeBytes||raw.length>32768)throw Error("DIRECTORY_BINARY_INVALID");
            total+=raw.length;
            const digest=await crypto.subtle.digest("SHA-256",Uint8Array.from(raw,c=>c.charCodeAt(0)));
            revision=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
        }else{
            const content=node.content??"";
            const bytes=new TextEncoder().encode(content);
            if(bytes.length>32768)throw Error("DIRECTORY_TEXT_INVALID");
            total+=bytes.length;
            revision=(await unifiedTextRevision(content)).slice(7);
        }
        if(total>384*1024)throw Error("DIRECTORY_SNAPSHOT_LIMIT");
        entries.push([relative,"f",revision]);
    }
    entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
    return unifiedTextRevision(JSON.stringify(entries));
}

// Healthy snapshots are silent; only actionable limitations or conflicts are shown.
function unifiedWorkspaceSnapshotNotice(limited:boolean,conflicts:number):string {
    return [limited?"Some entries excluded by limits.":"",conflicts?`${conflicts} draft(s) conflict with Linux; save a copy or discard.`:""].filter(Boolean).join(" · ");
}

/** The authenticated pilot is a configuration of the actual FullIDE, not a second IDE.
 * Guest snapshots are authoritative; the Python pilot adds explicit optimistic saves. */
function UnifiedLinuxFullIDE({config, title, className, showSettingsMenu, language = "bash"}: {config: UnifiedLinuxClientConfig; title?: string; className?: string; showSettingsMenu?: boolean; language?: "python" | "bash"}) {
    const empty = useCallback((): WorkspaceStateV2 => ({...emptyUnifiedWorkspace(), language}), [language]);
    const [snapshot,setSnapshot] = useState<WorkspaceStateV2>(empty);
    const [revision,setRevision] = useState(0);
    const [owner,setOwner] = useState<UnifiedOwner|null>(null);
    const [notice,setNotice] = useState("Open a Linux environment to view its workspace.");
    const [operationNotice,setOperationNotice]=useState("");
    const [busy,setBusy] = useState(false),[ready,setReady]=useState(false);
    const [explicitAction,setExplicitAction] = useState<string|null>(null);
    const [explicitActionPath,setExplicitActionPath] = useState<string|null>(null);
    const explicitActionRef=useRef(false);
    const [drafts,setDrafts]=useState<ReturnType<UnifiedDrafts['list']>>([]);
    const [draftId,setDraftId]=useState(''),[destination,setDestination]=useState('');
    const ownerRef = useRef<UnifiedOwner|null>(null),draftOwnerRef=useRef<UnifiedOwner|null>(null);
    const requestRef = useRef<AbortController|null>(null);
    const currentRef = useRef<WorkspaceStateV2|null>(null),guestRef=useRef<WorkspaceStateV2|null>(null);
    const readyRef=useRef(false);
    const snapshotLimitedRef=useRef(false);
    const runRef=useRef<AbortController|null>(null);const [preparingRun,setPreparingRun]=useState(false);
    const [preferredTerminalId,setPreferredTerminalId]=useState<string|undefined>(undefined);
    const [runTerminal,setRunTerminal]=useState<UnifiedRunTerminalState|null>(null);
    const runTerminalRef=useRef<UnifiedRunTerminalState|null>(null);
    const onRunTerminalState=useCallback((next:UnifiedRunTerminalState|null)=>{runTerminalRef.current=next;setRunTerminal(next);},[]);
    const savingRef=useRef(false);const [saving,setSaving]=useState(false);const [savingId,setSavingId]=useState<string|null>(null);
    const ledger=useRef(new UnifiedDrafts());
    const autoGate=useRef(new UnifiedAutoSaveGate());
    const autoEnabledRef=useRef(false);
    const [autoEnabled,setAutoEnabled]=useState(false);
    const publishedNodesRef=useRef<string|null>(null);
    const initial = useMemo(empty, [empty]);
    const updateDrafts=useCallback(()=>setDrafts(ledger.current.list()),[]);
    const publish=useCallback((guest:WorkspaceStateV2)=>{
        const next=ledger.current.overlay(guest); const fingerprint=JSON.stringify(next.nodes);
        if(publishedNodesRef.current!==fingerprint){publishedNodesRef.current=fingerprint;currentRef.current=next;setSnapshot(next);setRevision(v=>v+1);}
    },[]);
    const onOwnerChange = useCallback((next:UnifiedOwner|null) => {
        if(sameOwner(ownerRef.current,next))return;
        ownerRef.current=next;requestRef.current?.abort();requestRef.current=null;
        runRef.current?.abort();runRef.current=null;setPreparingRun(false);setPreferredTerminalId(undefined);runTerminalRef.current=null;setRunTerminal(null);
        readyRef.current=false;snapshotLimitedRef.current=false;setReady(false);guestRef.current=null;currentRef.current=null;publishedNodesRef.current=null;
        savingRef.current=false;setSaving(false);setSavingId(null);explicitActionRef.current=false;setExplicitAction(null);setExplicitActionPath(null);setOwner(next);setSnapshot(empty());setRevision(v=>v+1);setBusy(false);
        if(next&&!sameOwner(next,draftOwnerRef.current)){
            const lost=ledger.current.list().length;ledger.current.clear();autoGate.current.clear();autoEnabledRef.current=false;setAutoEnabled(false);updateDrafts();setDraftId('');setDestination('');draftOwnerRef.current=next;
            setOperationNotice(lost?"Ownership changed. Old unsaved browser drafts were discarded; saved Linux files are unaffected.":"");
        }
        setNotice(next?"":"Ownership unavailable. Draft writes are disabled; saved Linux files are unaffected.");
    },[updateDrafts,empty]);
    useEffect(()=>()=>{requestRef.current?.abort();requestRef.current=null;runRef.current?.abort();runRef.current=null;},[]);
    useEffect(()=>{if(!drafts.length)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[drafts.length]);
    const refresh = useCallback(async(duringRun=false)=>{
        const selected=ownerRef.current;if(!selected||requestRef.current||(runRef.current&&!duringRun))return;
        const controller=new AbortController();requestRef.current=controller;setBusy(true);
        const timer=setTimeout(()=>controller.abort(),45000);
        try {
            const result=await readUnifiedWorkspaceSnapshot(config,selected,controller.signal);
            if(requestRef.current!==controller||!sameOwner(ownerRef.current,selected))return;
            if(controller.signal.aborted)throw Error("WORKSPACE_SYNC_TIMEOUT");
            const next: WorkspaceStateV2={...projectUnifiedWorkspace(selected,result.nodes,currentRef.current),language};
            guestRef.current=next;snapshotLimitedRef.current=result.limited;publish(next);readyRef.current=true;setReady(true);updateDrafts();
            const conflicting=ledger.current.list().filter(d=>ledger.current.conflict(d,next));
            for(const d of conflicting)autoGate.current.block(d.id);
            const conflicts=conflicting.length;
            setNotice(unifiedWorkspaceSnapshotNotice(result.limited,conflicts));
        }catch(error){
            if(requestRef.current===controller){readyRef.current=false;snapshotLimitedRef.current=true;setReady(false);guestRef.current=null;publishedNodesRef.current=null;currentRef.current=null;setSnapshot(empty());setRevision(v=>v+1);const reason=error instanceof Error&&/^[A-Z0-9_]{1,100}$/.test(error.message)?error.message:"WORKSPACE_READ_UNAVAILABLE";setNotice(`Workspace read unavailable (${reason}). Guest view cleared; drafts retained and writes disabled until refresh succeeds.`);}
        }finally{clearTimeout(timer);if(requestRef.current===controller){requestRef.current=null;setBusy(false);}}
    },[config,publish,updateDrafts,empty,language]);
    // A user-initiated Explorer action may be requested while an authenticated
    // snapshot is in flight. Wait for that one read to settle; never replay a
    // mutation. Recheck the owner and projection after it completes.
    const awaitActionWorkspace=useCallback(async(selected:UnifiedOwner,allowOwnSave=false,allowRun=false)=>{
        const deadline=Date.now()+25000;
        if(!readyRef.current&&!requestRef.current)await refresh(allowRun);
        while(Date.now()<deadline){
            if(!sameOwner(ownerRef.current,selected))throw Error('EXPLORER_OWNER_CHANGED');
            if((runRef.current&&!allowRun)||(savingRef.current&&!allowOwnSave))throw Error('EXPLORER_OTHER_OPERATION');
            if(!requestRef.current){
                if(readyRef.current&&guestRef.current)return guestRef.current;
                throw Error('EXPLORER_SNAPSHOT_FAILED');
            }
            await new Promise<void>(resolve=>setTimeout(resolve,150));
        }
        throw Error('EXPLORER_SNAPSHOT_TIMEOUT');
    },[refresh]);
    useEffect(()=>{if(!owner)return;void refresh();const tick=()=>{if(document.visibilityState==='visible')void refresh();};const timer=setInterval(tick,language==='python'?5000:12000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[owner,refresh,language]);
    const mutate=useCallback(async(kind:'create'|'mkdir',path:string,expected:UnifiedOwner|null,text='',savedId?:string)=>{
        const selected=ownerRef.current;
        if(!selected||!sameOwner(selected,expected)||explicitActionRef.current||runRef.current||savingRef.current||!validUnifiedPath(path)||(kind==='create'&&!validUnifiedText(text))){
            setOperationNotice('Cannot create this entry: invalid path, changed environment, or another operation is active.');return false;
        }
        explicitActionRef.current=true;setExplicitAction(kind==='create'?'Saving…':'Creating folder…');setExplicitActionPath(path);setOperationNotice('');
        let controller:AbortController|null=null;let timer:ReturnType<typeof setTimeout>|undefined;let success=false;
        try{
            await awaitActionWorkspace(selected);
            if(ledger.current.list().length&&savedId===undefined)throw Error('EXPLORER_DRAFT_CONFLICT');
            if(!sameOwner(ownerRef.current,selected)||!readyRef.current||requestRef.current)throw Error('EXPLORER_SNAPSHOT_FAILED');
            controller=new AbortController();requestRef.current=controller;setBusy(true);
            timer=setTimeout(()=>controller?.abort(),30000);
            const result=await unifiedRequest(config,kind==='create'?{action:'workspace',...selected,operation:kind,path,text}:{action:'workspace',...selected,operation:kind,path},controller.signal);
            if(requestRef.current!==controller||!sameOwner(ownerRef.current,selected)||controller.signal.aborted)throw Error('EXPLORER_OWNER_CHANGED');
            if(result.created!==true)throw Error('INVALID_WORKSPACE_RESPONSE');success=true;
            if(savedId){ledger.current.acknowledge(savedId,text);if(!ledger.current.list().some(d=>d.id===savedId))autoGate.current.forget(savedId);}updateDrafts();
            setOperationNotice(`Created ${path} in Linux. Existing files were not overwritten.`);
        }catch(error){if(sameOwner(ownerRef.current,selected))setOperationNotice(error instanceof UnifiedApiError&&error.reason==='UNIFIED_FILE_CONFLICT'?'Name already exists; nothing overwritten. Choose a new name.':error instanceof Error&&error.message==='EXPLORER_DRAFT_CONFLICT'?'Resolve unsaved drafts before changing the workspace.':error instanceof Error&&error.message.startsWith('EXPLORER_')?'Workspace could not be verified for this action. No mutation was sent.':'Creation not verified by Linux. Inspect the current path before retrying; nothing was automatically repeated.');}
        finally{
            if(timer)clearTimeout(timer);
            if(controller&&requestRef.current===controller){requestRef.current=null;setBusy(false);if(sameOwner(ownerRef.current,selected))await refresh();}
            explicitActionRef.current=false;setExplicitAction(null);setExplicitActionPath(null);
        }
        return success;
    },[config,refresh,updateDrafts,awaitActionWorkspace]);
    // Both manual and opt-in automatic saves use the same guarded Python path.
    // Keep the original no-clobber create path and legacy FullIDE unchanged.
    const saveExisting=useCallback(async(id:string,forRun=false)=>{
        const selected=ownerRef.current,draft=ledger.current.list().find(d=>d.id===id);
        if(language!=='python'||!selected||!draft||savingRef.current||explicitActionRef.current||(runRef.current&&!forRun)||!validUnifiedPath(draft.path)||!validUnifiedText(draft.text)||!validUnifiedText(draft.base)){
            setOperationNotice('Save unavailable, busy, or invalid text (32 KiB maximum). No request sent.');return false;
        }
        // This operation owns the Save spinner before waiting for an in-flight
        // snapshot. Never queue/replay the mutation itself, and block auto-save.
        savingRef.current=true;setSaving(true);setSavingId(id);autoGate.current.block(id);setOperationNotice('');
        let controller:AbortController|null=null;
        let timer:ReturnType<typeof setTimeout>|undefined;
        let receipt=false,verified=false;
        try{
            const guest=await awaitActionWorkspace(selected,true,forRun);
            if(!sameOwner(ownerRef.current,selected)||requestRef.current||!readyRef.current||snapshotLimitedRef.current||ledger.current.conflict(draft,guest)){
                throw Error('SAVE_SNAPSHOT_CONFLICT');
            }
            controller=new AbortController();requestRef.current=controller;setBusy(true);
            timer=setTimeout(()=>controller?.abort(),30000);
            const owns=()=>requestRef.current===controller&&sameOwner(ownerRef.current,selected)&&!controller?.signal.aborted;
            const [expectedRevision,sentRevision]=await Promise.all([unifiedTextRevision(draft.base),unifiedTextRevision(draft.text)]);
            if(!owns())throw Error('SAVE_OWNER_CHANGED');
            const result=await unifiedRequest(config,{action:'workspace',...selected,operation:'update',path:draft.path,text:draft.text,expectedRevision},controller.signal);
            if(!owns())throw Error('SAVE_OWNER_CHANGED');
            if(result.updated!==true||result.revision!==sentRevision)throw Error('INVALID_WORKSPACE_RESPONSE');
            receipt=true;
        }catch(error){
            if(sameOwner(ownerRef.current,selected))setOperationNotice(error instanceof UnifiedApiError&&error.reason==='UNIFIED_FILE_CONFLICT'?'Linux file changed. Draft retained; save a copy or reconcile.':error instanceof Error&&error.message==='SAVE_SNAPSHOT_CONFLICT'?'Linux workspace changed. Draft retained; refresh and reconcile before saving.':'Save not verified. Draft retained; inspect Linux before retrying.');
        }finally{
            if(timer)clearTimeout(timer);
            // The button stays in Saving… until a fresh authoritative snapshot
            // confirms the exact saved bytes. Never acknowledge only HTTP 200.
            if(controller&&requestRef.current===controller){
                requestRef.current=null;readyRef.current=false;setReady(false);
                await refresh(forRun);
                if(receipt&&sameOwner(ownerRef.current,selected)&&readyRef.current&&!snapshotLimitedRef.current&&verifiedUnifiedSavedDraft(draft,guestRef.current)){
                    ledger.current.acknowledge(draft.id,draft.text);
                    if(!ledger.current.list().some(d=>d.id===draft.id))autoGate.current.forget(draft.id);
                    updateDrafts();
                    if(guestRef.current){publishedNodesRef.current=null;publish(guestRef.current);}
                    setOperationNotice(`Saved ${draft.path} in Linux.`);
                    verified=true;
                }else if(receipt&&sameOwner(ownerRef.current,selected)){
                    setOperationNotice('Save response received, but Linux readback could not confirm the file. Draft retained; inspect Linux before retrying.');
                }
            }
            // Ownership change resets its own UI; a stale completion must not
            // unlock the next owner's new operation.
            if(sameOwner(ownerRef.current,selected)){
                savingRef.current=false;setSaving(false);setSavingId(null);
                if(!requestRef.current)setBusy(false);
            }
        }
        return verified;
    },[config,language,refresh,updateDrafts,awaitActionWorkspace,publish]);
    const runPython=useCallback(async(id:string,visibleText:string)=>{
        const selected=ownerRef.current,terminal=runTerminalRef.current;
        const visible=guestRef.current?.nodes.find(n=>n.id===id);
        const draft=ledger.current.list().find(d=>d.id===id);
        // Refuse stale Monaco/file binding rather than accidentally executing a different file.
        if(!terminal||!sameOwner(terminal.owner,selected)||!terminal.canStart||visible?.kind!=='file'||(draft?.text??visible.content??'')!==visibleText){setOperationNotice('Run unavailable: confirm terminal capacity and selected file content, then retry.');return;}
        if(language!=='python'||!selected||!id||!readyRef.current||requestRef.current||savingRef.current||runRef.current){setOperationNotice('Run unavailable while workspace is busy.');return;}
        const controller=new AbortController();runRef.current=controller;setPreparingRun(true);setOperationNotice('Preparing Python run — verifying saved files…');
        const owns=()=>runRef.current===controller&&!controller.signal.aborted&&sameOwner(ownerRef.current,selected);
        let timer:ReturnType<typeof setTimeout>|undefined;
        try{
            const prepared=await prepareUnifiedPythonRun(id,{owns,guest:()=>readyRef.current?guestRef.current:null,drafts:()=>ledger.current.list(),blocked:key=>autoGate.current.isBlocked(key),refresh:()=>refresh(true),save:key=>saveExisting(key,true)});
            if(!owns())return;
            if(!prepared){setOperationNotice('Run blocked: select a Python file and resolve unsaved, conflicting or changed files. No program was requested.');return;}
            const expectedRevision=await unifiedTextRevision(prepared.text);if(!owns())return;
            setOperationNotice('Opening dedicated Python terminal…');timer=setTimeout(()=>controller.abort(),30000);
            const result=await unifiedRequest(config,{action:'run',...selected,path:prepared.path,expectedRevision},controller.signal);
            if(!owns())return;
            if(!terminalIdValid(result.terminalId))throw Error('INVALID_RUN_RESPONSE');
            setPreferredTerminalId(result.terminalId);setOperationNotice('Python started. Results appear in the original terminal tab; completed output remains visible.');
        }catch(error){if(runRef.current===controller&&sameOwner(ownerRef.current,selected)){setOperationNotice(error instanceof UnifiedApiError&&(error.reason==='TERMINAL_LIMIT'||error.reason==='UNIFIED_PROGRAM_LIMIT')?'Terminal capacity is busy; close an active Linux terminal or wait for verified program completion.':'Run not verified. Check terminal status before retrying; no automatic replay.');}}
        finally{clearTimeout(timer);if(runRef.current===controller){runRef.current=null;setPreparingRun(false);void refresh();}}
    },[config,language,refresh,saveExisting]);
    useEffect(()=>{
        if(language!=='python'||!owner||!autoEnabled)return;
        const tick=()=>{
            const guest=guestRef.current;
            if(!autoEnabledRef.current||document.visibilityState!=='visible'||!sameOwner(ownerRef.current,owner)||!readyRef.current||!guest||requestRef.current||savingRef.current||runRef.current)return;
            const id=autoGate.current.next(ledger.current.list(),guest,Date.now(),(d,g)=>ledger.current.conflict(d,g));
            if(id)void saveExisting(id);
        };
        const timer=setInterval(tick,250);
        return()=>clearInterval(timer);
    },[language,owner,autoEnabled,saveExisting]);
    // All structural mutations require current owner, a settled guest projection,
    // and zero unsaved Monaco drafts. The guest is the authority, never a local
    // React tree mutation. An uncertain acknowledgement requires manual refresh.
    const mutateStructure=useCallback(async(operation:"move"|"delete"|"rmdir"|"moveDirectory"|"trashDirectory",path:string,destinationPath?:string)=>{
        const selected=ownerRef.current;
        if(!selected||explicitActionRef.current||runRef.current||savingRef.current||ledger.current.list().length||!validUnifiedPath(path)||((operation==="move"||operation==="moveDirectory")&&(!destinationPath||!validUnifiedPath(destinationPath)||destinationPath===path||(operation==="moveDirectory"&&destinationPath.startsWith(path+"/"))))){
            setOperationNotice(ledger.current.list().length?'Resolve unsaved drafts before changing files or folders. Nothing was sent.':'Invalid path, changed environment, or another operation is active. Nothing was sent.');return false;
        }
        explicitActionRef.current=true;
        const renaming=(operation==='move'||operation==='moveDirectory')&&path.split('/').slice(0,-1).join('/')===destinationPath?.split('/').slice(0,-1).join('/');
        setExplicitAction(renaming?'Renaming…':operation==='move'||operation==='moveDirectory'?'Moving…':operation==='trashDirectory'?'Moving to recovery…':'Deleting…');setExplicitActionPath(path);
        setOperationNotice('');
        let controller:AbortController|null=null;let timer:ReturnType<typeof setTimeout>|undefined;let success=false;
        try{
            const guest=await awaitActionWorkspace(selected);
            if(!sameOwner(ownerRef.current,selected)||!readyRef.current||requestRef.current||ledger.current.list().length||((operation==='moveDirectory'||operation==='trashDirectory')&&snapshotLimitedRef.current))throw Error('EXPLORER_SNAPSHOT_FAILED');
            const node=guest.nodes.find(n=>workspacePath(guest,n.id)===path);
            if(!node||((operation==='rmdir'||operation==='moveDirectory'||operation==='trashDirectory')?node.kind!=='folder':node.kind!=='file'))throw Error('EXPLORER_SELECTION_CHANGED');
            controller=new AbortController();requestRef.current=controller;setBusy(true);timer=setTimeout(()=>controller?.abort(),30000);
            const binary=node.kind==='file'?node.binary:undefined;
            const expectedRevision=node.kind==='folder'?await unifiedFolderRevision(guest,path):node.kind==='file'?await (binary?(async()=>{
                const raw=atob(binary.data);
                if(btoa(raw)!==binary.data||raw.length!==binary.sizeBytes)throw Error('INVALID_BINARY_REVISION');
                const digest=await crypto.subtle.digest('SHA-256',Uint8Array.from(raw,c=>c.charCodeAt(0)));
                return 'sha256:'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
            })():unifiedTextRevision(node.content??'')):null;
            if(controller.signal.aborted||!sameOwner(ownerRef.current,selected)||requestRef.current!==controller||ledger.current.list().length)throw Error('EXPLORER_OWNER_CHANGED');
            const payload=operation==='move'?{action:'workspace' as const,...selected,operation:'move' as const,path,destinationPath:destinationPath!,expectedRevision:expectedRevision!}:
                operation==='moveDirectory'?{action:'workspace' as const,...selected,operation:'moveDirectory' as const,path,destinationPath:destinationPath!,expectedRevision:expectedRevision!}:
                operation==='trashDirectory'?{action:'workspace' as const,...selected,operation:'trashDirectory' as const,path,expectedRevision:expectedRevision!}:
                operation==='delete'?{action:'workspace' as const,...selected,operation:'delete' as const,path,expectedRevision:expectedRevision!}:
                {action:'workspace' as const,...selected,operation:'rmdir' as const,path};
            const result=await unifiedRequest(config,payload,controller.signal);
            if(controller.signal.aborted||!sameOwner(ownerRef.current,selected)||requestRef.current!==controller)throw Error('EXPLORER_OWNER_CHANGED');
            if(operation==='move'||operation==='moveDirectory'?(result.moved!==true||result.revision!==expectedRevision):operation==='trashDirectory'?result.trashed!==true:result.deleted!==true)throw Error('INVALID_WORKSPACE_RESPONSE');
            success=true;
            setOperationNotice(operation==='trashDirectory'?'Folder moved to recoverable trash. Restore through Explorer → Recovery options.':`${operation==='move'||operation==='moveDirectory'?'Moved':'Removed'} ${path} in Linux.`);
        }catch(error){
            if(sameOwner(ownerRef.current,selected))setOperationNotice(error instanceof UnifiedApiError&&error.reason==='UNIFIED_FILE_CONFLICT'?'The entry changed or destination exists. Nothing was overwritten.':error instanceof Error&&error.message.startsWith('EXPLORER_')?'Workspace or selection could not be verified. No mutation was sent.':error instanceof UnifiedApiError&&error.reason==='UNIFIED_FILE_UNAVAILABLE'?'Linux could not complete or verify this folder operation (503). Check the current file tree before retrying; it was not replayed.':'Mutation not verified. Inspect the current file tree before another attempt; nothing was automatically repeated.');
        }finally{
            if(timer)clearTimeout(timer);
            if(controller&&requestRef.current===controller){requestRef.current=null;setBusy(false);if(sameOwner(ownerRef.current,selected))await refresh();}
            explicitActionRef.current=false;setExplicitAction(null);setExplicitActionPath(null);
        }
        return success;
    },[config,refresh,awaitActionWorkspace]);
    const importFiles=useCallback(async(files:import("@zoeskoul/learner-workspace/ide/workspaceHook/workspace.policy").ImportedWorkspaceFile[])=>{
        const selected=ownerRef.current,guest=guestRef.current;
        if(!selected||!guest||!readyRef.current||snapshotLimitedRef.current||requestRef.current||runRef.current||savingRef.current||ledger.current.list().length||!Array.isArray(files)||!files.length||files.length>8){
            setOperationNotice("Import unavailable: finish drafts and refresh a complete Linux workspace snapshot, then choose up to 8 files (32 KiB each).");return;
        }
        const known=new Set(guest.nodes.map(n=>workspacePath(guest,n.id)).filter((p):p is string=>!!p));
        const folders=new Set<string>(),staged=new Set<string>();
        try{
            for(const file of files){
                if(!file||!validUnifiedPath(file.path)||known.has(file.path)||staged.has(file.path))throw Error('IMPORT_INVALID_OR_EXISTING_PATH');
                if(file.binary){
                    const b=file.binary;
                    if(b.encoding!=='base64'||!Number.isSafeInteger(b.sizeBytes)||b.sizeBytes<0||b.sizeBytes>32768||typeof b.data!=='string'||b.data.length!==Math.ceil(b.sizeBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.data)||atob(b.data).length!==b.sizeBytes||btoa(atob(b.data))!==b.data)throw Error('INVALID_BINARY_IMPORT');
                }else if(!validUnifiedText(file.content))throw Error('INVALID_TEXT_IMPORT');
                staged.add(file.path);
                const parts=file.path.split('/');
                for(let i=1;i<parts.length;i++){const dir=parts.slice(0,i).join('/');if(!known.has(dir))folders.add(dir);}
            }
            if(staged.size+folders.size>24||known.size+staged.size+folders.size>48)throw Error('IMPORT_TOO_MANY_ENTRIES');
            // A future snapshot must fit the bounded worker/bridge response. This
            // estimate includes already-present files and JSON escape overhead;
            // do not start a partial import that would become invisible afterward.
            const escaped=(value:string)=>JSON.stringify(value).length + [...value].filter(c=>c.charCodeAt(0)>127).length*8;
            let estimate=2048;
            for(const node of guest.nodes){
                const path=workspacePath(guest,node.id);
                estimate+=256+(path?.length??128)*2;
                if(node.kind==='file')estimate+=node.binary?.data.length??escaped(node.content??'');
            }
            for(const file of files){estimate+=256+file.path.length*2+(file.binary?.data.length??escaped(file.content));}
            estimate+=folders.size*256;
            if(estimate>356*1024)throw Error('IMPORT_SNAPSHOT_LIMIT');
        }catch{setOperationNotice("Import refused before upload: invalid path, encoding, entry count, 32 KiB/file or total snapshot limit, duplicate, or existing name. Linux files were unchanged.");return;}
        const controller=new AbortController();requestRef.current=controller;setBusy(true);
        const timer=setTimeout(()=>controller.abort(),45000);let completed=0;
        const owns=()=>requestRef.current===controller&&!controller.signal.aborted&&sameOwner(ownerRef.current,selected);
        try{
            const directories=[...folders].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));
            for(const path of directories){if(!owns())return;const r=await unifiedRequest(config,{action:'workspace',...selected,operation:'mkdir',path},controller.signal);if(!owns())return;if(r.created!==true)throw Error('INVALID_DIRECTORY_ACK');}
            for(const file of files){if(!owns())return;const r=await unifiedRequest(config,file.binary?{action:'workspace',...selected,operation:'createBinary',path:file.path,data:file.binary.data,sizeBytes:file.binary.sizeBytes}:{action:'workspace',...selected,operation:'create',path:file.path,text:file.content},controller.signal);if(!owns())return;if(r.created!==true)throw Error('INVALID_FILE_ACK');
                // A successful create acknowledgement is not the byte-integrity
                // receipt. Read the new file back from the same authenticated
                // environment before reporting it as imported. Never replay.
                const verified=await unifiedRequest(config,{action:'workspace',...selected,operation:file.binary?'readBinary':'read',path:file.path},controller.signal);
                if(!owns())return;
                if(file.binary?(verified.encoding!=='base64'||verified.sizeBytes!==file.binary.sizeBytes||verified.data!==file.binary.data):verified.text!==file.content)throw Error('IMPORT_READBACK_MISMATCH');
                completed++;setOperationNotice(`Imported and verified ${completed}/${files.length} files…`);}
            setOperationNotice(`Imported ${completed} files into Linux. No existing files were overwritten.`);
        }catch(error){if(requestRef.current===controller)setOperationNotice(`Import stopped after ${completed} acknowledged files. Refresh and inspect before retrying; no automatic replay. ${error instanceof UnifiedApiError&&error.reason==='UNIFIED_FILE_CONFLICT'?'A destination already exists.':''}`);}
        finally{clearTimeout(timer);if(requestRef.current===controller){requestRef.current=null;setBusy(false);void refresh();}}
    },[config,refresh]);
    const download=useCallback(async(selection:V6DownloadSelection)=>{
        const selected=ownerRef.current;
        if(!selected||!readyRef.current||requestRef.current||runRef.current||savingRef.current||ledger.current.list().length){setOperationNotice("Save or download your unsaved draft first; verified Linux download is unavailable while busy.");return;}
        const ctrl=new AbortController();requestRef.current=ctrl;setBusy(true);const timer=setTimeout(()=>ctrl.abort(),30000);
        try{
            const latest=await readUnifiedWorkspaceSnapshot(config,selected,ctrl.signal);
            if(ctrl.signal.aborted||!sameOwner(ownerRef.current,selected)||requestRef.current!==ctrl)return;
            if(latest.limited)throw Error('INCOMPLETE_SNAPSHOT');
            const entries=latest.nodes.map(n=>n.kind==='directory'?{kind:'directory' as const,path:n.path}:'text' in n?{kind:'file' as const,path:n.path,content:n.text}:{kind:'file' as const,path:n.path,encoding:'base64' as const,data:n.data,sizeBytes:n.sizeBytes,mimeType:resolveWorkspaceFileCapability(n.path)?.mimeType??'application/octet-stream'});
            saveV6BrowserDownload(prepareV6SessionDownload(entries,selection));setOperationNotice('Downloaded verified Linux file(s); unsaved browser drafts were excluded.');
        }catch{if(requestRef.current===ctrl)setOperationNotice('Download not verified. Refresh the workspace and retry; no partial archive was created.');}
        finally{clearTimeout(timer);if(requestRef.current===ctrl){requestRef.current=null;setBusy(false);}}
    },[config]);
    const downloadLinuxVersion=useCallback(async(path:string)=>{
        const selected=ownerRef.current;
        if(!selected||!readyRef.current||requestRef.current||runRef.current||savingRef.current||!validUnifiedPath(path)){
            setOperationNotice('Linux copy unavailable: refresh and finish the current operation. Draft retained.');return;
        }
        const controller=new AbortController();requestRef.current=controller;setBusy(true);
        const timer=setTimeout(()=>controller.abort(),30000);
        try{
            const result=await unifiedRequest(config,{action:'workspace',...selected,operation:'read',path},controller.signal);
            const status=parseUnifiedStatus(await unifiedRequest(config,{action:'status',windowId:selected.windowId},controller.signal));
            if(controller.signal.aborted||requestRef.current!==controller||!sameOwner(ownerRef.current,selected)||status.status!=='current'||status.environmentId!==selected.environmentId||status.windowGeneration!==selected.windowGeneration||typeof result.text!=='string'||!validUnifiedText(result.text))throw Error('INVALID_LINUX_COPY');
            const blob=new Blob([result.text],{type:'text/plain;charset=utf-8'});
            const url=URL.createObjectURL(blob);
            try{const a=document.createElement('a');a.href=url;a.download='linux-'+path.split('/').pop();a.click();}
            finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
            setOperationNotice('Saved Linux version downloaded. Your Monaco draft remains unchanged; compare both copies before resolving the conflict.');
        }catch{if(requestRef.current===controller)setOperationNotice('Saved Linux version not verified. Draft retained; refresh before retry.');}
        finally{clearTimeout(timer);if(requestRef.current===controller){requestRef.current=null;setBusy(false);}}
    },[config]);
    const listTrash=useCallback(async():Promise<ReadonlyArray<Readonly<{originalPath:string;trashId:string}>>>=>{
        const selected=ownerRef.current;
        if(!selected||!readyRef.current||requestRef.current||runRef.current)throw Error("Workspace is busy or unavailable; refresh before browsing recovery options.");
        const controller=new AbortController();requestRef.current=controller;setBusy(true);
        const timer=setTimeout(()=>controller.abort(),30000);
        try{
            const reply=await unifiedRequest(config,{action:"workspace",...selected,operation:"listTrash",path:""},controller.signal);
            if(controller.signal.aborted||requestRef.current!==controller||!sameOwner(ownerRef.current,selected)||!Array.isArray(reply.entries)||reply.entries.length>8)throw Error("RECOVERY_LIST_UNVERIFIED");
            const items:ReadonlyArray<Readonly<{originalPath:string;trashId:string}>>=reply.entries.map(entry=>{
                if(!entry||typeof entry!=="object")throw Error("RECOVERY_LIST_UNVERIFIED");
                const item=entry as Record<string,unknown>;
                if(typeof item.originalPath!=="string"||!validUnifiedPath(item.originalPath)||typeof item.trashId!=="string"||!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(item.trashId))throw Error("RECOVERY_LIST_UNVERIFIED");
                return {originalPath:item.originalPath,trashId:item.trashId};
            });
            return items;
        }finally{clearTimeout(timer);if(requestRef.current===controller){requestRef.current=null;setBusy(false);}}
    },[config]);
    const restoreTrash=useCallback(async(entry:Readonly<{originalPath:string;trashId:string}>):Promise<boolean>=>{
        const selected=ownerRef.current;
        if(!selected||!readyRef.current||snapshotLimitedRef.current||requestRef.current||runRef.current||savingRef.current||ledger.current.list().length||!validUnifiedPath(entry.originalPath)||!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(entry.trashId)){
            setOperationNotice("Resolve drafts and refresh a complete Linux workspace before restoring a folder. Nothing changed.");return false;
        }
        if(!window.confirm(`Restore ${entry.originalPath} from recoverable trash? Existing paths are never overwritten.`))return false;
        const controller=new AbortController();requestRef.current=controller;setBusy(true);
        const timer=setTimeout(()=>controller.abort(),30000);
        let accepted=false;
        try{
            const reply=await unifiedRequest(config,{action:"workspace",...selected,operation:"restoreDirectory",path:entry.originalPath,trashId:entry.trashId},controller.signal);
            if(controller.signal.aborted||requestRef.current!==controller||!sameOwner(ownerRef.current,selected)||reply.restored!==true)throw Error("RESTORE_UNVERIFIED");
            accepted=true;setOperationNotice("Folder restored. Refreshing Explorer…");
        }catch(error){if(requestRef.current===controller)setOperationNotice(error instanceof UnifiedApiError&&error.reason==="UNIFIED_FILE_CONFLICT"?"Restore blocked: folder changed or original path exists. Nothing overwritten.":"Restore not verified. Refresh and inspect Recovery options; do not retry blindly.");}
        finally{clearTimeout(timer);if(requestRef.current===controller){requestRef.current=null;setBusy(false);void refresh();}}
        return accepted;
    },[config,refresh]);
    const editing=useMemo<UnifiedEditing>(()=>({canQueueExplorer:!!owner&&!preparingRun&&!saving&&!explicitAction, pendingAction:explicitAction,pendingActionPath:explicitActionPath,editable:!!owner&&ready&&!saving&&!preparingRun&&!explicitAction,createAllowed:!!owner&&ready&&!busy&&!preparingRun&&!explicitAction,create:(kind,path)=>mutate(kind,path,owner),mutateStructure,listTrash,restoreTrash,importFiles,download,edit:(id,code)=>{
        const guest=guestRef.current;if(savingRef.current||runRef.current||!ownerRef.current||!sameOwner(ownerRef.current,owner)||!readyRef.current||!guest)return false;
        if(!ledger.current.edit(guest,id,code))return false;
        if(ledger.current.list().some(d=>d.id===id))autoGate.current.edited(id,Date.now());else autoGate.current.forget(id);
        if(language==='python'&&!autoGate.current.isBlocked(id))setOperationNotice('');
        // Record the already-presented local content so an unchanged scan does not reset Monaco.
        publishedNodesRef.current=JSON.stringify(ledger.current.overlay(guest).nodes);updateDrafts();setDraftId(previous=>previous===id?previous:id);return true;
    }}),[owner,ready,busy,saving,preparingRun,explicitAction,explicitActionPath,mutate,mutateStructure,listTrash,restoreTrash,importFiles,download,updateDrafts,language]);
    const chosen=drafts.find(d=>d.id===draftId)??drafts[0];
    const hasConflict=!!guestRef.current&&drafts.some(d=>ledger.current.conflict(d,guestRef.current!));
    const saveStatus=preparingRun?'Preparing run…':saving?null:!owner||!ready?null:hasConflict?'Conflict — draft retained':drafts.some(d=>autoGate.current.isBlocked(d.id))?'Review required — automatic save paused':drafts.length?`Unsaved (${drafts.length})`:'Saved';
    const terminalConfig=useMemo(()=>({...config,workspaceRead:false,workspaceWrite:false}),[config]);
    const hasDrafts=useCallback(()=>ledger.current.list().length>0||runRef.current!==null,[]);
    const stopPython=useCallback(()=>{
        const t=runTerminalRef.current;
        if(!t||!sameOwner(t.owner,ownerRef.current)||!t.terminalId||!t.canStop||!t.interrupt()){setOperationNotice('Interrupt unavailable; reconnect the Python terminal. No input was replayed.');return;}
        setOperationNotice('Interrupt sent to Python terminal. Await program output or exit.');
    },[]);
    const currentRun=runTerminal&&sameOwner(runTerminal.owner,owner)?runTerminal:null;
    const runControls:UnifiedRunControls|undefined=language==='python'?{
        state:preparingRun?'starting':currentRun?.terminalId?'running':'idle',
        enabled:!!owner&&ready&&!busy&&!preparingRun&&!hasConflict&&currentRun?.canStart===true,
        canStop:currentRun?.canStop===true,start:runPython,stop:stopPython,
    }:undefined;
    const surface=<UnifiedLinuxTerminalPanel config={terminalConfig} embedded onOwnerChange={onOwnerChange} hasUnsavedDrafts={hasDrafts} preferredTerminalId={preferredTerminalId} onRunTerminalState={language==='python'?onRunTerminalState:undefined}/>;
    return <div className={cn("flex h-full min-h-0 flex-col gap-1", className)} data-testid="unified-fullide" onKeyDownCapture={e=>{
        if(language!=='python'||!(e.target instanceof Element)||!e.target.closest('.monaco-editor')||!(e.metaKey||e.ctrlKey)||e.altKey||e.shiftKey||e.key.toLowerCase()!=='s')return;
        e.preventDefault();e.stopPropagation();if(e.repeat||runRef.current||savingRef.current||explicitActionRef.current)return;
        const id=currentRef.current?.activeFileId;
        if(id&&ledger.current.list().some(d=>d.id===id))void saveExisting(id);
        else setOperationNotice('No unsaved changes in the active file.');
    }}>
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 text-xs">
            <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={!owner||busy||preparingRun} onClick={()=>void refresh()}>Refresh Linux workspace</button>
            {language==='python'&&<>
                <label className="flex items-center gap-1" title="Save eligible drafts after a short typing pause; conflicts require manual review."><input type="checkbox" checked={autoEnabled} disabled={!owner||!ready||saving||preparingRun} onChange={e=>{autoEnabledRef.current=e.target.checked;setAutoEnabled(e.target.checked);}}/>Auto-save</label>
                {saveStatus&&<span role="status" data-testid="unified-save-status">{saveStatus}</span>}
            </>}
            {notice&&<span role="status">{notice}</span>}{operationNotice&&<span role="status">{operationNotice}</span>}
            {chosen&&<div className="flex flex-wrap items-center gap-2" aria-label="Unsaved Monaco drafts">
                <label>Unsaved drafts ({drafts.length}) <select className="rounded border bg-transparent" value={chosen.id} onChange={e=>{setDraftId(e.target.value);setDestination('');}}>{drafts.map(d=><option key={d.id} value={d.id}>{d.path}</option>)}</select></label>
                <span>{new TextEncoder().encode(chosen.text).length}/32768 bytes</span>
                {language==='python'&&<button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 disabled:opacity-40" disabled={!editing.canQueueExplorer||saving||!validUnifiedText(chosen.text)} aria-busy={saving&&savingId===chosen.id} onClick={()=>void saveExisting(chosen.id)}>{saving&&savingId===chosen.id?<><LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin"/>Saving…</>:"Save to Linux"}</button>}
                <input aria-label="Save draft to new Linux path" className="rounded border bg-transparent px-2 py-1" value={destination} placeholder="New path e.g. main-v2.py" maxLength={128} onChange={e=>setDestination(e.target.value)}/>
                <button type="button" className="inline-flex items-center gap-1 rounded border px-2 py-1 disabled:opacity-40" disabled={!editing.canQueueExplorer||!!explicitAction||!validUnifiedPath(destination)||!validUnifiedText(chosen.text)} aria-busy={explicitAction==='Saving…'} onClick={()=>void mutate('create',destination,owner,chosen.text,chosen.id).then(ok=>{if(ok)setDestination('');})}>{explicitAction==='Saving…'?<><LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin"/>Saving…</>:"Save as new file"}</button>
                <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={busy||preparingRun||saving||!ready} onClick={()=>void downloadLinuxVersion(chosen.path)}>Download Linux copy</button>
                <button type="button" className="rounded border px-2 py-1" onClick={()=>{const url=URL.createObjectURL(new Blob([chosen.text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=chosen.path.split('/').pop()||'draft.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Download draft</button>
                <button type="button" className="rounded border px-2 py-1" disabled={busy||preparingRun} onClick={()=>{if(runRef.current)return;if(window.confirm('Discard this unsaved draft?')){ledger.current.discard(chosen.id);autoGate.current.forget(chosen.id);setOperationNotice('');updateDrafts();if(guestRef.current){publishedNodesRef.current=null;publish(guestRef.current);}setDestination('');}}}>Discard draft</button>
            </div>}
        </div>
        <div className="min-h-0 flex-1">
            <FullIDEContent title={title ?? "Unified Linux"} language={language} fullHeight forceDesktopLayout exerciseStateKey={`unified-fullide-pilot-${language}`}
                storageKey={`zoelearning.unified-linux.disposable.${language}`} showSettingsMenu={showSettingsMenu}
                access={{hasUser:true,canUseMultiFile:true,canSaveCloud:false,canCreateProjects:false}}
                servicePreset="workspace" showTopLanguageButtons={false} draftStorageMode="off" readOnly
                initialWorkspace={initial} externalWorkspace={snapshot} externalWorkspaceRevision={revision}
                onWorkspaceChange={value=>{currentRef.current=value;}}
                unifiedTerminalOutput={surface} unifiedEditing={editing} unifiedRun={runControls}
                services={{chrome:{showBackButton:false,showLessonLink:false,showStatus:false,showTopLanguageButtons:false},
                    explorer:{showActions:true,showHistoryControls:false,showFooter:false,showStdin:false,fileActions:{enabled:true,createFile:true,createFolder:true,rename:true,delete:true,dragDrop:false}},
                    runner:{allowRun:false,enableWorkspaceTerminal:false,showOpenTerminalButton:false,showRestartTerminalButton:false,showTerminalDockToggle:true},
                    projects:{showProjectSwitcher:false,showCloudProjects:false,showSaveControls:false,showSaveAs:false}}}/>
        </div>
    </div>;
}

export default function FullIDE(props: FullIDEProps) {
    if (props.unifiedLinux) {
        if(getLearnerWorkspaceStaticConfig().nodeEnv!=="development"||!props.access.hasUser) return null;
        if (props.language !== undefined && props.language !== "bash" && props.language !== "python") return null;
        return <UnifiedLinuxFullIDE language={props.language === "python" ? "python" : "bash"} config={props.unifiedLinux} title={props.title} className={props.className} showSettingsMenu={props.showSettingsMenu}/>;
    }
    return <FullIDEContent {...props}/>;
}
