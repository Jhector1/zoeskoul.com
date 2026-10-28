"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";
import { workspaceSyncEntriesEqual } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import { registeredReactPreviewRoutes } from "@/lib/build/reactPreviewPageCatalog";
import { mayAutoRecoverReactPreviewDependencies } from "@/lib/build/reactPreviewDependencyRecovery";
import { previewDependencySnapshotChanged } from "@/lib/build/reactPreviewDependencySession";
import { previewCapacityRetryDelayMs } from "@/lib/build/previewCapacityRecovery";
import { previewDocumentGatewayUrl, classifyPreviewDocumentHealth } from "@/lib/build/previewDocumentIntegrity";
import { claimSavedDependencyFollowUp, clearSavedDependencyRecoveryGuards } from "@/lib/build/savedDependencyRecoveryContinuation";

type PreviewSession = Readonly<{
  previewId: string;
  basePath: string;
  workspaceEntries: readonly WorkspaceSyncEntry[];
}>;
type ApiPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  requestId?: string;
  preview?: { previewId?: string; basePath?: string };
  operation?: {
    operationId?: string; sourceVersion?: number;
    state?: "preparing" | "ready" | "failed" | "cancelled";
    stage?: "queued" | "workspace" | "dependencies" | "container" | "readiness";
    code?: string;
    preview?: { previewId?: string; basePath?: string };
  };
  bootstrap?: { source?: { sourceVersion?: number } };
};

const SYNC_DEBOUNCE_MS = 650;
const PREVIEW_START_SLOW_NOTICE_MS = 15_000;
// This timeout covers only the acknowledgement of a server-owned operation.
// The runner may legitimately need minutes for an approved frozen install.
const PREVIEW_START_TIMEOUT_MS = 30_000;
const PREVIEW_OPERATION_TIMEOUT_MS = 6 * 60_000;
const PREVIEW_OPERATION_POLL_INTERVAL_MS = 2_000;

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
  restoredDependencyPinned?: boolean;
  onSourceConflict?: (attemptedSourceVersion: number) => Promise<boolean>;
}>): (RemoteWebPreviewDescriptor & {confirmedSourceVersion:number|null;attemptedSourceVersion:number|null}) | null {
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
              src: null,
              state: "starting",
              message: "Checking your saved preview…",
              revision: 0,
            }
          : {
              src: null,
              state: "starting",
              message:
                "Preparing your website…",
              revision: 0,
            }
        : null,
    );

  const [confirmedSourceVersion, setConfirmedSourceVersion] = useState<number|null>(
    initialSession && workspaceSyncEntriesEqual([...initialSession.workspaceEntries], initialWorkspaceEntries)
      ? input.sourceVersion : null,
  );
  const [attemptedSourceVersion, setAttemptedSourceVersion] = useState<number|null>(null);
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
  const restoredDependencyPinnedRef = useRef(input.restoredDependencyPinned === true);
  const sourceConflictCallbackRef = useRef(input.onSourceConflict);
  sourceConflictCallbackRef.current = input.onSourceConflict;
  const [resyncFromVersion, setResyncFromVersion] = useState<number | null>(null);
  const triedResyncVersionsRef = useRef(new Set<number>());
  const workspaceRevisionRef = useRef(0);
  const [workspaceContentRevision, setWorkspaceContentRevision] = useState(0);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const restartPromiseRef = useRef<Promise<void> | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 409 means the saved project advanced on the server. Re-read its canonical
  // workspace only through the owner-authenticated parent, and at most once per
  // stale source token; never replace local unsaved code or invent a version.
  const reconcileConflict = useCallback(async (attemptedVersion: number) => {
    if (triedResyncVersionsRef.current.has(attemptedVersion)) return false;
    const refresh = sourceConflictCallbackRef.current;
    // A non-advanced authoritative head is not proof that a future
    // recheck must fail. Only consume this token after a SUCCESSFUL rehydrate.
    // Otherwise a preview 409 may arrive just before bootstrap commits and
    // permanently block synchronization after that commit.
    if (!refresh || !(await refresh(attemptedVersion))) return false;
    triedResyncVersionsRef.current.add(attemptedVersion);
    if (mountedRef.current) {
      setConfirmedSourceVersion(null);
      setPreview(current => ({
        src:null, state:"starting", message:"Synchronizing your saved version…",
        revision:current?.revision ?? 0,
      }));
      setResyncFromVersion(attemptedVersion);
    }
    return true;
  }, []);

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
    // A new source token is not a verified preview until the runner has the
    // exact selected bytes. Identical bytes can reuse the same runner session.
    const session = sessionRef.current;
    const expectedEntries = exportWorkspaceEntries(workspaceRef.current.nodes);
    setConfirmedSourceVersion(session &&
      workspaceSyncEntriesEqual([...session.workspaceEntries], expectedEntries)
      ? input.sourceVersion : null);
  }, [input.sourceVersion, input.workspace]);

  useEffect(() => {
    bootstrapAllowedRef.current = input.allowDependencyBootstrap;
    restoredDependencyPinnedRef.current = input.restoredDependencyPinned === true;
  }, [input.allowDependencyBootstrap, input.restoredDependencyPinned]);

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
        ) {
          if (mountedRef.current && sourceVersionRef.current === sendingVersion)
            setConfirmedSourceVersion(sendingVersion);
          return;
        }

        // Vite HMR cannot install a different dependency graph. A saved-history
        // selection may change package.json, its lock, or its server approval.
        // Stop before sending /sync, release the old capability, and prepare
        // the EXACT selected revision through the normal /preview/start flow.
        // A genuine invalid approval will still be rejected by that server flow.
        if (previewDependencySnapshotChanged(session.workspaceEntries, sendingEntries)) {
          throw new Error("PREVIEW_RESTART_REQUIRED");
        }

        if (mountedRef.current) {
          setPreview((current) =>
            current ? { ...current, state: "syncing", message: "Updating preview…" } : current,
          );
        }

        if (mountedRef.current) setAttemptedSourceVersion(sendingVersion);
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
        if (response.status === 409 && data?.code === "BUILD_PREVIEW_SOURCE_CONFLICT") {
          if (await reconcileConflict(sendingVersion)) {
            await cancelCurrent();
            return;
          }
          throw new Error("The saved project changed. Keep any unsaved edits before reloading the project.");
        }
        if (!response.ok || !data?.ok) {
          const errorMessage = message(data, "React preview could not be updated.");
          // A previously cached session can also carry the same dependency
          // bytes but lack approval in the restored server snapshot. Sync has
          // no bootstrap step: hand this specific recoverable 409 to /start.
          if ((response.status === 409 && mayAutoRecoverReactPreviewDependencies({
            status: response.status, code: data?.code, message: data?.message,
          })) || /dependencies changed/i.test(errorMessage)) {
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
          if (sourceVersionRef.current === sendingVersion) setConfirmedSourceVersion(sendingVersion);
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
  }, [input.buildProjectId, cancelCurrent, reconcileConflict]);

  const start = useCallback(async () => {
    if (
      !input.enabled ||
      startPromiseRef.current ||
      sessionRef.current
    ) return;

    const startingWorkspaceRevision = workspaceRevisionRef.current;
    let supersededDuringStart = false;
    const task = (async () => {
      if (mountedRef.current) {
        setPreview((current) => ({
          src: current?.src ?? null,
          state: "starting",
          message: "Starting or reusing a preview worker…",
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
                  "Preview worker is still preparing this website…",
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

      if (mountedRef.current) setAttemptedSourceVersion(startingVersion);
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
            "The preview server did not acknowledge the start request. Retry preview.",
          );
        }
        throw error;
      } finally {
        clearTimeout(slowNoticeTimer);
        clearTimeout(startTimeoutTimer);
      }
      let data = await payload(response);
      if (response.status === 409 && data?.code === "BUILD_PREVIEW_SOURCE_CONFLICT") {
        if (await reconcileConflict(startingVersion)) return;
        throw new Error("The saved project changed. Keep any unsaved edits before reloading the project.");
      }

      const dependencyLockRequired = mayAutoRecoverReactPreviewDependencies({
        status: response.status,
        code: data?.code,
        message: data?.message,
      });

      if (dependencyLockRequired) {
        const recoveryKey = `zoebuild:dependency-recovery:${input.buildProjectId}:${startingVersion}`;
        // The first successful bootstrap can finish before the restored source
        // has been rehydrated. A completed marker is not proof of an unsafe
        // package. Allow ONE more trusted CAS-bound attempt automatically.
        // Real safety denials still come from the backend and are never bypassed.
        const recoveryPermission = claimSavedDependencyFollowUp(window.sessionStorage, recoveryKey);
        if (recoveryPermission === "exhausted") {
          // Never turn a stale internal source token into a dependency denial.
          // The server remains authoritative and may have advanced the head
          // during the preceding verified bootstrap.
          if (await reconcileConflict(startingVersion)) return;
          console.warn("[ZoeBuild preview] bounded dependency recovery exhausted", {
            phase: "bootstrap-guard", sourceVersion: startingVersion,
          });
          // This is a CLIENT retry budget, not a verdict on the saved packages.
          // The previous bootstrap operations may have completed successfully.
          throw new Error("Automatic preview preparation did not finish after bounded retries. Your saved files are safe. Retry after the source finishes synchronizing.");
        }
        if (!bootstrapAllowedRef.current) {
          throw new Error(restoredDependencyPinnedRef.current
            ? "This restored version is already saved. ZoeBuild could not automatically verify its historical dependency lock. Original version files remain unchanged."
            : "Save your changes before ZoeBuild prepares the React dependency lock.");
        }

        if (mountedRef.current) {
          setPreview((current) => ({
            src: current?.src ?? null,
            state: "starting",
            message: "Verifying the saved version dependency lock…",
            revision: current?.revision ?? 0,
          }));
        }

        // Runner backpressure is not a dependency-integrity denial. Retain the
        // exact saved-source CAS and wait only within a finite wall-clock
        // budget. Do not persist a one-retry token across page reloads.
        const requestBootstrap = () => fetch(
          `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/dependency-lock/bootstrap`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reconcileExisting: true,
              baseVersion: startingVersion,
              autoRestoreDependencies: restoredDependencyPinnedRef.current,
              autoPrepareProjectDependencies: !restoredDependencyPinnedRef.current,
            }),
          },
        );
        const capacityStartedAt = Date.now();
        let capacityRetries = 0;
        let bootstrap = await requestBootstrap();
        let bootstrapData = await payload(bootstrap);
        while (bootstrap.status === 429 &&
            bootstrapData?.code === "BUILD_RUNNER_CAPACITY_REACHED" &&
            capacityRetries < 4) {
          const waitMs = previewCapacityRetryDelayMs(bootstrap.headers.get("Retry-After"));
          if (Date.now() - capacityStartedAt + waitMs > 240_000) break;
          if (mountedRef.current) setPreview(current => ({
            src: null, state: "starting",
            message: "Preparing your website when a preview worker is available…",
            revision: current?.revision ?? 0,
          }));
          await new Promise<void>(resolve => window.setTimeout(resolve, waitMs));
          if (!mountedRef.current || !bootstrapAllowedRef.current ||
              workspaceRevisionRef.current !== startingWorkspaceRevision ||
              sourceVersionRef.current !== startingVersion) return;
          capacityRetries += 1;
          bootstrap = await requestBootstrap();
          bootstrapData = await payload(bootstrap);
        }
        if (bootstrap.status === 429 &&
            bootstrapData?.code === "BUILD_RUNNER_CAPACITY_REACHED") {
          throw new Error("Preview preparation is temporarily at capacity. Your saved version is safe; retry when a worker is free.");
        }
        // A prior successful preparation may have advanced the authoritative
        // saved-source token. Follow it rather than repeating package work or
        // mislabeling a harmless stale request as an unsafe dependency.
        if (bootstrap.status === 409 && (
            bootstrapData?.code === "BUILD_SOURCE_CONFLICT" ||
            bootstrapData?.code === "BUILD_HISTORY_STALE")) {
          if (await reconcileConflict(startingVersion)) return;
          console.warn("[ZoeBuild preview] dependency preparation source conflict", {
            phase: "bootstrap", status: bootstrap.status, code: bootstrapData?.code,
            requestId: bootstrapData?.requestId, sourceVersion: startingVersion,
          });
          throw new Error("This tab has an outdated saved version. Reload the project to synchronize before previewing.");
        }
        if (!bootstrap.ok || !bootstrapData?.ok) {
          // Only report bounded failure metadata. Never log workspace source,
          // package contents, environment values, or runner credentials.
          console.warn("[ZoeBuild preview] dependency preparation rejected", {
            phase: "bootstrap", status: bootstrap.status, code: bootstrapData?.code,
            requestId: bootstrapData?.requestId, sourceVersion: startingVersion,
          });
          // A trusted auto-recovery denial is a safety decision, not a prompt
          // for nontechnical users to approve arbitrary package installation.
          if ([
            "BUILD_RESTORE_DEPENDENCIES_UNVERIFIED",
            "BUILD_RESTORE_DEPENDENCY_APPROVAL_PRESENT",
            "BUILD_RESTORE_DEPENDENCIES_UNSUPPORTED",
            "BUILD_RESTORE_DEPENDENCIES_PINNED",
            "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",
            "BUILD_DEPENDENCY_LOCK_INVALID",
          ].includes(bootstrapData?.code ?? "")) {
            const reason = typeof bootstrapData?.code === "string" &&
              /^BUILD_[A-Z0-9_]{3,96}$/.test(bootstrapData.code)
              ? bootstrapData.code : "BUILD_DEPENDENCIES_UNVERIFIED";
            throw new Error(`ZoeBuild couldn't safely prepare this saved version. Your saved files are unchanged. Reason: ${reason}`);
          }
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
        try {
          window.sessionStorage.setItem(recoveryKey, "completed");
        } catch { /* optional */ }
        const preparedVersion = bootstrapData.bootstrap?.source?.sourceVersion;
        if (typeof preparedVersion === "number" &&
            Number.isSafeInteger(preparedVersion) && preparedVersion > startingVersion) {
          // Rehydrate from the authenticated source reader, preserving Zoé's
          // conversation and avoiding a full page reload when possible.
          if (await reconcileConflict(startingVersion)) return;
        }
        // Exact-lock adoption can leave the concurrency token unchanged.
        // In that case a reload refreshes workspace files without a new save.
        window.location.reload();
        return;
      }

      // The runner owns startup beyond the HTTP request. Follow its journaled
      // operation state; never infer success from an elapsed browser timeout.
      if (response.ok && data?.ok && data.operation?.operationId) {
        const operationId = data.operation.operationId;
        if (!/^preview_op_[0-9a-f-]{36}$/i.test(operationId) ||
            data.operation.sourceVersion !== startingVersion) {
          throw new Error("The preview operation returned an invalid source identity.");
        }
        const operationDeadline = Date.now() + PREVIEW_OPERATION_TIMEOUT_MS;
        let current = data.operation;
        while (true) {
          // A browser tab may select a different saved revision while the
          // runner continues. Do not publish an obsolete preview document.
          if (!mountedRef.current) return;
          if (sourceVersionRef.current !== startingVersion ||
              workspaceRevisionRef.current !== startingWorkspaceRevision) {
            supersededDuringStart = true;
            return;
          }
          if (current.state === "ready" && current.preview) {
            data = { ok: true, preview: current.preview };
            break;
          }
          if (current.state === "failed" || current.state === "cancelled") {
            const failure = current.code === "PREVIEW_RUNNER_RESTARTED"
              ? "The preview worker restarted. Retry to start a new preview."
              : current.code === "PREVIEW_CAPACITY"
                ? "Preview capacity is busy. Retry when the worker is available."
                : current.code === "PREVIEW_SOURCE_CONFLICT"
                  ? "The saved version changed while its preview was preparing."
                  : current.state === "cancelled"
                    ? "The preview startup was cancelled. Retry preview."
                    : "The preview worker could not prepare this website. Retry preview.";
            throw new Error(failure);
          }
          if (Date.now() >= operationDeadline) {
            throw new Error("Preview preparation exceeded the bounded startup budget. Retry preview.");
          }
          const stageMessage = current.stage === "dependencies"
            ? "Preparing approved website dependencies…"
            : current.stage === "container" || current.stage === "readiness"
              ? "Starting and verifying the website…"
              : "Your website is queued for the preview worker…";
          if (mountedRef.current) setPreview(previous => ({
            src: null, state: "starting", message: stageMessage,
            revision: previous?.revision ?? 0,
          }));
          await new Promise<void>(resolve => window.setTimeout(resolve, PREVIEW_OPERATION_POLL_INTERVAL_MS));
          if (!mountedRef.current) return;
          if (sourceVersionRef.current !== startingVersion ||
              workspaceRevisionRef.current !== startingWorkspaceRevision) {
            supersededDuringStart = true;
            return;
          }
          const statusResponse = await fetch(
            `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/operations/${encodeURIComponent(operationId)}`,
            { method: "GET", credentials: "same-origin", cache: "no-store" },
          );
          const statusPayload = await payload(statusResponse);
          if (statusResponse.status === 409 && statusPayload?.code === "BUILD_PREVIEW_SOURCE_CONFLICT") {
            if (await reconcileConflict(startingVersion)) return;
            throw new Error("A newer saved source is active. Refresh the selected version.");
          }
          if (!statusResponse.ok || !statusPayload?.ok || !statusPayload.operation) {
            throw new Error(message(statusPayload, "Preview operation status is unavailable. Retry preview."));
          }
          if (statusPayload.operation.operationId !== operationId ||
              statusPayload.operation.sourceVersion !== startingVersion) {
            throw new Error("The preview worker returned a different saved source.");
          }
          current = statusPayload.operation;
        }
      }

      if (!response.ok || !data?.ok || !data.preview) {
        throw new Error(message(data, "React preview could not be started."));
      }

      if (mountedRef.current) setPreview(current=>({
        src:null,state:"starting",message:"Verifying the website document…",
        revision:current?.revision??0,
      }));
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

      // The actual browser document gateway may fail even when Vite itself
      // reports ready. Never show a white 404 frame as a successful preview.
      const documentCheck = await fetch(previewDocumentGatewayUrl(basePath), {
        method: "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "text/html" },
      });
      const documentHealth = classifyPreviewDocumentHealth(
        documentCheck.status,
        documentCheck.headers.get("content-type"),
        documentCheck.headers.get("X-ZoeBuild-Preview-Failure"),
      );
      if (documentHealth !== "ready") {
        // The runner may have dropped the preview or its routing is unstable.
        // Do not retain an unusable capability in the client session cache.
        const unusable: PreviewSession = { previewId, basePath, workspaceEntries: startingEntries };
        await cancelPreviewSession(input.buildProjectId, unusable);
        throw new Error(documentHealth === "expired"
          ? "Preview service lost this session. Retry to start a fresh preview; if this repeats, check runner routing."
          : "The preview document is not available yet. Try again after the runner is healthy.");
      }
      const changedDuringStart=sourceVersionRef.current !== startingVersion ||
        !workspaceSyncEntriesEqual(startingEntries,exportWorkspaceEntries(workspaceRef.current.nodes));
      if (changedDuringStart) setConfirmedSourceVersion(null);

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
        clearSavedDependencyRecoveryGuards(window.sessionStorage,
          `zoebuild:dependency-recovery:${input.buildProjectId}:${startingVersion}`);
        if (workspaceSyncEntriesEqual(startingEntries, exportWorkspaceEntries(workspaceRef.current.nodes))) {
          setConfirmedSourceVersion(sourceVersionRef.current);
          triedResyncVersionsRef.current.delete(startingVersion);
        }
        else setConfirmedSourceVersion(null);
        setPreview(changedDuringStart
          ? {src:null,state:"syncing",message:"Synchronizing the newly selected version…",revision:0}
          : {src:basePath,state:"ready",message:null,revision:0});
      }

      if (changedDuringStart || workspaceRevisionRef.current !== startingWorkspaceRevision) {
        // Old start responses never become visible while a newer source is selected.
        // The synchronized acknowledgement below must match exact source bytes.
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
      // An earlier history version can retire while its cold start is queued.
      // Start the now-selected source after the old operation is detached;
      // never automatically loop on a genuine startup error.
      if (supersededDuringStart && mountedRef.current && !sessionRef.current) {
        void Promise.resolve().then(() => start());
      }
    }
  }, [input.buildProjectId, input.enabled, syncCurrent, reconcileConflict]);

  // An authoritative rehydrate completes on the next React render, not inside
  // the original 409 request. Start only from the NEW source token; never
  // retry with the retired one and never make another history snapshot.
  useEffect(() => {
    if (!input.enabled || resyncFromVersion === null ||
        input.sourceVersion === resyncFromVersion) return;
    let cancelled = false;
    void (async () => {
      // Do not lose the restart if React commits the fresh source before the
      // retired start promise clears its in-flight guard.
      const retiredStart = startPromiseRef.current;
      if (retiredStart) await retiredStart;
      if (cancelled || !mountedRef.current || !input.enabled ||
          sourceVersionRef.current !== input.sourceVersion) return;
      setResyncFromVersion(null);
      if (!sessionRef.current) await start();
    })();
    return () => { cancelled = true; };
  }, [resyncFromVersion, input.sourceVersion, input.enabled, start]);

  const restart = useCallback(() => {
    // Prevent retry clicks from racing with a not-yet-completed cold start.
    if (restartPromiseRef.current) return;
    try {
      clearSavedDependencyRecoveryGuards(window.sessionStorage,
        `zoebuild:dependency-recovery:${input.buildProjectId}:${sourceVersionRef.current}`);
    } catch { /* optional */ }
    const task=(async()=>{
      await startPromiseRef.current?.catch(()=>{});
      await syncPromiseRef.current?.catch(()=>{});
      if(!mountedRef.current)return;
      await cancelCurrent();
      if(mountedRef.current)await start();
    })();
    restartPromiseRef.current=task;
    void task.finally(()=>{if(restartPromiseRef.current===task)restartPromiseRef.current=null;}).catch(()=>{});
  }, [cancelCurrent, start, input.buildProjectId]);

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
        src: null,
        state: "starting",
        message: "Checking your saved preview…",
        revision: 0,
      });

      // A cached client-side session may have expired on the runner while the
      // browser was on another route. An unchanged workspace is NOT evidence
      // that the capability document is still alive. Probe it once, read-only,
      // before reusing it. Auth failures and malformed responses fail visibly;
      // only an explicit expired response starts a replacement session.
      void (async () => {
        const response = await fetch(previewDocumentGatewayUrl(cachedSession.basePath), {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "text/html" },
        });
        if (!mountedRef.current || sessionRef.current?.previewId !== cachedSession.previewId) return;
        const health = classifyPreviewDocumentHealth(
          response.status, response.headers.get("content-type"),
          response.headers.get("X-ZoeBuild-Preview-Failure"),
        );
        if (health === "expired") throw new Error("PREVIEW_EXPIRED");
        if (health === "unavailable") {
          throw new Error(`Cached React preview document is unavailable (HTTP ${response.status}). Use Retry to restart the preview.`);
        }
        await syncCurrent();
        if (!mountedRef.current || sessionRef.current?.previewId !== cachedSession.previewId) return;
        setPreview(current => ({
          src: cachedSession.basePath, state: "ready", message: null,
          revision: current?.revision ?? 0,
        }));
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

  return preview ? { ...preview, confirmedSourceVersion, attemptedSourceVersion, routes: registeredReactPreviewRoutes(initialWorkspaceEntries), onRetry: restart } : null;
}
