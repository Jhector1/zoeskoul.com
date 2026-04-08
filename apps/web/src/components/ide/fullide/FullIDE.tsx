"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import { useProjectDirtyState } from "@/components/code/projects/hooks/useProjectDirtyState";
import { useProjectsList } from "@/components/code/projects/hooks/useProjectsList";

import { pathOf } from "../fsTree";
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
import type { FullIDEProps } from "../types";
import { CodeRunnerRuntime, ExecutionBackend } from "@/components/code/runner/runtime";

type WorkspaceHookResult = ReturnType<typeof useIdeWorkspace>;

type FullIDEInnerProps = {
    actorKey: string;
    title: string;
    height: number;
    lessonHref?: string;
    lessonLabel: string;
    access: FullIDEProps["access"];
    loginHref: string;
    billingHref: string;
    initialProjectId: string | null;
    projectTitle?: string | null;
    projectDescription?: string | null;
    projectScope: FullIDEProps["projectScope"];
    showTopLanguageButtons: boolean;
    router: ReturnType<typeof useRouter>;
    splitRef: React.RefObject<HTMLDivElement | null>;
    editorHostRef: React.RefObject<HTMLDivElement | null>;
    showMobileExplorer: boolean;
    setShowMobileExplorer: React.Dispatch<React.SetStateAction<boolean>>;
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
                          lessonHref,
                          lessonLabel,
                          access,
                          loginHref,
                          billingHref,
                          initialProjectId,
                          projectTitle,
                          projectDescription,
                          projectScope,
                          showTopLanguageButtons,
                          router,
                          splitRef,
                          editorHostRef,
                          showMobileExplorer,
                          setShowMobileExplorer,
                          sqlDialect,
                          setSqlDialect,
                          onChangeLanguage,
                          state,
                          derived,
                          history,
                          actions,
                      }: FullIDEInnerProps) {
    const {
        language,
        nodes,
        activeFileId,
        entryFileId,
        stdin,
        expanded,
        leftPct,
        filter,
        inlineEdit,
        pendingDeleteId,
        toast,
    } = state;

    const { activeFile, entryFile, tabFiles, currentWorkspace } = derived;

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

    const viewport = useIdeViewport({
        height,
        activeFileId,
        showMobileExplorer,
        editorHostRef,
        onCloseMobileExplorer: () => setShowMobileExplorer(false),
    });

    const isSql = language === "sql";

    const codeBackend: ExecutionBackend = isSql ? "judge0" : "pty";

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
        canUseMultiFile: access.canUseMultiFile,
        backend: runnerRuntime.backend,
    });

    const runnerHeight = Math.max(
        viewport.isDesktop ? 360 : 320,
        viewport.editorHeight || height,
    );

    const upgradeText = !access.hasUser
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

    const explorerPane = (
        <IdeExplorerPane
            isSql={isSql}
            sqlDialect={sqlDialect}
            entryPath={entryFile ? pathOf(nodes, entryFile.id) : "—"}
            upgradeText={upgradeText}
            filter={filter}
            nodes={nodes}
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
            onChangeStdin={actions.setStdin}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={actions.undo}
            onRedo={actions.redo}
            actions={{
                setInlineEdit: actions.setInlineEdit,
                setToast: actions.setToast,
                openFile: actions.openFile,
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

    const editorPane = (
        <IdeEditorPane
            panelRef={editorHostRef}
            nodes={nodes}
            tabFiles={tabFiles}
            activeFileId={activeFileId}
            activeFile={activeFile}
            runnerHeight={runnerHeight}
            title={runnerTitle}
            isSql={isSql}
            language={language}
            sqlDialect={sqlDialect}
            runtime={runnerRuntime}
            onChangeLanguage={setLangUI}
            isAuthenticated={access.hasUser}
            onChangeCode={actions.onChangeCode}
            onChangeSqlDialect={setSqlDialect}
            onRun={runner.onRunProject}
            setActiveFileId={(id) => actions.setActiveFileId(id ?? "")}
            closeTab={actions.closeTab}
            isDesktop={viewport.isDesktop}
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

            <IdeHeader
                isDesktop={viewport.isDesktop}
                showTopLanguageButtons={showTopLanguageButtons}
                language={language}
                sqlDialect={sqlDialect}
                onChangeSqlDialect={setSqlDialect}
                onChangeLanguage={setLangUI}
                onBack={goBack}
                onOpenFiles={() => setShowMobileExplorer(true)}
                onOpenProjects={() => projectSession.setProjectsOpen(true)}
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

            <div className="min-h-0 flex-1">
                {viewport.isDesktop ? (
                    <IdeDesktopLayout
                        splitRef={splitRef}
                        leftPct={leftPct}
                        dividerValue={leftPct}
                        onMouseDownDivider={(e) => actions.onMouseDownDivider(e, splitRef.current)}
                        onPointerDownDivider={(e) => actions.onPointerDownDivider(e, splitRef.current)}
                        onKeyDownDivider={(e) => actions.onKeyDownDivider(e, splitRef.current)}
                        explorer={explorerPane}
                        editor={editorPane}
                    />
                ) : (
                    <IdeMobileLayout
                        open={showMobileExplorer}
                        onClose={() => setShowMobileExplorer(false)}
                        explorer={explorerPane}
                        editor={editorPane}
                    />
                )}
            </div>

            <IdeProjectModals
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
    } = props;

    const router = useRouter();
    const { data: session } = useSession();

    const splitRef = useRef<HTMLDivElement | null>(null);
    const editorHostRef = useRef<HTMLDivElement | null>(null);

    const [showMobileExplorer, setShowMobileExplorer] = useState(false);
    const [sqlDialect, setSqlDialect] = useState(DEFAULT_SQL_DIALECT);
    const [guestActorKey, setGuestActorKey] = useState<string>("guest:pending");

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

    const workspace = useIdeWorkspace({
        storageKey: scopedStorageKey,
        forcedLanguage,
        resetOnForcedLanguageChange,
        access,
        actorKey,
        projectId: draftStorageMode === "local" ? null : initialProjectId,
        scopeKey,
        draftStorageMode: (draftStorageMode ?? "local") as "off" | "local",
        localWorkspaceId,
    });

    const sessionRemountKey = useMemo(
        () =>
            [
                actorKey,
                workspace.state.language,
                initialProjectId ?? "local",
                scopeKey ?? "global",
            ].join("::"),
        [actorKey, workspace.state.language, initialProjectId, scopeKey],
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
                lessonHref={lessonHref}
                lessonLabel={lessonLabel}
                access={access}
                loginHref={normalizedLoginHref}
                billingHref={billingHref}
                initialProjectId={initialProjectId}
                projectTitle={projectTitle}
                projectDescription={projectDescription}
                projectScope={projectScope}
                showTopLanguageButtons={showTopLanguageButtons}
                router={router}
                splitRef={splitRef}
                editorHostRef={editorHostRef}
                showMobileExplorer={showMobileExplorer}
                setShowMobileExplorer={setShowMobileExplorer}
                sqlDialect={sqlDialect}
                setSqlDialect={setSqlDialect}
                onChangeLanguage={onChangeLanguage}
                history={workspace.history}
                state={workspace.state}
                derived={workspace.derived}
                actions={workspace.actions}
            />
        </div>
    );
}