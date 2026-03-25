"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
    ProjectConflictResponse,
    SaveProjectRequest,
} from "@/lib/projects/projectApiTypes";

import { pathOf } from "../../fsTree";
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

function projectSessionStorageKey(projectScope: any, language: string) {
    return `full-ide:project-session:v4:${JSON.stringify(projectScope)}:${language}`;
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
    } catch {}
}

function clearProjectSessionMeta(key: string) {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.removeItem(key);
    } catch {}
}

export function useIdeProjectSession({
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
                                         resetWorkspaceForLanguage,
                                         markLoaded,
                                         markSaved,
                                         clearSavedBaseline,
                                         isDirty,
                                         setToast,
                                         refreshProjects,
                                     }: UseIdeProjectSessionArgs): ProjectSessionApi & {
    conflictInfo: ProjectConflictInfo | null;
    dismissConflict: () => void;
    reloadProjectFromCloud: () => Promise<void>;
} {
    const loadedProjectIdRef = useRef<string | null>(null);

    const sessionKey = projectSessionStorageKey(projectScope, language);
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

    const [renameOpen, setRenameOpen] = useState(false);
    const [saveAsOpen, setSaveAsOpen] = useState(false);
    const [renamingProject, setRenamingProject] = useState<any | null>(null);
    const [projectModalBusy, setProjectModalBusy] = useState(false);

    const [clientInstanceId, setClientInstanceId] = useState("browser");
    const [hydratedSessionKey, setHydratedSessionKey] = useState<string | null>(null);

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
            setProjectId(null);
            setCurrentProjectName(projectTitle ?? title);
            setLastSavedAt(null);
            setBaseVersion(null);
            setConflictInfo(null);

            if (!opts?.keepSaveError) {
                setSaveError(null);
            }

            if (!opts?.keepProjectsOpen) {
                setProjectsOpen(false);
            }
        },
        [projectTitle, title],
    );

    const dismissConflict = useCallback(() => {
        setConflictInfo(null);
    }, []);

    const handleProjectApiFailure = useCallback(
        async (res: Response) => {
            let data: any = null;
            try {
                data = await res.json();
            } catch {}

            if (res.status === 409 && data?.code === "PROJECT_CONFLICT") {
                const conflict = data as ProjectConflictResponse;

                setConflictInfo({
                    projectId: conflict.conflict.projectId,
                    clientBaseVersion: conflict.conflict.clientBaseVersion,
                    serverVersion: conflict.conflict.serverVersion,
                    serverUpdatedAt: conflict.conflict.serverUpdatedAt,
                    title: conflict.conflict.title,
                });

                const message =
                    "A newer cloud version exists. Your local draft was kept.";
                setSaveError(message);
                setToast({ kind: "error", text: message });
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
            setToast({ kind: "error", text: message });

            if (res.status === 401 || res.status === 402) {
                goToUpgrade();
            }

            return null;
        },
        [setToast, goToUpgrade],
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Pause persistence for the new language session
        setHydratedSessionKey(null);

        const ensuredBrowserId = ensureBrowserInstanceId(browserInstanceKey);
        setClientInstanceId(ensuredBrowserId);

        if (initialProjectId) {
            loadedProjectIdRef.current = initialProjectId;
            setProjectId(initialProjectId);
            setCurrentProjectName(projectTitle ?? title);
            setLastSavedAt(null);
            setBaseVersion(null);
            setConflictInfo(null);
            setHydratedSessionKey(sessionKey);
            return;
        }

        const meta = readProjectSessionMeta(sessionKey);

        if (meta) {
            loadedProjectIdRef.current = meta.projectId ?? null;
            setProjectId(meta.projectId ?? null);
            setCurrentProjectName(meta.currentProjectName || projectTitle || title);
            setLastSavedAt(meta.lastSavedAt ?? null);
            setBaseVersion(meta.baseVersion ?? null);
            setConflictInfo(null);
        } else {
            resetLanguageScopedProjectState({ keepProjectsOpen: true });
        }

        // Mark this language session hydrated only after the above state is scheduled
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
        // Do not write old project state into a new language session key
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

    const loadProjectFromCloud = useCallback(
        async (targetProjectId: string, options?: { forceReplaceLocal?: boolean }) => {
            if (!access.canSaveCloud) return;

            try {
                setLoadingProject(true);
                setSaveError(null);

                const res = await fetch(
                    `/api/ide/projects/${encodeURIComponent(targetProjectId)}`,
                    { method: "GET", cache: "no-store" },
                );

                if (!res.ok) {
                    await handleProjectApiFailure(res);
                    return;
                }

                const data = await res.json();

                if (data?.project?.language && data.project.language !== language) {
                    clearProjectSessionMeta(sessionKey);
                    resetLanguageScopedProjectState({
                        keepProjectsOpen: true,
                        keepSaveError: true,
                    });

                    setSaveError(
                        `"${data.project.title}" is a ${data.project.language} project. Switch to ${data.project.language} to open it.`,
                    );

                    setToast({
                        kind: "error",
                        text: `This project belongs to ${data.project.language}.`,
                    });

                    return;
                }

                const remoteVersion =
                    typeof data?.project?.currentVersion === "number"
                        ? data.project.currentVersion
                        : null;

                const remoteIsNewer =
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

                    loadedProjectIdRef.current = data.project.id;
                    setProjectId(data.project.id);
                    setCurrentProjectName(data.project.title);
                    setLastSavedAt(data.project.updatedAt);
                    setBaseVersion(remoteVersion);

                    persistLocalMeta({
                        projectId: data.project.id,
                        currentProjectName: data.project.title,
                        lastSavedAt: data.project.updatedAt,
                        baseVersion: remoteVersion,
                    });

                    setSaveError(
                        "A newer cloud version exists. Your local draft was kept.",
                    );
                    setToast({
                        kind: "error",
                        text: "Cloud version is newer. Local draft kept.",
                    });
                    return;
                }

                replaceWorkspace(data.project.workspace);
                markLoaded(data.project.workspace);
                loadedProjectIdRef.current = data.project.id;
                setProjectId(data.project.id);
                setCurrentProjectName(data.project.title);
                setLastSavedAt(data.project.updatedAt);
                setBaseVersion(data.project.currentVersion ?? null);
                setConflictInfo(null);

                persistLocalMeta({
                    projectId: data.project.id,
                    currentProjectName: data.project.title,
                    lastSavedAt: data.project.updatedAt,
                    baseVersion: data.project.currentVersion ?? null,
                });
            } catch (e: any) {
                const message = e?.message ?? "Failed to load project.";
                setSaveError(message);
                setToast({ kind: "error", text: message });
            } finally {
                setLoadingProject(false);
            }
        },
        [
            access.canSaveCloud,
            handleProjectApiFailure,
            baseVersion,
            isDirty,
            persistLocalMeta,
            replaceWorkspace,
            markLoaded,
            setToast,
            language,
            sessionKey,
            resetLanguageScopedProjectState,
        ],
    );

    useEffect(() => {
        if (!projectId) return;
        if (!access.canSaveCloud) return;
        if (loadedProjectIdRef.current === projectId) return;

        void loadProjectFromCloud(projectId);
    }, [projectId, access.canSaveCloud, loadProjectFromCloud]);

    const reloadProjectFromCloud = useCallback(async () => {
        if (!projectId) return;
        await loadProjectFromCloud(projectId, { forceReplaceLocal: true });
    }, [projectId, loadProjectFromCloud]);

    const persistProject = useCallback(
        async (args?: {
            targetProjectId?: string | null;
            forcedTitle?: string | null;
            createRevision?: boolean;
        }): Promise<PersistProjectResult> => {
            if (!currentWorkspace) {
                setToast({ kind: "error", text: "Nothing to save yet." });
                return { ok: false };
            }

            if (!access.canSaveCloud) {
                goToUpgrade();
                return { ok: false };
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
                settings: { sqlDialect },
                meta: { source: "full-ide" },
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
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    },
                );

                if (!res.ok) {
                    await handleProjectApiFailure(res);
                    return { ok: false };
                }

                const data = await res.json();
                return { ok: true, data };
            } catch (e: any) {
                const message = e?.message ?? "Failed to save project.";
                setSaveError(message);
                setToast({ kind: "error", text: message });
                return { ok: false };
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
            setToast,
            sessionKey,
            baseVersion,
            clientInstanceId,
        ],
    );

    const saveProject = useCallback(async (): Promise<boolean> => {
        const workspaceToSave = currentWorkspace;
        if (!workspaceToSave) {
            setToast({ kind: "error", text: "Nothing to save yet." });
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
        setProjectId(data.project.id);
        setCurrentProjectName(nextName);
        setLastSavedAt(data.project.updatedAt);
        setBaseVersion(nextVersion);
        setConflictInfo(null);

        persistLocalMeta({
            projectId: data.project.id,
            currentProjectName: nextName,
            lastSavedAt: data.project.updatedAt ?? null,
            baseVersion: nextVersion,
        });

        markSaved(workspaceToSave);
        setToast({ kind: "success", text: "Project saved." });
        void refreshProjects();
        return true;
    }, [
        persistProject,
        projectId,
        currentProjectName,
        projectTitle,
        title,
        currentWorkspace,
        markSaved,
        refreshProjects,
        setToast,
        sessionKey,
        persistLocalMeta,
    ]);

    const saveAsProject = useCallback(
        async (nextTitle: string) => {
            const workspaceToSave = currentWorkspace;
            if (!workspaceToSave) {
                setToast({ kind: "error", text: "Nothing to save yet." });
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
            setProjectId(data.project.id);
            setCurrentProjectName(nextName);
            setLastSavedAt(data.project.updatedAt);
            setBaseVersion(nextVersion);
            setConflictInfo(null);

            persistLocalMeta({
                projectId: data.project.id,
                currentProjectName: nextName,
                lastSavedAt: data.project.updatedAt ?? null,
                baseVersion: nextVersion,
            });

            markSaved(workspaceToSave);
            setToast({ kind: "success", text: "Project saved as a new project." });
            setSaveAsOpen(false);
            void refreshProjects();
            return true;
        },
        [
            persistProject,
            currentWorkspace,
            markSaved,
            refreshProjects,
            setToast,
            persistLocalMeta,
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
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            title: nextTitle,
                            baseVersion,
                        }),
                    },
                );

                const data = await res.json().catch(() => null);

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
                setToast({ kind: "success", text: "Project renamed." });
                void refreshProjects();
                return true;
            } catch (e: any) {
                setToast({ kind: "error", text: e?.message ?? "Failed to rename project." });
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
            refreshProjects,
            setToast,
            persistLocalMeta,
        ],
    );

    const startBlankProject = useCallback(() => {
        resetWorkspaceForLanguage(language);
        clearProjectSessionMeta(sessionKey);
        resetLanguageScopedProjectState();
        clearSavedBaseline();
        setToast({ kind: "success", text: "Started a new local project." });
    }, [
        resetWorkspaceForLanguage,
        language,
        sessionKey,
        resetLanguageScopedProjectState,
        clearSavedBaseline,
        setToast,
    ]);

    const requestOpenProject = useCallback(
        (nextProjectId: string) => {
            if (nextProjectId === projectId) {
                loadedProjectIdRef.current = null;
                setProjectsOpen(false);
                setProjectId(null);
                window.setTimeout(() => setProjectId(nextProjectId), 0);
                return;
            }

            if (isDirty) {
                setPendingProjectId(nextProjectId);
                setConfirmSwitchOpen(true);
                return;
            }

            loadedProjectIdRef.current = null;
            setProjectId(nextProjectId);
            setProjectsOpen(false);
        },
        [isDirty, projectId],
    );

    const continueOpenPendingProject = useCallback(() => {
        if (!pendingProjectId) return;

        loadedProjectIdRef.current = null;
        setProjectId(pendingProjectId);
        setPendingProjectId(null);
        setConfirmSwitchOpen(false);
        setProjectsOpen(false);
    }, [pendingProjectId]);

    const handleSaveAndContinue = useCallback(async () => {
        const ok = await saveProject();
        if (!ok) return;
        continueOpenPendingProject();
    }, [saveProject, continueOpenPendingProject]);

    const handleDiscardAndContinue = useCallback(() => {
        continueOpenPendingProject();
    }, [continueOpenPendingProject]);

    const cancelPendingSwitch = useCallback(() => {
        setConfirmSwitchOpen(false);
        setPendingProjectId(null);
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

                if (!res.ok) {
                    throw new Error(data?.error ?? "Failed to archive project.");
                }

                if (projectId === targetProjectId) {
                    clearProjectSessionMeta(sessionKey);
                    resetLanguageScopedProjectState();
                    clearSavedBaseline();
                }

                setToast({ kind: "success", text: "Project archived." });
                void refreshProjects();
            } catch (e: any) {
                setToast({ kind: "error", text: e?.message ?? "Failed to archive project." });
            }
        },
        [
            projectId,
            sessionKey,
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
        reloadProjectFromCloud,
    };
}