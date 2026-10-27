"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";
import { workspaceSyncEntriesEqual } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import { registeredReactPreviewRoutes } from "@/lib/build/reactPreviewPageCatalog";
import { classifyCachedPreviewDocument } from "@/lib/build/reactPreviewSessionRecovery";
import { mayAutoRecoverReactPreviewDependencies } from "@/lib/build/reactPreviewDependencyRecovery";

type PreviewSession = Readonly<{
  previewId: string;
  basePath: string;
  workspaceEntries: readonly WorkspaceSyncEntry[];
}>;
type ApiPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  preview?: { previewId?: string; basePath?: string };
};

const SYNC_DEBOUNCE_MS = 650;
const PREVIEW_START_SLOW_NOTICE_MS = 15_000;
const PREVIEW_START_TIMEOUT_MS = 120_000;

const PREVIEW_ROUTE_REUSE_GRACE_MS =
  10 * 60_000;

const previewSessionCache =
  new Map<
    string,
    PreviewSession
  >();

const previewReleaseTimers =
  new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

function getCachedPreviewSession(
  buildProjectId: string,
) {
  return (
    previewSessionCache.get(
      buildProjectId,
    ) ??
    null
  );
}

function clearPreviewRelease(
  buildProjectId: string,
) {
  const timer =
    previewReleaseTimers.get(
      buildProjectId,
    );

  if (timer) {
    clearTimeout(timer);
    previewReleaseTimers.delete(
      buildProjectId,
    );
  }
}

function rememberPreviewSession(
  buildProjectId: string,
  session: PreviewSession,
) {
  clearPreviewRelease(
    buildProjectId,
  );

  previewSessionCache.set(
    buildProjectId,
    session,
  );
}

function forgetPreviewSession(
  buildProjectId: string,
  previewId?: string,
) {
  const cached =
    previewSessionCache.get(
      buildProjectId,
    );

  if (
    previewId &&
    cached &&
    cached.previewId !== previewId
  ) {
    return;
  }

  clearPreviewRelease(
    buildProjectId,
  );

  previewSessionCache.delete(
    buildProjectId,
  );
}

async function cancelPreviewSession(
  buildProjectId: string,
  session: PreviewSession,
) {
  await fetch(
    `/api/build/projects/${encodeURIComponent(buildProjectId)}/preview/${encodeURIComponent(session.previewId)}/cancel`,
    {
      method: "POST",
      credentials: "same-origin",
    },
  ).catch(() => undefined);
}

function schedulePreviewRelease(
  buildProjectId: string,
  session: PreviewSession,
) {
  clearPreviewRelease(
    buildProjectId,
  );

  const timer =
    setTimeout(
      () => {
        previewReleaseTimers.delete(
          buildProjectId,
        );

        const cached =
          getCachedPreviewSession(
            buildProjectId,
          );

        if (
          !cached ||
          cached.previewId !==
            session.previewId
        ) {
          return;
        }

        previewSessionCache.delete(
          buildProjectId,
        );

        void cancelPreviewSession(
          buildProjectId,
          session,
        );
      },
      PREVIEW_ROUTE_REUSE_GRACE_MS,
    );

  previewReleaseTimers.set(
    buildProjectId,
    timer,
  );
}

async function payload(response: Response): Promise<ApiPayload | null> {
  return (await response.json().catch(() => null)) as ApiPayload | null;
}

function message(data: ApiPayload | null, fallback: string) {
  return typeof data?.message === "string" ? data.message : fallback;
}

export function useReactVitePreview(input: Readonly<{
  enabled: boolean;
  buildProjectId: string;
  sourceVersion: number;
  workspace: WorkspaceStateV2;
  allowDependencyBootstrap: boolean;
}>): RemoteWebPreviewDescriptor | null {
  const initialWorkspaceEntries =
    exportWorkspaceEntries(input.workspace.nodes);

  const initialSession =
    input.enabled
      ? getCachedPreviewSession(
          input.buildProjectId,
        )
      : null;

  const [preview, setPreview] =
    useState<RemoteWebPreviewDescriptor | null>(
      input.enabled
        ? initialSession
          ? {
              src: initialSession.basePath,
              state: "ready",
              message: null,
              revision: 0,
            }
          : {
              src: null,
              state: "starting",
              message:
                "Preparing the trusted React/Vite preview…",
              revision: 0,
            }
        : null,
    );

  const mountedRef = useRef(true);
  const sessionRef =
    useRef<PreviewSession | null>(
      initialSession,
    );
  const workspaceRef = useRef(input.workspace);
  const workspaceEntriesRef =
    useRef<readonly WorkspaceSyncEntry[]>(initialWorkspaceEntries);
  const sourceVersionRef = useRef(input.sourceVersion);
  const bootstrapAllowedRef = useRef(input.allowDependencyBootstrap);
  const workspaceRevisionRef = useRef(0);
  const [workspaceContentRevision, setWorkspaceContentRevision] = useState(0);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    workspaceRef.current = input.workspace;
    const nextEntries = exportWorkspaceEntries(input.workspace.nodes);
    if (
      workspaceSyncEntriesEqual([...workspaceEntriesRef.current], nextEntries)
    ) return;
    workspaceEntriesRef.current = nextEntries;
    workspaceRevisionRef.current += 1;
    setWorkspaceContentRevision((current) => current + 1);
  }, [input.workspace]);

  useEffect(() => {
    sourceVersionRef.current = input.sourceVersion;
  }, [input.sourceVersion]);

  useEffect(() => {
    bootstrapAllowedRef.current = input.allowDependencyBootstrap;
  }, [input.allowDependencyBootstrap]);

  const cancelCurrent = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;

    if (!session) {
      forgetPreviewSession(
        input.buildProjectId,
      );
      return;
    }

    forgetPreviewSession(
      input.buildProjectId,
      session.previewId,
    );

    await cancelPreviewSession(
      input.buildProjectId,
      session,
    );
  }, [input.buildProjectId]);

  // Only one source sync may mutate a preview session at a time. Otherwise
  // an older in-flight request can overwrite the newer acknowledged source.
  const syncCurrent = useCallback(async () => {
    // A previous sync (possibly for a retired session) must settle before
    // this caller checks which source the active session still needs.
    while (syncPromiseRef.current) {
      await syncPromiseRef.current;
    }

    const task = (async () => {
      while (true) {
        const session = sessionRef.current;
        if (!session) return;

        // Capture exactly what this request will send. Never acknowledge
        // source that arrived while a runner request was in flight.
        const sendingWorkspace = workspaceRef.current;
        const sendingEntries = exportWorkspaceEntries(sendingWorkspace.nodes);
        const sendingVersion = sourceVersionRef.current;
        if (
          workspaceSyncEntriesEqual([...session.workspaceEntries], sendingEntries)
        ) return;

        if (mountedRef.current) {
          setPreview((current) =>
            current ? { ...current, state: "syncing", message: "Updating preview…" } : current,
          );
        }

        const response = await fetch(
          `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/${encodeURIComponent(session.previewId)}/sync`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceVersion: sendingVersion,
              workspace: sendingWorkspace,
            }),
          },
        );

        const data = await payload(response);
        if (response.status === 404) throw new Error("PREVIEW_EXPIRED");
        if (!response.ok || !data?.ok) {
          const errorMessage = message(data, "React preview could not be updated.");
          if (/dependencies changed/i.test(errorMessage)) {
            throw new Error("PREVIEW_RESTART_REQUIRED");
          }
          throw new Error(errorMessage);
        }

        // A restart/cancel can happen while the request is running.
        // Do not mutate the state or cache of a replacement session.
        if (sessionRef.current?.previewId !== session.previewId) return;

        const nextSession: PreviewSession = {
          ...session,
          workspaceEntries: sendingEntries,
        };
        sessionRef.current = nextSession;
        rememberPreviewSession(input.buildProjectId, nextSession);

        // A newer source arrived during sync: send it through the SAME
        // session before refreshing the HTTP-only document. No restart.
        if (
          !workspaceSyncEntriesEqual(
            sendingEntries,
            exportWorkspaceEntries(workspaceRef.current.nodes),
          )
        ) continue;

        if (mountedRef.current) {
          setPreview((current) =>
            current
              ? {
                  ...current,
                  state: "ready",
                  message: null,
                  revision: current.revision + 1,
                }
              : current,
          );
        }
        return;
      }
    })();

    syncPromiseRef.current = task;
    try {
      await task;
    } finally {
      if (syncPromiseRef.current === task) syncPromiseRef.current = null;
    }
  }, [input.buildProjectId]);

  const start = useCallback(async () => {
    if (
      !input.enabled ||
      startPromiseRef.current ||
      sessionRef.current
    ) return;

    const startingWorkspaceRevision = workspaceRevisionRef.current;
    const task = (async () => {
      if (mountedRef.current) {
        setPreview((current) => ({
          src: current?.src ?? null,
          state: "starting",
          message: "Starting the trusted React/Vite preview…",
          revision: current?.revision ?? 0,
        }));
      }

      const startController = new AbortController();

      const slowNoticeTimer = setTimeout(() => {
        if (!mountedRef.current) return;

        setPreview((current) =>
          current && current.state === "starting"
            ? {
                ...current,
                message:
                  "Still starting preview… the first React launch can take up to 2 minutes.",
              }
            : current,
        );
      }, PREVIEW_START_SLOW_NOTICE_MS);

      const startTimeoutTimer = setTimeout(() => {
        startController.abort();
      }, PREVIEW_START_TIMEOUT_MS);

      // Snapshot source at request creation, not when the START response
      // returns. This is the only source the runner can have received.
      const startingWorkspace = workspaceRef.current;
      const startingEntries = exportWorkspaceEntries(startingWorkspace.nodes);
      const startingVersion = sourceVersionRef.current;

      let response: Response;
      try {
        response = await fetch(
          `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/start`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceVersion: startingVersion,
              workspace: startingWorkspace,
            }),
            signal: startController.signal,
          },
        );
      } catch (error) {
        if (startController.signal.aborted) {
          throw new Error(
            "React preview startup timed out after 2 minutes. Retry preview.",
          );
        }
        throw error;
      } finally {
        clearTimeout(slowNoticeTimer);
        clearTimeout(startTimeoutTimer);
      }
      const data = await payload(response);

      const dependencyLockRequired = mayAutoRecoverReactPreviewDependencies({
        status: response.status,
        code: data?.code,
        message: data?.message,
      });

      if (dependencyLockRequired) {
        const recoveryKey = `zoebuild:dependency-recovery:${input.buildProjectId}`;
        let recoveredAlready = false;
        try { recoveredAlready = window.sessionStorage.getItem(recoveryKey) === "completed"; } catch { /* optional */ }
        if (recoveredAlready) {
          throw new Error("Automatic dependency recovery was attempted. The project still needs attention; no additional source revisions were created.");
        }
        if (!bootstrapAllowedRef.current) {
          throw new Error(
            "Save your changes before ZoeBuild prepares the React dependency lock.",
          );
        }

        if (mountedRef.current) {
          setPreview((current) => ({
            src: current?.src ?? null,
            state: "starting",
            message: "Securely preparing project dependencies…",
            revision: current?.revision ?? 0,
          }));
        }

        const bootstrap = await fetch(
          `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/dependency-lock/bootstrap`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reconcileExisting: true,
              baseVersion: startingVersion,
            }),
          },
        );
        const bootstrapData = await payload(bootstrap);
        if (!bootstrap.ok || !bootstrapData?.ok) {
          throw new Error(message(bootstrapData, "React dependency preparation failed."));
        }

        if (
          !bootstrapAllowedRef.current ||
          workspaceRevisionRef.current !== startingWorkspaceRevision ||
          sourceVersionRef.current !== startingVersion
        ) {
          throw new Error(
            "Dependencies were prepared, but this tab has newer local edits. Save them before reloading the project.",
          );
        }
        try { window.sessionStorage.setItem(recoveryKey, "completed"); } catch { /* optional */ }
        window.location.reload();
        return;
      }

      if (!response.ok || !data?.ok || !data.preview) {
        throw new Error(message(data, "React preview could not be started."));
      }

      const previewId = data.preview.previewId;
      const basePath = data.preview.basePath;
      if (
        typeof previewId !== "string" ||
        !/^preview_[0-9a-f-]{36}$/i.test(previewId) ||
        typeof basePath !== "string" ||
        !basePath.startsWith(
          `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/${encodeURIComponent(previewId)}/content/`,
        )
      ) {
        throw new Error("React preview returned an invalid session.");
      }

      const nextSession: PreviewSession = {
        previewId,
        basePath,
        workspaceEntries: startingEntries,
      };

      sessionRef.current =
        nextSession;

      rememberPreviewSession(
        input.buildProjectId,
        nextSession,
      );

      if (!mountedRef.current) {
        schedulePreviewRelease(
          input.buildProjectId,
          nextSession,
        );
      }
      if (mountedRef.current) {
        try { window.sessionStorage.removeItem(`zoebuild:dependency-recovery:${input.buildProjectId}`); } catch { /* optional */ }
        setPreview({ src: basePath, state: "ready", message: null, revision: 0 });
      }

      if (
        workspaceRevisionRef.current !== startingWorkspaceRevision ||
        !workspaceSyncEntriesEqual(startingEntries, [...workspaceEntriesRef.current])
      ) {
        await syncCurrent();
      }
    })();

    startPromiseRef.current = task;
    try {
      await task;
    } catch (error) {
      if (mountedRef.current) {
        setPreview((current) => ({
          src: current?.src ?? sessionRef.current?.basePath ?? null,
          state: "error",
          message: error instanceof Error ? error.message : "React preview is unavailable.",
          revision: current?.revision ?? 0,
        }));
      }
    } finally {
      startPromiseRef.current = null;
    }
  }, [input.buildProjectId, input.enabled, syncCurrent]);

  const restart = useCallback(() => {
    void (async () => {
      await cancelCurrent();
      await start();
    })();
  }, [cancelCurrent, start]);

  useEffect(() => {
    mountedRef.current = true;

    clearPreviewRelease(
      input.buildProjectId,
    );

    if (!input.enabled) {
      setPreview(null);
      void cancelCurrent();
      return;
    }

    const cachedSession =
      getCachedPreviewSession(
        input.buildProjectId,
      );

    if (cachedSession) {
      sessionRef.current =
        cachedSession;

      setPreview({
        src: cachedSession.basePath,
        state: "ready",
        message: null,
        revision: 0,
      });

      // A cached client-side session may have expired on the runner while the
      // browser was on another route. An unchanged workspace is NOT evidence
      // that the capability document is still alive. Probe it once, read-only,
      // before reusing it. Auth failures and malformed responses fail visibly;
      // only an explicit expired response starts a replacement session.
      void (async () => {
        const response = await fetch(cachedSession.basePath, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "text/html" },
        });
        if (!mountedRef.current || sessionRef.current?.previewId !== cachedSession.previewId) return;
        const health = classifyCachedPreviewDocument(
          response.status, response.headers.get("content-type"),
        );
        if (health === "expired") throw new Error("PREVIEW_EXPIRED");
        if (health === "unavailable") {
          throw new Error(`Cached React preview document is unavailable (HTTP ${response.status}). Use Retry to restart the preview.`);
        }
        await syncCurrent();
      })().catch(
        (error) => {
          // Ignore a stale health check after a route change/restart.
          if (!mountedRef.current ||
              sessionRef.current?.previewId !== cachedSession.previewId) return;
          if (
            error instanceof Error &&
            (error.message ===
              "PREVIEW_EXPIRED" ||
              error.message ===
                "PREVIEW_RESTART_REQUIRED")
          ) {
            void (async () => {
              await cancelCurrent();
              await start();
            })();
            return;
          }

          if (mountedRef.current) {
            setPreview(
              (current) => ({
                src:
                  current?.src ??
                  cachedSession.basePath,
                state: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "React preview is unavailable.",
                revision:
                  current?.revision ??
                  0,
              }),
            );
          }
        },
      );
    } else {
      void start();
    }

    return () => {
      mountedRef.current = false;

      if (syncTimerRef.current) {
        clearTimeout(
          syncTimerRef.current,
        );
      }

      const session =
        sessionRef.current;

      if (session) {
        rememberPreviewSession(
          input.buildProjectId,
          session,
        );

        schedulePreviewRelease(
          input.buildProjectId,
          session,
        );
      }
    };
  }, [
    cancelCurrent,
    input.buildProjectId,
    input.enabled,
    start,
    syncCurrent,
  ]);

  useEffect(() => {
    if (!input.enabled || !sessionRef.current) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    syncTimerRef.current = setTimeout(() => {
      void syncCurrent().catch((error) => {
        if (error instanceof Error &&
          (error.message === "PREVIEW_EXPIRED" ||
            error.message === "PREVIEW_RESTART_REQUIRED")) {
          restart();
          return;
        }
        if (mountedRef.current) {
          setPreview((current) => ({
            src: current?.src ?? sessionRef.current?.basePath ?? null,
            state: "error",
            message: error instanceof Error ? error.message : "React preview is unavailable.",
            revision: current?.revision ?? 0,
          }));
        }
      });
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [input.enabled, restart, syncCurrent, workspaceContentRevision]);

  return preview ? { ...preview, routes: registeredReactPreviewRoutes(initialWorkspaceEntries), onRetry: restart } : null;
}
