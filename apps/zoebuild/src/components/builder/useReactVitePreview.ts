"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";
import { workspaceSyncEntriesEqual } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import { registeredReactPreviewRoutes } from "@/lib/build/reactPreviewPageCatalog";

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

  const syncCurrent = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const nextEntries = [...workspaceEntriesRef.current];
    if (
      workspaceSyncEntriesEqual([...session.workspaceEntries], nextEntries)
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
          sourceVersion: sourceVersionRef.current,
          workspace: workspaceRef.current,
        }),
      },
    );

    const data = await payload(response);
    if (response.status === 404) {
      throw new Error("PREVIEW_EXPIRED");
    }
    if (!response.ok || !data?.ok) {
      const errorMessage = message(data, "React preview could not be updated.");
      if (/dependencies changed/i.test(errorMessage)) {
        throw new Error("PREVIEW_RESTART_REQUIRED");
      }
      throw new Error(errorMessage);
    }

    const nextSession: PreviewSession = {
      ...session,
      workspaceEntries: nextEntries,
    };
    sessionRef.current = nextSession;
    rememberPreviewSession(input.buildProjectId, nextSession);

    if (mountedRef.current) {
      setPreview((current) =>
        current
          ? {
              ...current,
              state: "ready",
              message: null,
              // Current preview transport is HTTP-only; refresh the browser
              // document only after a real semantic source sync.
              revision: current.revision + 1,
            }
          : current,
      );
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

      let response: Response;
      try {
        response = await fetch(
          `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/start`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceVersion: sourceVersionRef.current,
              workspace: workspaceRef.current,
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

      const dependencyLockRequired =
        response.status === 409 &&
        typeof data?.code === "string" &&
        data.code.startsWith("BUILD_DEPENDENCY_LOCK");

      if (dependencyLockRequired) {
        if (!bootstrapAllowedRef.current) {
          throw new Error(
            "Save your changes before ZoeBuild prepares the React dependency lock.",
          );
        }

        if (mountedRef.current) {
          setPreview((current) => ({
            src: current?.src ?? null,
            state: "starting",
            message: "Preparing the one-time React dependency lock…",
            revision: current?.revision ?? 0,
          }));
        }

        const bootstrap = await fetch(
          `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/dependency-lock/bootstrap`,
          { method: "POST", credentials: "same-origin" },
        );
        const bootstrapData = await payload(bootstrap);
        if (!bootstrap.ok || !bootstrapData?.ok) {
          throw new Error(message(bootstrapData, "React dependency preparation failed."));
        }

        if (!bootstrapAllowedRef.current) {
          throw new Error(
            "React dependencies were prepared, but local edits appeared before reload. Save and reload the project.",
          );
        }

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
        workspaceEntries: [...workspaceEntriesRef.current],
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
        setPreview({ src: basePath, state: "ready", message: null, revision: 0 });
      }

      if (workspaceRevisionRef.current !== startingWorkspaceRevision) {
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

      void syncCurrent().catch(
        (error) => {
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
