"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import { useProjectDirtyState } from "@/components/code/projects/hooks/useProjectDirtyState";
import { useProjectsList } from "@/components/code/projects/hooks/useProjectsList";

import { pathOf } from "../fsTree";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { useIdeWorkspace } from "../workspaceHook/useIdeWorkspace";
import { cn } from "../utils";
import IdeDesktopLayout from "@/components/ide/fullide/chrome/IdeDesktopLayout";
import IdeHeader from "@/components/ide/fullide/chrome/IdeHeader";
import IdeMobileLayout from "@/components/ide/fullide/chrome/IdeMobileLayout";
import IdeStatusBanners from "@/components/ide/fullide/chrome/IdeStatusBanners";
import IdeToastHost from "@/components/ide/fullide/chrome/IdeToastHost";
import IdeConflictBanner from "@/components/ide/fullide/chrome/IdeConflictBanner";
import { useIdeProjectSession } from "@/components/ide/fullide/hooks/useIdeProjectSession";
import { useIdeRunner } from "@/components/ide/fullide/hooks/useIdeRunner";
import { useIdeViewport } from "@/components/ide/fullide/hooks/useIdeViewport";
import IdeProjectModals from "@/components/ide/fullide/modals/IdeProjectModals";
import IdeEditorPane from "@/components/ide/fullide/panes/IdeEditorPane";
import IdeExplorerPane from "@/components/ide/fullide/panes/IdeExplorerPane";
import type {FullIDEProps, WorkspaceStateV2} from "../types";
import { CodeRunnerRuntime, ExecutionBackend } from "@/components/code/runner/runtime";
import { mergeTerminalSnapshotIntoWorkspace } from "@/lib/projects/mergeTerminalSnapshotIntoWorkspace";
import {FullIDEServices, resolveFullIDEServices} from "./services";
import { resolveLearnerWorkspacePresentation } from "./workspacePresentation";
// import {
//     FullIDEServices,
//     resolveFullIDEServices,
// } from "@/components/ide/fullide/services";

type WorkspaceHookResult = ReturnType<typeof useIdeWorkspace>;

type FullIDEInnerProps = {
    actorKey: string;
    title: string;
    height: number;
    fullHeight: boolean;
    lessonHref?: string;
    lessonLabel: string;
    access: FullIDEProps["access"];
    loginHref: string;
    billingHref: string;
    initialProjectId: string | null;
    projectTitle?: string | null;
    projectDescription?: string | null;
    projectScope: FullIDEProps["projectScope"];
    router: ReturnType<typeof useRouter>;
    splitRef: React.RefObject<HTMLDivElement | null>;
    rootRef: React.RefObject<HTMLDivElement | null>;
    editorHostRef: React.RefObject<HTMLDivElement | null>;
    showMobileExplorer: boolean;
    setShowMobileExplorer: React.Dispatch<React.SetStateAction<boolean>>;
    services: FullIDEServices;
    onBeforeRun?: FullIDEProps["onBeforeRun"];
    onRunResult?: FullIDEProps["onRunResult"];
    forceDesktopLayout?: boolean;
    exerciseStateKey?: string;
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

function getOrCreateGuestActorKey() {
    if (typeof window === "undefined") return "guest:server";

    const key = `${process.env.NEXT_PUBLIC_APP_NAME ?? "app"}.ide.guest-actor.v1`;

    try {
        const existing = window.localStorage.getItem(key);
        if (existing) return `guest:${existing}`;

        const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        window.localStorage.setItem(key, id);
        return `guest:${id}`;
    } catch {
        return `guest:fallback`;
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
                          access,
                          loginHref,
                          billingHref,
                          initialProjectId,
                          projectTitle,
                          projectDescription,
                          projectScope,
                          exerciseStateKey,
                          router,
                          splitRef,
                          rootRef,
                          editorHostRef,
                          showMobileExplorer,
                          setShowMobileExplorer,
                          services,
                          onBeforeRun,
                          onRunResult,
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
    const [explorerCollapsed, setExplorerCollapsed] = useState(false);
    const [workspaceFileSelectionVersion, setWorkspaceFileSelectionVersion] =
        useState(0);
    const currentWorkspaceRef = useRef(currentWorkspace);

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
            onWorkspaceChange?.(workspace, { origin: "user" });
        },
        [onWorkspaceChange],
    );

    const handleChangeFileCode = useCallback(
        (fileId: string, nextCode: string) => {
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
        [actions, emitImmediateWorkspaceChange],
    );
    const handleChangeStdin = useCallback(
        (nextStdin: string) => {
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
        [actions, emitImmediateWorkspaceChange],
    );
    useEffect(() => {
        currentWorkspaceRef.current = currentWorkspace;
    }, [currentWorkspace]);

    const dirty = useProjectDirtyState(currentWorkspace, language);
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
        access,
        loginHref,
        billingHref,
        routerPush: router.push,
        language,
        sqlDialect,
        currentWorkspace,
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
        showMobileExplorer: services.explorer.enabled && showMobileExplorer,
        forceDesktopLayout,
        rootRef,
        editorHostRef,
        onCloseMobileExplorer: handleCloseMobileExplorer,
    });
    const mobileExplorerAvailable =
        services.explorer.enabled && !viewport.isDesktop;

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
            if (onChangeLanguage) onChangeLanguage(nextLanguage);
            else actions.switchLanguage(nextLanguage);
        },
        [onChangeLanguage, actions],
    );

    const goBack = useCallback(() => {
        router.push("/sandbox");
    }, [router]);
    const applyTerminalSnapshotFiles = useCallback(
        async (
            files: WorkspaceSyncEntry[],
            meta: { dirtyUiPaths: Set<string> },
        ) => {
            const prior = currentWorkspaceRef.current;
            if (!prior) return;

            const nextWorkspace = mergeTerminalSnapshotIntoWorkspace({
                prior,
                snapshotFiles: files,
                dirtyUiPaths: meta.dirtyUiPaths,
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
        [actions, emitImmediateWorkspaceChange],
    );
    const handleOpenWorkspaceFile = useCallback(
        (id: string) => {
            setWorkspaceFileSelectionVersion((version) => version + 1);
            actions.openFile(id);
        },
        [actions],
    );
    const handleSelectWorkspaceTab = useCallback(
        (id: string | null) => {
            if (!id) return;
            setWorkspaceFileSelectionVersion((version) => version + 1);
            actions.setActiveFileId(id);
        },
        [actions],
    );
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
            policy={state.policy}
            onUpgrade={() => router.push(access.hasUser ? billingHref : loginHref)}
            onChangeFilter={actions.setFilter}
            onChangeStdin={handleChangeStdin}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={actions.undo}
            onRedo={actions.redo}
            onToggleExplorer={
                viewport.isDesktop
                    ? () => setExplorerCollapsed(true)
                    : services.explorer.allowMobileDrawer
                        ? handleCloseMobileExplorer
                        : undefined
            }
            services={services}
            actions={{
                setInlineEdit: actions.setInlineEdit,
                setToast: actions.setToast,
                openFile: handleOpenWorkspaceFile,
                toggleFolder: actions.toggleFolder,
                startNewFile: actions.startNewFile,
                startNewFolder: actions.startNewFolder,
                startRename: actions.startRename,
                setEntry: actions.setEntry,
                moveNode: actions.moveNode,
                importExternalFiles: actions.importExternalFiles,
                requestDelete: actions.requestDelete,
                commitInlineEdit: actions.commitInlineEdit,
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
            runnerHeight={runnerHeight}
            title={runnerTitle}
            isSql={isSql}
            language={language}
            sqlDialect={sqlDialect}
            runtime={runnerRuntime}
            services={services}
            onChangeLanguage={setLangUI}
            isAuthenticated={access.hasUser}
            onChangeFileCode={handleChangeFileCode}
            onChangeSqlDialect={setSqlDialect}
            onBeforeRun={onBeforeRun}
            onRunResult={onRunResult}
            onRun={runner.onRunProject}
            setActiveFileId={handleSelectWorkspaceTab}
            workspaceFileSelectionVersion={workspaceFileSelectionVersion}
            closeTab={actions.closeTab}
            isDesktop={viewport.isDesktop}
            projectId={projectSession.projectId}
            exerciseStateKey={exerciseStateKey}
            terminalHistoryScopeKey={terminalHistoryScopeKey}
            onApplyTerminalSnapshotFiles={applyTerminalSnapshotFiles}
            onTerminalSyncReady={onTerminalSyncReady}
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
        if (!pendingDeleteId) return;
        actions.performDelete();
    };

    const handlePrimarySave = () => {
        if (!access.canSaveCloud) {
            router.push(access.hasUser ? billingHref : loginHref);
            return;
        }
        void projectSession.saveProject();
    };

    const handleSaveAsIntent = () => {
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

            <IdeStatusBanners
                loadingProject={projectSession.loadingProject}
                saveError={projectSession.saveError}
            />

            {projectSession.conflictInfo ? (
                <IdeConflictBanner
                    projectTitle={projectSession.conflictInfo.title || headerProjectTitle}
                    serverVersion={projectSession.conflictInfo.serverVersion}
                    clientBaseVersion={projectSession.conflictInfo.clientBaseVersion}
                    serverUpdatedAt={projectSession.conflictInfo.serverUpdatedAt}
                    onReloadCloud={() => void projectSession.reloadProjectFromCloud()}
                    onSaveAsCopy={handleSaveAsIntent}
                    onDismiss={projectSession.dismissConflict}
                />
            ) : null}

            {services.chrome.showHeader ? (
                <IdeHeader
                    isDesktop={viewport.isDesktop}
                    showTopLanguageButtons={services.chrome.showTopLanguageButtons}
                    showBackButton={services.chrome.showBackButton}
                    showMobileFilesButton={mobileExplorerAvailable}
                    showProjectSwitcher={services.projects.showProjectSwitcher}
                    showActivePath={services.chrome.showActivePath}
                    showStatus={services.chrome.showStatus}
                    showSaveControls={services.projects.showSaveControls}
                    showSaveAs={services.projects.showSaveAs}
                    showLessonLink={services.chrome.showLessonLink}
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
                        projectSession.isSavingProject ||
                        projectSession.loadingProject ||
                        !currentWorkspace
                    }
                    saveBusy={projectSession.isSavingProject}
                    saveAsDisabled={projectSession.loadingProject || !currentWorkspace}
                    canSaveCloud={access.canSaveCloud}
                    hasUser={access.hasUser}
                    onSave={handlePrimarySave}
                    onSaveAs={handleSaveAsIntent}
                />
            ) : null}

            <div className="min-h-0 flex-1">
                {services.explorer.enabled && viewport.isDesktop ? (
                    <IdeDesktopLayout
                        splitRef={splitRef}
                        leftPct={leftPct}
                        dividerValue={leftPct}
                        onMouseDownDivider={(e) => actions.onMouseDownDivider(e, splitRef.current)}
                        onPointerDownDivider={(e) => actions.onPointerDownDivider(e, splitRef.current)}
                        onKeyDownDivider={(e) => actions.onKeyDownDivider(e, splitRef.current)}
                        explorerCollapsed={explorerCollapsed}
                        onToggleExplorer={() => setExplorerCollapsed((value) => !value)}
                        showHistoryControls={services.explorer.showHistoryControls}
                        canUndo={history.canUndo}
                        canRedo={history.canRedo}
                        onUndo={actions.undo}
                        onRedo={actions.redo}
                        explorer={explorerPane}
                        editor={editorPane}
                    />
                ) : services.explorer.enabled ? (
                    <IdeMobileLayout
                        open={mobileExplorerAvailable && showMobileExplorer}
                        onOpen={() => setShowMobileExplorer(true)}
                        onClose={handleCloseMobileExplorer}
                        showExplorerRail={mobileExplorerAvailable && !showMobileExplorer}
                        explorer={explorerPane}
                        editor={editorPane}
                    />
                ) : (
                    <div className="h-full min-h-0 min-w-0 overflow-hidden">{editorPane}</div>
                )}
            </div>

            <IdeProjectModals
                showDeleteModal={services.explorer.showActions}
                showProjects={showProjectsUi}
                showSaveAs={services.projects.showSaveAs}
                showRename={services.projects.showCloudProjects}
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
        storageKey = `${process.env.NEXT_PUBLIC_APP_NAME}.ide.workspace.v2`,
        language: forcedLanguage,
        onChangeLanguage,
        resetOnForcedLanguageChange = false,
        showTopLanguageButtons = true,
        lessonHref,
        lessonLabel = "Lesson",
        access,
        loginHref,
        billingHref = "/billing",
        initialProjectId = null,
        projectTitle,
        projectDescription = null,
        projectScope,
        draftStorageMode = "local",
        onReadyChange,
        servicePreset,
        services: serviceOverrides,
        initialWorkspace,
        externalWorkspace,
        onWorkspaceChange,
        onTerminalEvidenceChange,
        onTerminalSyncReady,
        onBeforeRun,
        onRunResult,
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

    const router = useRouter();
    const { data: session } = useSession();

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
        setGuestActorKey(getOrCreateGuestActorKey());
    }, [access.hasUser]);

    const actorKey = useMemo(() => {
        if (access.hasUser) {
            return session?.user?.id ? `user:${session.user.id}` : "user:pending";
        }
        return guestActorKey;
    }, [access.hasUser, session?.user?.id, guestActorKey]);

    const actorReady = access.hasUser
        ? !!session?.user?.id
        : guestActorKey !== "guest:pending";

    const scopeKey = useMemo(() => buildScopeKey(projectScope), [projectScope]);

    const normalizedLoginHref = useMemo(
        () => hrefToString(loginHref, "/authenticate"),
        [loginHref],
    );

    const localWorkspaceId = useMemo(
        () =>
            buildLocalWorkspaceIdSeed({
                projectScope,
                forcedLanguage,
            }),
        [projectScope, forcedLanguage],
    );

    const scopedStorageKey = useMemo(() => {
        return `${storageKey}:${scopeKey ?? "global"}`;
    }, [storageKey, scopeKey]);

    const requestedDraftStorageMode = (draftStorageMode ?? "local") as "off" | "local";
    const effectiveDraftStorageMode = actorReady ? requestedDraftStorageMode : "off";

    const services = useMemo(
        () =>
            resolveFullIDEServices({
                preset: servicePreset ?? "runner",
                showTopLanguageButtons,
                overrides: serviceOverrides,
            }),
        [serviceOverrides, servicePreset, showTopLanguageButtons],
    );

    const workspace = useIdeWorkspace({
        storageKey: scopedStorageKey,
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
    });

    const externalWorkspaceControlKey = useMemo(
        () => workspaceNotifyKey(externalWorkspace),
        [externalWorkspace],
    );
    const hasExternalWorkspaceProp = typeof externalWorkspace !== "undefined";
    const initialWorkspaceControlKey = useMemo(
        () => workspaceNotifyKey(initialWorkspace),
        [initialWorkspace],
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

    const replaceWorkspaceActionRef = useRef(workspace.actions.replaceWorkspace);
    const resetWorkspaceForLanguageActionRef = useRef(workspace.actions.resetWorkspaceForLanguage);
    const workspaceLanguageRef = useRef(workspace.state.language);

    useEffect(() => {
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
    const externalWorkspaceRef = useRef(externalWorkspace);
    const initialWorkspaceRef = useRef(initialWorkspace);
    const currentWorkspaceJsonRef = useRef(currentWorkspaceJson);
    const currentWorkspaceNotifyKeyRef = useRef(currentWorkspaceNotifyKey);

    useEffect(() => {
        externalWorkspaceRef.current = externalWorkspace;
        initialWorkspaceRef.current = initialWorkspace;
    }, [externalWorkspace, initialWorkspace]);

    useEffect(() => {
        currentWorkspaceJsonRef.current = currentWorkspaceJson;
        currentWorkspaceNotifyKeyRef.current = currentWorkspaceNotifyKey;
    }, [currentWorkspaceJson, currentWorkspaceNotifyKey]);

    useEffect(() => {
        if (!hasExternalWorkspaceProp) return;

        const applyKey = `${externalWorkspaceControlKey}::initial:${initialWorkspaceControlKey}`;
        if (lastAppliedExternalWorkspaceJsonRef.current === applyKey) return;

        const nextWorkspace =
            externalWorkspaceRef.current ?? initialWorkspaceRef.current ?? null;

        const nextNotifyKey = workspaceNotifyKey(nextWorkspace);

        lastAppliedExternalWorkspaceJsonRef.current = applyKey;

        if (nextWorkspace) {
            if (nextNotifyKey !== currentWorkspaceNotifyKeyRef.current) {
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
        externalWorkspaceControlKey,
        initialWorkspaceControlKey,
        forcedLanguage,
    ]);

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

        lastNotifiedWorkspaceKeyRef.current = currentKey;
        onWorkspaceChange?.(current, { origin: "sync" });
    }, [onWorkspaceChange, workspace.derived.currentWorkspace, currentWorkspaceNotifyKey]);
    const sessionRemountKey = useMemo(
        () =>
            [
                actorKey,
                workspace.state.language,
                initialProjectId ?? "local",
                scopeKey ?? "global",
                props.exerciseStateKey ?? "none",
            ].join("::"),
        [actorKey, workspace.state.language, initialProjectId, scopeKey, props.exerciseStateKey],
    );

    const isIdeReady = !!(
        actorReady &&
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
            <FullIDEInner
                key={sessionRemountKey}
                actorKey={actorKey}
                title={title}
                height={height}
                fullHeight={fullHeight}
                lessonHref={lessonHref}
                lessonLabel={lessonLabel}
                access={access}
                loginHref={normalizedLoginHref}
                billingHref={billingHref}
                initialProjectId={initialProjectId}
                projectTitle={projectTitle}
                projectDescription={projectDescription}
                projectScope={projectScope}
                exerciseStateKey={props.exerciseStateKey}
                router={router}
                splitRef={splitRef}
                rootRef={rootRef}
                editorHostRef={editorHostRef}
                showMobileExplorer={showMobileExplorer}
                setShowMobileExplorer={setShowMobileExplorer}
                services={services}
                onBeforeRun={onBeforeRun}
                onRunResult={onRunResult}
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
                onWorkspaceChange={onWorkspaceChange}
                onTerminalEvidenceChange={onTerminalEvidenceChange}
                onTerminalSyncReady={onTerminalSyncReady}
            />
        </div>
    );
}
