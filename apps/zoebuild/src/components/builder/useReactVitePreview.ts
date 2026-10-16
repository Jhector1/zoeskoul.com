"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";

type PreviewSession = Readonly<{ previewId: string; basePath: string }>;
type ApiPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  preview?: { previewId?: string; basePath?: string };
};

const SYNC_DEBOUNCE_MS = 650;

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
  const [preview, setPreview] = useState<RemoteWebPreviewDescriptor | null>(
    input.enabled
      ? {
          src: null,
          state: "starting",
          message: "Preparing the trusted React/Vite preview…",
          revision: 0,
        }
      : null,
  );

  const mountedRef = useRef(true);
  const sessionRef = useRef<PreviewSession | null>(null);
  const workspaceRef = useRef(input.workspace);
  const sourceVersionRef = useRef(input.sourceVersion);
  const bootstrapAllowedRef = useRef(input.allowDependencyBootstrap);
  const workspaceRevisionRef = useRef(0);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    workspaceRef.current = input.workspace;
    workspaceRevisionRef.current += 1;
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
    if (!session) return;
    await fetch(
      `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/${encodeURIComponent(session.previewId)}/cancel`,
      { method: "POST", credentials: "same-origin" },
    ).catch(() => undefined);
  }, [input.buildProjectId]);

  const syncCurrent = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

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
      throw new Error(message(data, "React preview could not be updated."));
    }

    if (mountedRef.current) {
      setPreview((current) =>
        current
          ? { ...current, state: "ready", message: null, revision: current.revision + 1 }
          : current,
      );
    }
  }, [input.buildProjectId]);

  const start = useCallback(async () => {
    if (!input.enabled || startPromiseRef.current) return;

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

      const response = await fetch(
        `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/start`,
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

      sessionRef.current = { previewId, basePath };
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
    if (!input.enabled) {
      setPreview(null);
      void cancelCurrent();
      return;
    }

    void start();

    return () => {
      mountedRef.current = false;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      void cancelCurrent();
    };
  }, [cancelCurrent, input.enabled, start]);

  useEffect(() => {
    if (!input.enabled || !sessionRef.current) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    syncTimerRef.current = setTimeout(() => {
      void syncCurrent().catch((error) => {
        if (error instanceof Error && error.message === "PREVIEW_EXPIRED") {
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
  }, [input.enabled, input.sourceVersion, input.workspace, restart, syncCurrent]);

  return preview ? { ...preview, onRetry: restart } : null;
}
