"use client";

import { resolveSaveProjectTarget } from "./resolveSaveProjectTarget";
import {getOrCreateCreationIntent, clearAcknowledgedCreationIntent} from "./v6CreationIntent";

import { learnerWorkspaceApiRaw } from "@zoeskoul/learner-workspace/runtime/browserApi";
import {useCallback, useEffect, useRef, useState} from "react";
import { newerProjectVersionFromOtherTab } from "./v6ProjectTabVersion";
import { isUnresolvedCloudUpdate } from "./v6CloudConflictPolicy";
import { isValidCloudSaveAcknowledgment } from "./v6CloudSaveAcknowledgment";
import { createCloudSaveGate } from "./v6CloudSaveGate";
import { canSkipUnchangedCloudSave, isValidCloudProjectSnapshot, workspaceChangedDuringCloudReload } from "./v6CloudReloadSafety";
import { cloudWorkspaceFingerprint } from "../../projects/hooks/cloudWorkspaceFingerprint";
import { planRestoredCloudBaseline } from "./v6RestoredCloudBaseline";

import type {
    ProjectConflictResponse,
    SaveProjectRequest,
} from "@zoeskoul/learner-workspace/lib/projects/projectApiTypes";
import {
    buildSingleFileWorkspace,
    createDefaultStateForLanguage,
} from "@zoeskoul/learner-workspace/ide/workspaceHook/workspace.normalization";

import {pathOf} from "@zoeskoul/learner-workspace/ide/fsTree";
import type {
    PersistProjectResult,
    ProjectSessionApi,
    UseIdeProjectSessionArgs,
} from "@zoeskoul/learner-workspace/ide/types";

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

function createEphemeralBrowserInstanceId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ensureBrowserInstanceId(
    _browserPersistenceEnabled: boolean,
    _key: string,
) {
    // An instance is a mounted editor, not a user or project identity. In
    // particular, localStorage is shared across tabs and must not give two
    // concurrently running editors the same clientInstanceId. Start fresh on
    // every mount; cloud revisions and local drafts retain their own keys.
    if (typeof window === "undefined") return "server";
    return createEphemeralBrowserInstanceId();
}
function readProjectSessionMeta(
    browserPersistenceEnabled: boolean,
    key: string,
): LocalProjectSessionMeta | null {
    if (!browserPersistenceEnabled || typeof window === "undefined") return null;

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
function writeProjectSessionMeta(
    browserPersistenceEnabled: boolean,
    key: string,
    meta: LocalProjectSessionMeta,
) {
    if (!browserPersistenceEnabled || typeof window === "undefined") return;

    try {
        window.localStorage.setItem(key, JSON.stringify(meta));
    } catch {
    }
}

function clearProjectSessionMeta(
    browserPersistenceEnabled: boolean,
    key: string,
) {
    if (!browserPersistenceEnabled || typeof window === "undefined") return;

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
                                         draftStorageMode = "local",
                                         v6DraftTabId = null,
                                         v6InheritedDraftTabId = null,
                                         access,
                                         loginHref,
                                         billingHref,
                                         routerPush,
                                         language,
                                         sqlDialect,
                                         currentWorkspace,
                                         workspaceHydrated = false,
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
    reloadProjectFromCloud: () => Promise<boolean>;
} {
    const loadedProjectIdRef = useRef<string | null>(null);
    const loadSeqRef = useRef(0);
    const loadAbortRef = useRef<AbortController | null>(null);
    const projectIdSourceRef = useRef<ProjectIdSource>(null);
    // useState alone cannot prevent two saves fired before React re-renders.
    const cloudSaveGateRef = useRef(createCloudSaveGate());
    const transientCreateIntentRef = useRef<string | null>(null);
    // Always compare against the *latest* draft when a cloud GET completes.
    const currentWorkspaceRef = useRef(currentWorkspace);
    currentWorkspaceRef.current = currentWorkspace;

    const commonSessionKey = projectSessionStorageKey({
        actorKey,
        projectScope,
        language,
    });
    // A V6 tab owns its local project metadata. The old shared key remains a
    // read-only migration source and a version-notice signal, never a draft.
    const sessionKey = v6DraftTabId
        ? `${commonSessionKey}:v6tab:${v6DraftTabId}`
        : commonSessionKey;
    const versionSignalKey = `${commonSessionKey}:v6-cloud-version-signal`;
    const inheritedSessionKey = v6InheritedDraftTabId
        ? `${commonSessionKey}:v6tab:${v6InheritedDraftTabId}`
        : null;
    const browserInstanceKey = `${sessionKey}:browser-instance`;
    const browserPersistenceEnabled = draftStorageMode === "local";
    const creationIntentKey = `${sessionKey}:creation-intent:v1`;

    const [projectId, setProjectId] = useState<string | null>(initialProjectId);
    const [currentProjectName, setCurrentProjectName] = useState(
        projectTitle ?? title,
    );
    const [loadingProject, setLoadingProject] = useState(false);
    const [verifyingRestoredCloud, setVerifyingRestoredCloud] = useState(false);
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
            writeProjectSessionMeta(browserPersistenceEnabled, sessionKey, {
                ...next,
                clientInstanceId:
                    clientInstanceId || ensureBrowserInstanceId(browserPersistenceEnabled, browserInstanceKey),
            });
        },
        [browserPersistenceEnabled, sessionKey, clientInstanceId, browserInstanceKey],
    );

    // Emit a shared advisory notice only after the cloud API acknowledged a
    // save/rename. A load or local state update must not masquerade as a save.
    const announceCloudVersion = useCallback((next: {
        projectId: string | null;
        currentProjectName: string;
        lastSavedAt: string | null;
        baseVersion: number | null;
    }) => {
        if (!v6DraftTabId || !next.projectId || next.baseVersion == null) return;
        writeProjectSessionMeta(browserPersistenceEnabled, versionSignalKey, {
            ...next,
            clientInstanceId,
        });
    }, [browserPersistenceEnabled, versionSignalKey, clientInstanceId, v6DraftTabId]);

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
            clearProjectSessionMeta(browserPersistenceEnabled, sessionKey);
            clearSavedBaseline();
            setSaveError(message);
            setToast({kind: "error", text: message});
        },
        [
            browserPersistenceEnabled,
            projectTitle,
            title,
            sessionKey,
            clearSavedBaseline,
            setToast,
        ],
    );

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

        const ensuredBrowserId = ensureBrowserInstanceId(browserPersistenceEnabled, browserInstanceKey);
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

        const meta = readProjectSessionMeta(browserPersistenceEnabled, sessionKey) ??
            (inheritedSessionKey
                ? readProjectSessionMeta(browserPersistenceEnabled, inheritedSessionKey)
                : null) ??
            (v6DraftTabId
                ? readProjectSessionMeta(browserPersistenceEnabled, commonSessionKey)
                : null);

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
        browserPersistenceEnabled,
        initialProjectId,
        sessionKey,
        commonSessionKey,
        inheritedSessionKey,
        v6DraftTabId,
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

    // Notify (never overwrite) a tab when another tab records a newer cloud
    // project version. The server still enforces baseVersion on save. The
    // browser storage event is only an advisory signal, not an authorization
    // source and not evidence that the terminal workspaces are shared.
    useEffect(() => {
        if (!browserPersistenceEnabled || !projectId || baseVersion == null ||
            hydratedSessionKey !== sessionKey || typeof window === "undefined") return;

        const onStorage = (event: StorageEvent) => {
            if (event.storageArea !== window.localStorage) return;
            if (v6DraftTabId
                ? event.key !== versionSignalKey && event.key !== commonSessionKey
                : event.key !== sessionKey) return;
            const hint = newerProjectVersionFromOtherTab(event.newValue, {
                projectId,
                baseVersion,
                clientInstanceId,
            });
            if (!hint) return;
            setConflictInfo({
                projectId,
                clientBaseVersion: baseVersion,
                serverVersion: hint.version,
                serverUpdatedAt: hint.savedAt ?? "",
                title: hint.title,
            });
            setSaveError(
                "Another browser tab reported a newer cloud project version. Your local draft was preserved. Save as a copy, or review the cloud version before reloading.",
            );
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [browserPersistenceEnabled, projectId, baseVersion, hydratedSessionKey,
        sessionKey, commonSessionKey, versionSignalKey, v6DraftTabId, clientInstanceId]);

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
            if (cloudSaveGateRef.current.busy) {
                setToast({kind: "error", text: "Finish saving before opening a cloud project."});
                return false;
            }
            const draftAtRequest = currentWorkspaceRef.current;
            const seq = ++loadSeqRef.current;

            loadAbortRef.current?.abort();
            const controller = new AbortController();
            loadAbortRef.current = controller;

            try {
                setLoadingProject(true);
                setSaveError(null);

                const res = await learnerWorkspaceApiRaw(
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
                if (!isValidCloudProjectSnapshot(data, targetProjectId)) {
                    throw new Error("Cloud project response was incomplete. Your local draft was kept.");
                }
                // A user can keep typing during a GET. Never discard those *new*
                // edits even after an earlier explicit Reload Cloud confirmation.
                if (draftAtRequest && workspaceChangedDuringCloudReload(draftAtRequest, currentWorkspaceRef.current)) {
                    const message = "Local files changed while the cloud version was loading. Those edits were kept; review and reload again if desired.";
                    setSaveError(message);
                    setToast({kind: "error", text: message});
                    return false;
                }

                if (data?.project?.language && data.project.language !== language) {
                    if (projectId === targetProjectId) {
                        clearProjectSessionMeta(browserPersistenceEnabled, sessionKey);
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
            browserPersistenceEnabled,
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

    // On browser refresh the local workspace and project metadata hydrate
    // independently. A session-restored project must verify its cloud baseline
    // before it may display Saved. This GET is strictly read-only: no draft
    // replacement, no automatic merge, and no new cloud revision.
    useEffect(() => {
        if (!browserPersistenceEnabled || !access.canSaveCloud || !workspaceHydrated ||
            hydratedSessionKey !== sessionKey || !projectId ||
            projectIdSourceRef.current !== "session" ||
            loadedProjectIdRef.current === projectId) return;

        let live = true;
        const controller = new AbortController();
        setVerifyingRestoredCloud(true);
        void (async () => {
            try {
                const res = await learnerWorkspaceApiRaw(
                    `/api/ide/projects/${encodeURIComponent(projectId)}`,
                    {method:"GET",cache:"no-store",signal:controller.signal},
                );
                if (!live) return;
                if (res.status === 404) {
                    detachMissingProject("This cloud project no longer exists. Your local draft was preserved; save it as a new project.");
                    return;
                }
                if (!res.ok) {
                    await handleProjectApiFailure(res);
                    return;
                }
                const data = await res.json();
                if (!live) return;
                if (!isValidCloudProjectSnapshot(data, projectId) ||
                    data.project.language !== language) {
                    throw new Error("The saved cloud workspace could not be verified. Local files were preserved.");
                }
                const remote = data.project;
                const decision = planRestoredCloudBaseline({
                    localFingerprint: cloudWorkspaceFingerprint(currentWorkspaceRef.current),
                    cloudFingerprint: cloudWorkspaceFingerprint(remote.workspace),
                    cachedVersion: baseVersion,
                    cloudVersion: remote.currentVersion,
                });
                if (decision === "unverified") {
                    setSaveError("Cloud revision could not be verified. Your local files were preserved.");
                    return;
                }
                if (decision === "conflict") {
                    setConflictInfo({
                        projectId: remote.id,
                        clientBaseVersion: baseVersion,
                        serverVersion: remote.currentVersion,
                        serverUpdatedAt: remote.updatedAt,
                        title: remote.title,
                    });
                    setSaveError("The cloud project changed in another session. Your local draft was preserved. Use Resolve or Save Copy.");
                    return;
                }
                // For a local-only draft this establishes the actual cloud
                // baseline without overwriting its newer local content.
                markLoaded(remote.workspace);
                loadedProjectIdRef.current = remote.id;
                setProjectId(remote.id);
                setCurrentProjectName(remote.title);
                setLastSavedAt(remote.updatedAt);
                setBaseVersion(remote.currentVersion);
                setConflictInfo(null);
                setSaveError(null);
                persistLocalMeta({
                    projectId: remote.id,
                    currentProjectName: remote.title,
                    lastSavedAt: remote.updatedAt,
                    baseVersion: remote.currentVersion,
                });
            } catch (error: any) {
                if (!live || error?.name === "AbortError") return;
                setSaveError(error?.message ?? "Cloud save verification failed. Local files were preserved.");
            } finally {
                if (live) setVerifyingRestoredCloud(false);
            }
        })();
        return () => {live = false;controller.abort();};
    }, [
        browserPersistenceEnabled, access.canSaveCloud, workspaceHydrated,
        hydratedSessionKey, sessionKey, projectId, baseVersion, language,
        detachMissingProject, handleProjectApiFailure, markLoaded, persistLocalMeta,
    ]);

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
        if (!targetProjectId) return false;

        return loadProjectFromCloud(targetProjectId, {forceReplaceLocal: true});
    }, [conflictInfo?.projectId, projectId, loadProjectFromCloud]);

    const persistProject = useCallback(
        async (args?: {
            targetProjectId?: string | null;
            forcedTitle?: string | null;
            createRevision?: boolean;
        }): Promise<PersistProjectResult & {creationRequestKey?: string | null}> => {
            if (!currentWorkspace) {
                setToast({kind: "error", text: "Nothing to save yet."});
                return {ok: false};
            }

            if (verifyingRestoredCloud) {
                setToast({kind:"info",text:"Checking the saved cloud version before editing its history."});
                return {ok:false};
            }

            if (!access.canSaveCloud) {
                goToUpgrade();
                return {ok: false};
            }

            const localMeta = readProjectSessionMeta(browserPersistenceEnabled, sessionKey);
            const targetProjectId = resolveSaveProjectTarget(args, projectId, localMeta?.projectId ?? null);
            if (isUnresolvedCloudUpdate({
                targetProjectId,
                conflictProjectId: conflictInfo?.projectId ?? null,
            })) {
                const message = "A newer cloud version exists. Review the conflict or save a separate copy; your local draft is preserved.";
                setSaveError(message);
                setToast({kind: "error", text: message});
                return {ok: false};
            }

            const titleToUse =
                args?.forcedTitle?.trim() ||
                currentProjectName ||
                localMeta?.currentProjectName ||
                projectTitle ||
                title;

            // Never create a cloud project without a durable idempotency key.
            // After a network error the next attempt reuses the same key,
            // so a lost 201 response cannot silently create two projects.
            let creationRequestKey: string | null = null;
            try {
                if (!targetProjectId) {
                    if (browserPersistenceEnabled) {
                        creationRequestKey = getOrCreateCreationIntent(
                            typeof window !== "undefined" ? window.localStorage : null,
                            creationIntentKey,
                            createEphemeralBrowserInstanceId,
                        );
                    } else {
                        // Explicit draft-storage opt-out still permits cloud Save.
                        // The key is stable for this mounted editor only.
                        creationRequestKey = transientCreateIntentRef.current ??
                            (transientCreateIntentRef.current = createEphemeralBrowserInstanceId());
                    }
                }
            } catch (error: any) {
                const message = error?.message ?? "Project creation could not be protected against duplicate requests.";
                setSaveError(message);
                setToast({kind: "error", text: message});
                return {ok: false};
            }

            const body: SaveProjectRequest = {
                creationRequestKey,
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

            if (!cloudSaveGateRef.current.begin()) {
                setToast({kind: "error", text: "A cloud save is already running. Your draft is unchanged."});
                return {ok: false};
            }
            try {
                setIsSavingProject(true);
                setSaveError(null);

                const res = await learnerWorkspaceApiRaw(
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
                if (!isValidCloudSaveAcknowledgment(data, targetProjectId, projectId ?? localMeta?.projectId ?? null)) {
                    throw new Error("Cloud save could not be confirmed. Your local draft remains available; check the project list before retrying.");
                }
                // Do not clear the durable key here: a crash between receiving
                // the 201 and persisting project metadata must still be retryable.
                return {ok: true, data, creationRequestKey};
            } catch (e: any) {
                const message = e?.message ?? "Failed to save project.";
                setSaveError(message);
                setToast({kind: "error", text: message});
                return {ok: false};
            } finally {
                cloudSaveGateRef.current.end();
                setIsSavingProject(false);
            }
        },
        [
            browserPersistenceEnabled,
            currentWorkspace,
            access.canSaveCloud,
            verifyingRestoredCloud,
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
            creationIntentKey,
            conflictInfo?.projectId,
        ],
    );

    const saveProject = useCallback(async (): Promise<boolean> => {
        const workspaceToSave = currentWorkspace;

        if (!workspaceToSave) {
            setToast({kind: "error", text: "Nothing to save yet."});
            return false;
        }

        if (loadingProject || verifyingRestoredCloud) {
            setToast({
                kind: "error",
                text: "Finish opening the project before saving.",
            });
            return false;
        }

        const localMeta = readProjectSessionMeta(browserPersistenceEnabled, sessionKey);
        const effectiveProjectId = projectId ?? localMeta?.projectId ?? null;
        const effectiveProjectName =
            currentProjectName ||
            localMeta?.currentProjectName ||
            projectTitle ||
            title;

        // A cloud reload can change the Explorer's view state without changing
        // the actual project. Re-saving that view would needlessly increment
        // the cloud revision and can cause repeated two-tab conflicts.
        if (canSkipUnchangedCloudSave({
            projectId: effectiveProjectId,
            baseVersion,
            isDirty,
            hasConflict: Boolean(conflictInfo),
        })) {
            setSaveError(null);
            setToast({kind: "info", text: "No local changes since the last cloud save."});
            return true;
        }

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
        announceCloudVersion({
            projectId: data.project.id,
            currentProjectName: nextName,
            lastSavedAt: data.project.updatedAt ?? null,
            baseVersion: nextVersion,
        });

        markSaved(workspaceToSave);
        // Commit the local project identity before retiring the create key.
        // If metadata storage failed, keep the key for a safe post-refresh replay.
        if (result.creationRequestKey) {
            if (!browserPersistenceEnabled) transientCreateIntentRef.current = null;
            else if (typeof window !== "undefined" &&
                readProjectSessionMeta(true, sessionKey)?.projectId === data.project.id) {
                clearAcknowledgedCreationIntent(window.localStorage, creationIntentKey, result.creationRequestKey);
            }
        }
        setToast({kind: "success", text: "Project saved."});
        void refreshProjects();
        return true;
    }, [
        browserPersistenceEnabled,
        currentWorkspace,
        loadingProject,
        verifyingRestoredCloud,
        sessionKey,
        projectId,
        currentProjectName,
        projectTitle,
        title,
        baseVersion,
        isDirty,
        conflictInfo,
        persistProject,
        persistLocalMeta,
        announceCloudVersion,
        creationIntentKey,
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
            announceCloudVersion({
                projectId: data.project.id,
                currentProjectName: nextName,
                lastSavedAt: data.project.updatedAt ?? null,
                baseVersion: nextVersion,
            });

            markSaved(workspaceToSave);
            if (result.creationRequestKey) {
                if (!browserPersistenceEnabled) transientCreateIntentRef.current = null;
                else if (typeof window !== "undefined" &&
                    readProjectSessionMeta(true, sessionKey)?.projectId === data.project.id) {
                    clearAcknowledgedCreationIntent(window.localStorage, creationIntentKey, result.creationRequestKey);
                }
            }
            setToast({kind: "success", text: "Project saved as a new project."});
            setSaveAsOpen(false);
            void refreshProjects();
            return true;
        },
        [
            currentWorkspace,
            persistProject,
            persistLocalMeta,
            announceCloudVersion,
            browserPersistenceEnabled,
            sessionKey,
            creationIntentKey,
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

                const res = await learnerWorkspaceApiRaw(
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
                    announceCloudVersion({
                        projectId,
                        currentProjectName: data?.project?.title ?? nextTitle,
                        lastSavedAt: data?.project?.updatedAt ?? lastSavedAt ?? null,
                        baseVersion: typeof data?.project?.currentVersion === "number"
                            ? data.project.currentVersion : baseVersion,
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
            announceCloudVersion,
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

        clearProjectSessionMeta(browserPersistenceEnabled, sessionKey);
        resetLanguageScopedProjectState();
        clearSavedBaseline();
        setToast({ kind: "success", text: "Started a new local project." });
    }, [
        browserPersistenceEnabled,
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
                const res = await learnerWorkspaceApiRaw(
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
                    clearProjectSessionMeta(browserPersistenceEnabled, sessionKey);
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
            browserPersistenceEnabled,
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
        syncTerminalFiles,
        reloadProjectFromCloud,
    };
}