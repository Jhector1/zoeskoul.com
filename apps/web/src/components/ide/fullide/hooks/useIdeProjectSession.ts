"use client";

import {useCallback, useEffect, useRef, useState} from "react";

import type {
    ProjectConflictResponse,
    SaveProjectRequest,
} from "@/lib/projects/projectApiTypes";
import {
    buildSingleFileWorkspace,
    createDefaultStateForLanguage,
} from "@/components/ide/workspaceHook/workspace.normalization";

import {pathOf} from "../../fsTree";
import type {
    PersistProjectResult,
    ProjectSessionApi,
    UseIdeProjectSessionArgs,
} from "../../types";

type LocalProjectSessionMeta = {
    projectId: string | null;
    currentProjectName: string;
    lastSavedAt: string | null;
    baseVersion: number | null;
    clientInstanceId: string;
};

type ProjectConflictInfo = {
    projectId: string;
    clientBaseVersion: number | null;
    serverVersion: number;
    serverUpdatedAt: string;
    title: string;
};

type ProjectIdSource = "route" | "session" | null;

function stableScopeKey(scope: unknown) {
    if (!scope || typeof scope !== "object") return String(scope ?? "global");

    return Object.entries(scope as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${String(v ?? "")}`)
        .join("|");
}

function projectSessionStorageKey(args: {
    actorKey: string;
    projectScope: unknown;
    language: string;
}) {
    const actor = args.actorKey.trim() || "anonymous";
    const scope = stableScopeKey(args.projectScope) || "global";
    return `full-ide:project-session:v7:${actor}:${scope}:${args.language}`;
}

function ensureBrowserInstanceId(key: string) {
    if (typeof window === "undefined") return "server";

    try {
        const raw = window.localStorage.getItem(key);
        if (raw) return raw;

        const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        window.localStorage.setItem(key, id);
        return id;
    } catch {
        return `browser-${Date.now()}`;
    }
}

function readProjectSessionMeta(key: string): LocalProjectSessionMeta | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<LocalProjectSessionMeta>;

        return {
            projectId: typeof parsed.projectId === "string" ? parsed.projectId : null,
            currentProjectName:
                typeof parsed.currentProjectName === "string"
                    ? parsed.currentProjectName
                    : "",
            lastSavedAt:
                typeof parsed.lastSavedAt === "string" ? parsed.lastSavedAt : null,
            baseVersion:
                typeof parsed.baseVersion === "number" ? parsed.baseVersion : null,
            clientInstanceId:
                typeof parsed.clientInstanceId === "string"
                    ? parsed.clientInstanceId
                    : "",
        };
    } catch {
        return null;
    }
}

function writeProjectSessionMeta(key: string, meta: LocalProjectSessionMeta) {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(key, JSON.stringify(meta));
    } catch {
    }
}

function clearProjectSessionMeta(key: string) {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.removeItem(key);
    } catch {
    }
}

export function useIdeProjectSession({
                                         actorKey,
                                         title,
                                         projectTitle,
                                         projectDescription = null,
                                         projectScope,
                                         initialProjectId = null,
                                         access,
                                         loginHref,
                                         billingHref,
                                         routerPush,
                                         language,
                                         sqlDialect,
                                         currentWorkspace,
                                         nodes,
                                         activeFile,
                                         entryFile,
                                         replaceWorkspace,
                                         markLoaded,
                                         markSaved,
                                         clearSavedBaseline,
                                         isDirty,
                                         resetWorkspaceForLanguage,
                                         setToast,
                                         refreshProjects,
                                     }: UseIdeProjectSessionArgs): ProjectSessionApi & {
    conflictInfo: ProjectConflictInfo | null;
    dismissConflict: () => void;
    reloadProjectFromCloud: () => Promise<void>;
} {
    const loadedProjectIdRef = useRef<string | null>(null);
    const loadSeqRef = useRef(0);
    const loadAbortRef = useRef<AbortController | null>(null);
    const projectIdSourceRef = useRef<ProjectIdSource>(null);

    const sessionKey = projectSessionStorageKey({
        actorKey,
        projectScope,
        language,
    });
    const browserInstanceKey = `${sessionKey}:browser-instance`;

    const [projectId, setProjectId] = useState<string | null>(initialProjectId);
    const [currentProjectName, setCurrentProjectName] = useState(
        projectTitle ?? title,
    );
    const [loadingProject, setLoadingProject] = useState(false);
    const [isSavingProject, setIsSavingProject] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [baseVersion, setBaseVersion] = useState<number | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [conflictInfo, setConflictInfo] = useState<ProjectConflictInfo | null>(
        null,
    );

    const [projectsOpen, setProjectsOpen] = useState(false);
    const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);
    const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
    const [pendingStartBlank, setPendingStartBlank] = useState(false);

    const [renameOpen, setRenameOpen] = useState(false);
    const [saveAsOpen, setSaveAsOpen] = useState(false);
    const [renamingProject, setRenamingProject] = useState<any | null>(null);
    const [projectModalBusy, setProjectModalBusy] = useState(false);

    const [clientInstanceId, setClientInstanceId] = useState("browser");
    const [hydratedSessionKey, setHydratedSessionKey] = useState<string | null>(
        null,
    );

    const goToUpgrade = useCallback(() => {
        routerPush(access.hasUser ? billingHref : loginHref);
    }, [routerPush, access.hasUser, billingHref, loginHref]);

    const persistLocalMeta = useCallback(
        (next: {
            projectId: string | null;
            currentProjectName: string;
            lastSavedAt: string | null;
            baseVersion: number | null;
        }) => {
            writeProjectSessionMeta(sessionKey, {
                ...next,
                clientInstanceId:
                    clientInstanceId || ensureBrowserInstanceId(browserInstanceKey),
            });
        },
        [sessionKey, clientInstanceId, browserInstanceKey],
    );

    const resetLanguageScopedProjectState = useCallback(
        (opts?: { keepProjectsOpen?: boolean; keepSaveError?: boolean }) => {
            loadedProjectIdRef.current = null;
            projectIdSourceRef.current = null;
            setProjectId(null);
            setCurrentProjectName(projectTitle ?? title);
            setLastSavedAt(null);
            setBaseVersion(null);
            setConflictInfo(null);
            setPendingProjectId(null);
            setPendingStartBlank(false);

            if (!opts?.keepSaveError) {
                setSaveError(null);
            }

            if (!opts?.keepProjectsOpen) {
                setProjectsOpen(false);
            }
        },
        [projectTitle, title],
    );

    const detachMissingProject = useCallback(
        (message: string) => {
            loadedProjectIdRef.current = null;
            projectIdSourceRef.current = null;
            setProjectId(null);
            setCurrentProjectName(projectTitle ?? title);
            setLastSavedAt(null);
            setBaseVersion(null);
            setConflictInfo(null);
            setPendingProjectId(null);
            setPendingStartBlank(false);
            clearProjectSessionMeta(sessionKey);
            clearSavedBaseline();
            setSaveError(message);
            setToast({kind: "error", text: message});
        },
        [projectTitle, title, sessionKey, clearSavedBaseline, setToast],
    );

    const dismissConflict = useCallback(() => {
        setConflictInfo(null);
        setSaveError(null);
    }, []);

    const handleProjectApiFailure = useCallback(
        async (res: Response) => {
            let data: any = null;
            try {
                data = await res.json();
            } catch {
            }

            if (res.status === 409 && data?.code === "PROJECT_CONFLICT") {
                const conflict = data as ProjectConflictResponse;

                setConflictInfo({
                    projectId: conflict.conflict.projectId,
                    clientBaseVersion: conflict.conflict.clientBaseVersion,
                    serverVersion: conflict.conflict.serverVersion,
                    serverUpdatedAt: conflict.conflict.serverUpdatedAt,
                    title: conflict.conflict.title,
                });

                const message = "A newer cloud version exists. Your local draft was kept.";
                setSaveError(message);
                setToast({kind: "error", text: message});
                return conflict;
            }

            const message =
                data?.error ??
                data?.message ??
                (res.status === 401
                    ? "Sign in required."
                    : res.status === 402
                        ? "Subscription required."
                        : "Project request failed.");

            setSaveError(message);
            setToast({kind: "error", text: message});

            if (res.status === 401 || res.status === 402) {
                goToUpgrade();
            }

            return null;
        },
        [setToast, goToUpgrade],
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        setHydratedSessionKey(null);

        const ensuredBrowserId = ensureBrowserInstanceId(browserInstanceKey);
        setClientInstanceId(ensuredBrowserId);

        if (initialProjectId) {
            projectIdSourceRef.current = "route";
            loadedProjectIdRef.current = null;
            setProjectId(initialProjectId);
            setCurrentProjectName(projectTitle ?? title);
            setLastSavedAt(null);
            setBaseVersion(null);
            setConflictInfo(null);
            setPendingProjectId(null);
            setPendingStartBlank(false);
            setHydratedSessionKey(sessionKey);
            return;
        }

        const meta = readProjectSessionMeta(sessionKey);

        if (meta) {
            projectIdSourceRef.current = "session";
            loadedProjectIdRef.current = null;
            setProjectId(meta.projectId ?? null);
            setCurrentProjectName(meta.currentProjectName || projectTitle || title);
            setLastSavedAt(meta.lastSavedAt ?? null);
            setBaseVersion(meta.baseVersion ?? null);
            setConflictInfo(null);
            setPendingProjectId(null);
            setPendingStartBlank(false);
        } else {
            projectIdSourceRef.current = null;
            resetLanguageScopedProjectState({keepProjectsOpen: true});
        }

        setHydratedSessionKey(sessionKey);
    }, [
        initialProjectId,
        sessionKey,
        browserInstanceKey,
        projectTitle,
        title,
        resetLanguageScopedProjectState,
    ]);

    useEffect(() => {
        if (hydratedSessionKey !== sessionKey) return;

        persistLocalMeta({
            projectId,
            currentProjectName,
            lastSavedAt,
            baseVersion,
        });
    }, [
        hydratedSessionKey,
        sessionKey,
        persistLocalMeta,
        projectId,
        currentProjectName,
        lastSavedAt,
        baseVersion,
    ]);

    // Local terminal sync is handled directly by the workspace terminal controller now.
    // Keep this no-op only to avoid breaking older type contracts while removing the cloud-sync path.
    const syncTerminalFiles = useCallback(
        async (_sessionId: string): Promise<boolean> => false,
        [],
    );

    useEffect(() => {
        return () => {
            loadAbortRef.current?.abort();
        };
    }, []);

    const loadProjectFromCloud = useCallback(
        async (
            targetProjectId: string,
            options?: {
                forceReplaceLocal?: boolean;
            },
        ) => {
            if (!access.canSaveCloud) return false;

            const seq = ++loadSeqRef.current;

            loadAbortRef.current?.abort();
            const controller = new AbortController();
            loadAbortRef.current = controller;

            try {
                setLoadingProject(true);
                setSaveError(null);

                const res = await fetch(
                    `/api/ide/projects/${encodeURIComponent(targetProjectId)}`,
                    {
                        method: "GET",
                        cache: "no-store",
                        signal: controller.signal,
                    },
                );

                if (seq !== loadSeqRef.current) return false;

                if (res.status === 404) {
                    detachMissingProject(
                        "This saved project no longer exists. Your local draft was kept. Save it as a new project.",
                    );
                    return false;
                }

                if (!res.ok) {
                    await handleProjectApiFailure(res);
                    return false;
                }

                const data = await res.json();

                if (seq !== loadSeqRef.current) return false;

                if (data?.project?.language && data.project.language !== language) {
                    if (projectId === targetProjectId) {
                        clearProjectSessionMeta(sessionKey);
                        resetLanguageScopedProjectState({
                            keepProjectsOpen: true,
                            keepSaveError: true,
                        });
                    }

                    setSaveError(
                        `"${data.project.title}" is a ${data.project.language} project. Switch to ${data.project.language} to open it.`,
                    );

                    setToast({
                        kind: "error",
                        text: `This project belongs to ${data.project.language}.`,
                    });

                    return false;
                }

                const remoteVersion =
                    typeof data?.project?.currentVersion === "number"
                        ? data.project.currentVersion
                        : null;

                const sameProject = projectId === targetProjectId;

                const remoteIsNewer =
                    sameProject &&
                    typeof remoteVersion === "number" &&
                    typeof baseVersion === "number" &&
                    remoteVersion > baseVersion;

                if (!options?.forceReplaceLocal && isDirty && remoteIsNewer) {
                    setConflictInfo({
                        projectId: data.project.id,
                        clientBaseVersion: baseVersion,
                        serverVersion: remoteVersion,
                        serverUpdatedAt: data.project.updatedAt,
                        title: data.project.title,
                    });

                    setPendingProjectId(data.project.id);
                    setPendingStartBlank(false);

                    const message = "A newer cloud version exists. Your local draft was kept.";
                    setSaveError(message);
                    setToast({
                        kind: "error",
                        text: "Cloud version is newer. Local draft kept.",
                    });
                    return false;
                }

                replaceWorkspace(data.project.workspace);
                markLoaded(data.project.workspace);

                loadedProjectIdRef.current = data.project.id;
                projectIdSourceRef.current = "session";
                setProjectId(data.project.id);
                setCurrentProjectName(data.project.title);
                setLastSavedAt(data.project.updatedAt);
                setBaseVersion(data.project.currentVersion ?? null);
                setConflictInfo(null);
                setPendingProjectId(null);
                setPendingStartBlank(false);

                persistLocalMeta({
                    projectId: data.project.id,
                    currentProjectName: data.project.title,
                    lastSavedAt: data.project.updatedAt,
                    baseVersion: data.project.currentVersion ?? null,
                });

                return true;
            } catch (e: any) {
                if (e?.name === "AbortError") return false;

                const message = e?.message ?? "Failed to load project.";
                setSaveError(message);
                setToast({kind: "error", text: message});
                return false;
            } finally {
                if (seq === loadSeqRef.current) {
                    setLoadingProject(false);
                }
            }
        },
        [
            access.canSaveCloud,
            handleProjectApiFailure,
            detachMissingProject,
            language,
            projectId,
            baseVersion,
            isDirty,
            replaceWorkspace,
            markLoaded,
            persistLocalMeta,
            resetLanguageScopedProjectState,
            sessionKey,
            setToast,
        ],
    );

    useEffect(() => {
        if (!projectId) return;
        if (!access.canSaveCloud) return;
        if (hydratedSessionKey !== sessionKey) return;
        if (loadedProjectIdRef.current === projectId) return;

        if (projectIdSourceRef.current !== "route") return;

        void loadProjectFromCloud(projectId);
    }, [
        projectId,
        access.canSaveCloud,
        hydratedSessionKey,
        sessionKey,
        loadProjectFromCloud,
    ]);

    const reloadProjectFromCloud = useCallback(async () => {
        const targetProjectId = conflictInfo?.projectId ?? projectId;
        if (!targetProjectId) return;

        await loadProjectFromCloud(targetProjectId, {forceReplaceLocal: true});
    }, [conflictInfo?.projectId, projectId, loadProjectFromCloud]);

    const persistProject = useCallback(
        async (args?: {
            targetProjectId?: string | null;
            forcedTitle?: string | null;
            createRevision?: boolean;
        }): Promise<PersistProjectResult> => {
            if (!currentWorkspace) {
                setToast({kind: "error", text: "Nothing to save yet."});
                return {ok: false};
            }

            if (!access.canSaveCloud) {
                goToUpgrade();
                return {ok: false};
            }

            const localMeta = readProjectSessionMeta(sessionKey);
            const targetProjectId =
                args?.targetProjectId ?? projectId ?? localMeta?.projectId ?? null;

            const titleToUse =
                args?.forcedTitle?.trim() ||
                currentProjectName ||
                localMeta?.currentProjectName ||
                projectTitle ||
                title;

            const body: SaveProjectRequest = {
                title: titleToUse,
                description: projectDescription,
                language,
                workspace: currentWorkspace,
                entryPath: entryFile ? pathOf(nodes, entryFile.id) : null,
                activePath: activeFile ? pathOf(nodes, activeFile.id) : null,
                visibility: "private",
                scope: projectScope,
                createRevision: args?.createRevision ?? true,
                revisionNote: targetProjectId ? "Manual save" : "Created from Save As",
                settings: {sqlDialect},
                meta: {source: "full-ide"},
                baseVersion: targetProjectId
                    ? (baseVersion ?? localMeta?.baseVersion ?? null)
                    : null,
                clientInstanceId,
                clientDraftUpdatedAt: new Date().toISOString(),
            };

            try {
                setIsSavingProject(true);
                setSaveError(null);

                const res = await fetch(
                    targetProjectId
                        ? `/api/ide/projects/${encodeURIComponent(targetProjectId)}`
                        : "/api/ide/projects",
                    {
                        method: targetProjectId ? "PATCH" : "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(body),
                    },
                );

                if (res.status === 404 && targetProjectId) {
                    detachMissingProject(
                        "This saved project no longer exists. Your local draft was kept. Save it as a new project.",
                    );
                    return {ok: false};
                }

                if (!res.ok) {
                    await handleProjectApiFailure(res);
                    return {ok: false};
                }

                const data = await res.json();
                return {ok: true, data};
            } catch (e: any) {
                const message = e?.message ?? "Failed to save project.";
                setSaveError(message);
                setToast({kind: "error", text: message});
                return {ok: false};
            } finally {
                setIsSavingProject(false);
            }
        },
        [
            currentWorkspace,
            access.canSaveCloud,
            goToUpgrade,
            projectId,
            currentProjectName,
            projectTitle,
            title,
            projectDescription,
            language,
            entryFile,
            activeFile,
            nodes,
            projectScope,
            sqlDialect,
            handleProjectApiFailure,
            detachMissingProject,
            setToast,
            sessionKey,
            baseVersion,
            clientInstanceId,
        ],
    );

    const saveProject = useCallback(async (): Promise<boolean> => {
        const workspaceToSave = currentWorkspace;

        if (!workspaceToSave) {
            setToast({kind: "error", text: "Nothing to save yet."});
            return false;
        }

        if (loadingProject) {
            setToast({
                kind: "error",
                text: "Finish opening the project before saving.",
            });
            return false;
        }

        const localMeta = readProjectSessionMeta(sessionKey);
        const effectiveProjectId = projectId ?? localMeta?.projectId ?? null;
        const effectiveProjectName =
            currentProjectName ||
            localMeta?.currentProjectName ||
            projectTitle ||
            title;

        const result = await persistProject({
            targetProjectId: effectiveProjectId,
            forcedTitle: effectiveProjectName,
            createRevision: true,
        });

        if (!result.ok) return false;

        const data = result.data;
        const nextName =
            data.project.title ?? effectiveProjectName ?? projectTitle ?? title;
        const nextVersion =
            typeof data.project.currentVersion === "number"
                ? data.project.currentVersion
                : null;

        loadedProjectIdRef.current = data.project.id;
        projectIdSourceRef.current = "session";
        setProjectId(data.project.id);
        setCurrentProjectName(nextName);
        setLastSavedAt(data.project.updatedAt);
        setBaseVersion(nextVersion);
        setConflictInfo(null);
        setPendingProjectId(null);
        setPendingStartBlank(false);

        persistLocalMeta({
            projectId: data.project.id,
            currentProjectName: nextName,
            lastSavedAt: data.project.updatedAt ?? null,
            baseVersion: nextVersion,
        });

        markSaved(workspaceToSave);
        setToast({kind: "success", text: "Project saved."});
        void refreshProjects();
        return true;
    }, [
        currentWorkspace,
        loadingProject,
        sessionKey,
        projectId,
        currentProjectName,
        projectTitle,
        title,
        persistProject,
        persistLocalMeta,
        markSaved,
        refreshProjects,
        setToast,
    ]);

    const saveAsProject = useCallback(
        async (nextTitle: string) => {
            const workspaceToSave = currentWorkspace;
            if (!workspaceToSave) {
                setToast({kind: "error", text: "Nothing to save yet."});
                return false;
            }

            const result = await persistProject({
                targetProjectId: null,
                forcedTitle: nextTitle,
                createRevision: true,
            });

            if (!result.ok) return false;

            const data = result.data;
            const nextVersion =
                typeof data.project.currentVersion === "number"
                    ? data.project.currentVersion
                    : null;
            const nextName = data.project.title ?? nextTitle;

            loadedProjectIdRef.current = data.project.id;
            projectIdSourceRef.current = "session";
            setProjectId(data.project.id);
            setCurrentProjectName(nextName);
            setLastSavedAt(data.project.updatedAt);
            setBaseVersion(nextVersion);
            setConflictInfo(null);
            setPendingProjectId(null);
            setPendingStartBlank(false);

            persistLocalMeta({
                projectId: data.project.id,
                currentProjectName: nextName,
                lastSavedAt: data.project.updatedAt ?? null,
                baseVersion: nextVersion,
            });

            markSaved(workspaceToSave);
            setToast({kind: "success", text: "Project saved as a new project."});
            setSaveAsOpen(false);
            void refreshProjects();
            return true;
        },
        [
            currentWorkspace,
            persistProject,
            persistLocalMeta,
            markSaved,
            refreshProjects,
            setToast,
        ],
    );

    const renameProject = useCallback(
        async (nextTitle: string) => {
            if (!renamingProject) return false;

            try {
                setProjectModalBusy(true);

                const res = await fetch(
                    `/api/ide/projects/${encodeURIComponent(renamingProject.id)}/meta`,
                    {
                        method: "PATCH",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                            title: nextTitle,
                            baseVersion,
                        }),
                    },
                );

                const data = await res.json().catch(() => null);

                if (res.status === 404 && projectId === renamingProject.id) {
                    detachMissingProject(
                        "This saved project no longer exists. Your local draft was kept. Save it as a new project.",
                    );
                    return false;
                }

                if (!res.ok) {
                    if (data?.code === "PROJECT_CONFLICT") {
                        setConflictInfo({
                            projectId: data.conflict.projectId,
                            clientBaseVersion: data.conflict.clientBaseVersion,
                            serverVersion: data.conflict.serverVersion,
                            serverUpdatedAt: data.conflict.serverUpdatedAt,
                            title: data.conflict.title,
                        });
                    }

                    throw new Error(
                        data?.code === "PROJECT_CONFLICT"
                            ? "A newer cloud version exists. Save your local draft as a copy or reload the cloud version."
                            : data?.error ?? "Failed to rename project.",
                    );
                }

                if (projectId === renamingProject.id) {
                    setCurrentProjectName(data?.project?.title ?? nextTitle);
                    if (data?.project?.updatedAt) setLastSavedAt(data.project.updatedAt);
                    if (typeof data?.project?.currentVersion === "number") {
                        setBaseVersion(data.project.currentVersion);
                    }

                    persistLocalMeta({
                        projectId,
                        currentProjectName: data?.project?.title ?? nextTitle,
                        lastSavedAt: data?.project?.updatedAt ?? lastSavedAt ?? null,
                        baseVersion:
                            typeof data?.project?.currentVersion === "number"
                                ? data.project.currentVersion
                                : baseVersion,
                    });
                }

                setRenameOpen(false);
                setRenamingProject(null);
                setToast({kind: "success", text: "Project renamed."});
                void refreshProjects();
                return true;
            } catch (e: any) {
                setToast({
                    kind: "error",
                    text: e?.message ?? "Failed to rename project.",
                });
                return false;
            } finally {
                setProjectModalBusy(false);
            }
        },
        [
            renamingProject,
            projectId,
            baseVersion,
            lastSavedAt,
            persistLocalMeta,
            detachMissingProject,
            refreshProjects,
            setToast,
        ],
    );

    const executeStartBlankProject = useCallback(() => {
        const base = createDefaultStateForLanguage(language);
        const blankWorkspace =
            language === "web"||language=="sql"
                ? base
                : access.canUseMultiFile
                    ? base
                    : buildSingleFileWorkspace(language, base);

        if (typeof resetWorkspaceForLanguage === "function") {
            resetWorkspaceForLanguage(language);
        } else {
            replaceWorkspace(blankWorkspace);
        }

        clearProjectSessionMeta(sessionKey);
        resetLanguageScopedProjectState();
        clearSavedBaseline();
        setToast({ kind: "success", text: "Started a new local project." });
    }, [
        access.canUseMultiFile,
        language,
        resetWorkspaceForLanguage,
        replaceWorkspace,
        sessionKey,
        resetLanguageScopedProjectState,
        clearSavedBaseline,
        setToast,
    ]);

    const startBlankProject = useCallback(() => {
        if (isDirty) {
            setPendingProjectId(null);
            setPendingStartBlank(true);
            setConfirmSwitchOpen(true);
            return;
        }

        executeStartBlankProject();
    }, [isDirty, executeStartBlankProject]);

    const requestOpenProject = useCallback(
        (nextProjectId: string) => {
            if (nextProjectId === projectId) {
                if (isDirty) {
                    setPendingStartBlank(false);
                    setPendingProjectId(nextProjectId);
                    setConfirmSwitchOpen(true);
                    return;
                }

                void loadProjectFromCloud(nextProjectId, {forceReplaceLocal: true});
                setProjectsOpen(false);
                return;
            }

            if (isDirty) {
                setPendingStartBlank(false);
                setPendingProjectId(nextProjectId);
                setConfirmSwitchOpen(true);
                return;
            }

            setPendingStartBlank(false);
            void loadProjectFromCloud(nextProjectId);
            setProjectsOpen(false);
        },
        [isDirty, projectId, loadProjectFromCloud],
    );

    const continueOpenPendingProject = useCallback(
        async (options?: { forceReplaceLocal?: boolean }) => {
            if (!pendingProjectId) return;

            const target = pendingProjectId;
            setPendingProjectId(null);
            setPendingStartBlank(false);
            setConfirmSwitchOpen(false);
            setProjectsOpen(false);

            await loadProjectFromCloud(target, {
                forceReplaceLocal: options?.forceReplaceLocal ?? false,
            });
        },
        [pendingProjectId, loadProjectFromCloud
            , loadProjectFromCloud]
    );

    const handleSaveAndContinue = useCallback(async () => {
        const ok = await saveProject();
        if (!ok) return;

        if (pendingStartBlank) {
            setPendingStartBlank(false);
            setPendingProjectId(null);
            setConfirmSwitchOpen(false);
            setProjectsOpen(false);
            executeStartBlankProject();
            return;
        }

        await continueOpenPendingProject();
    }, [
        saveProject,
        pendingStartBlank,
        executeStartBlankProject,
        continueOpenPendingProject,
    ]);

    const handleDiscardAndContinue = useCallback(() => {
        if (pendingStartBlank) {
            setPendingStartBlank(false);
            setPendingProjectId(null);
            setConfirmSwitchOpen(false);
            setProjectsOpen(false);
            executeStartBlankProject();
            return;
        }

        void continueOpenPendingProject({forceReplaceLocal: true});
    }, [pendingStartBlank, executeStartBlankProject, continueOpenPendingProject]);

    const cancelPendingSwitch = useCallback(() => {
        setConfirmSwitchOpen(false);
        setPendingProjectId(null);
        setPendingStartBlank(false);
    }, []);

    const archiveProject = useCallback(
        async (targetProjectId: string) => {
            try {
                const res = await fetch(
                    `/api/ide/projects/${encodeURIComponent(targetProjectId)}`,
                    {
                        method: "DELETE",
                        cache: "no-store",
                    },
                );

                const data = await res.json().catch(() => null);

                if (res.status === 404 && projectId === targetProjectId) {
                    detachMissingProject(
                        "This saved project no longer exists. Your local draft was kept.",
                    );
                    return;
                }

                if (!res.ok) {
                    throw new Error(data?.error ?? "Failed to archive project.");
                }

                if (projectId === targetProjectId) {
                    clearProjectSessionMeta(sessionKey);
                    resetLanguageScopedProjectState();
                    clearSavedBaseline();
                }

                setToast({kind: "success", text: "Project archived."});
                void refreshProjects();
            } catch (e: any) {
                setToast({
                    kind: "error",
                    text: e?.message ?? "Failed to archive project.",
                });
            }
        },
        [
            projectId,
            sessionKey,
            detachMissingProject,
            resetLanguageScopedProjectState,
            clearSavedBaseline,
            refreshProjects,
            setToast,
        ],
    );

    return {
        projectId,
        currentProjectName,
        loadingProject,
        isSavingProject,
        lastSavedAt,
        saveError,
        projectsOpen,
        setProjectsOpen,
        confirmSwitchOpen,
        saveAsOpen,
        renameOpen,
        renamingProject,
        projectModalBusy,
        setSaveAsOpen,
        setRenameOpen,
        setRenamingProject,
        saveProject,
        saveAsProject,
        renameProject,
        archiveProject,
        startBlankProject,
        requestOpenProject,
        handleSaveAndContinue,
        handleDiscardAndContinue,
        cancelPendingSwitch,
        conflictInfo,
        dismissConflict,
        syncTerminalFiles,
        reloadProjectFromCloud,
    };
}