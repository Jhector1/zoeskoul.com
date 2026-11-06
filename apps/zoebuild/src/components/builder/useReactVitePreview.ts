"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";
import { workspaceSyncEntriesEqual } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import { registeredTanstackPreviewRoutes } from "@/lib/build/tanstackPreviewPageCatalog";
import { mayAutoRecoverReactPreviewDependencies } from "@/lib/build/reactPreviewDependencyRecovery";
import { previewCapacityRetryDelayMs } from "@/lib/build/previewCapacityRecovery";
import { previewOperationStageMessage, previewStartOutcomeIsCurrent } from "@/lib/build/previewTransitionPolicy";
import { previewDocumentGatewayUrl, classifyPreviewDocumentHealth } from "@/lib/build/previewDocumentIntegrity";
import { claimSavedDependencyFollowUp, clearSavedDependencyRecoveryGuards } from "@/lib/build/savedDependencyRecoveryContinuation";
import { readPreviewOperationStatus } from "@/lib/build/previewOperationHttp";
import { decideTanstackPreviewSync } from "@/lib/build/tanstackPreviewSyncDecision";
import { recordPreviewBrowserTiming } from "@/lib/build/previewPerformance";

type PreviewSession = Readonly<{
  previewId: string;
  sourceVersion: number;
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
    timing?: {
      startKind?: "cold" | "restart" | "reuse";
      reuseCandidate?: boolean;
      stages?: Record<string,{outcome?:string;durationMs?:number;reason?:string}>;
    };
  };
  bootstrap?: { source?: { sourceVersion?: number } };
};

const SYNC_DEBOUNCE_MS = 650;
const PREVIEW_START_SLOW_NOTICE_MS = 15_000;
// This timeout covers only the acknowledgement of a server-owned operation.
// The runner may legitimately need minutes for an approved frozen install.
// This guards the HTTP acknowledgment only, including cold Next.js route
// compilation. After acknowledgment the runner journal owns the lifecycle.
const PREVIEW_START_TIMEOUT_MS = 120_000;
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
  /** Called ONLY after a verified server dependency-bootstrap success. */
  onDependencyPrepared?: (attemptedSourceVersion: number) => Promise<boolean>;
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
    initialSession && initialSession.sourceVersion === input.sourceVersion &&
      workspaceSyncEntriesEqual([...initialSession.workspaceEntries], initialWorkspaceEntries)
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
  const dependencyPreparedCallbackRef = useRef(input.onDependencyPrepared);
  dependencyPreparedCallbackRef.current = input.onDependencyPrepared;
  const [preparedReplaySerial, setPreparedReplaySerial] = useState(0);
  const [resyncFromVersion, setResyncFromVersion] = useState<number | null>(null);
  const triedResyncVersionsRef = useRef(new Set<number>());
  const workspaceRevisionRef = useRef(0);
  const [workspaceContentRevision, setWorkspaceContentRevision] = useState(0);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const restartPromiseRef = useRef<Promise<void> | null>(null);
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

  // One bounded in-page continuation follows an authenticated dependency
  // preparation. This path deliberately does not use the generic 409 token
  // fence: exact-lock adoption can keep the same source CAS. The browser's
  // persisted dependency guard still limits repeated bootstraps.
  const reconcilePreparedDependencies = useCallback(async (attemptedVersion: number) => {
    const refresh = dependencyPreparedCallbackRef.current;
    if (!refresh || !(await refresh(attemptedVersion))) return false;
    if (mountedRef.current) {
      setConfirmedSourceVersion(null);
      setPreview(current => ({
        src: null, state: "starting", message: "Continuing the prepared website…",
        revision: current?.revision ?? 0,
      }));
      setPreparedReplaySerial(serial => serial + 1);
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
    setConfirmedSourceVersion(session && session.sourceVersion === input.sourceVersion &&
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

  // An active TanStack lease is immutable. In particular, local editor changes
  // must NEVER go to the retired mutation endpoint. Only a new owner-authorized /start
  // may install a new saved-source snapshot (including server functions).
  const syncCurrent = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const selectedVersion = sourceVersionRef.current;
    const decision = decideTanstackPreviewSync({
      sessionSourceVersion: session.sourceVersion,
      selectedSourceVersion: selectedVersion,
      sessionEntries: session.workspaceEntries,
      selectedEntries: exportWorkspaceEntries(workspaceRef.current.nodes),
      hasUnsavedChanges: !bootstrapAllowedRef.current,
    });
    if (decision === "hold") return;
    if (decision === "restart") throw new Error("PREVIEW_RESTART_REQUIRED");
    if (mountedRef.current && sourceVersionRef.current === selectedVersion) {
      setConfirmedSourceVersion(selectedVersion);
    }
  }, []);

  const start = useCallback(async () => {
    if (
      !input.enabled ||
      startPromiseRef.current ||
      sessionRef.current
    ) return;

    const startingWorkspaceRevision = workspaceRevisionRef.current;
    const startingSourceVersion = sourceVersionRef.current;
    const intentStartedAt = performance.now();
    let startKind: "cold" | "restart" | "reuse" = "cold";
    let operationStartedAtForMetrics: number | null = null;
    let operationTimingRecorded = false;
    const recordOperationTiming = (outcome: "ok" | "error" | "cancelled") => {
      if (operationTimingRecorded || operationStartedAtForMetrics === null) return;
      operationTimingRecorded = true;
      recordPreviewBrowserTiming({stage:"operation_ready",kind:startKind,outcome,
        durationMs:performance.now()-operationStartedAtForMetrics});
    };
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
      const acknowledgementStartedAt = performance.now();
      let acknowledgementDurationMs = 0;
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
        acknowledgementDurationMs = performance.now()-acknowledgementStartedAt;
      } catch (error) {
        recordPreviewBrowserTiming({
          stage:"start_acknowledgement",kind:startKind,
          outcome:startController.signal.aborted?"cancelled":"error",
          durationMs:performance.now()-acknowledgementStartedAt,
        });
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
      startKind = data?.operation?.timing?.startKind === "reuse" ? "reuse" :
        data?.operation?.timing?.startKind === "restart" ? "restart" : "cold";
      recordPreviewBrowserTiming({
        stage:"start_acknowledgement",kind:startKind,
        outcome:response.ok?"ok":"error",durationMs:acknowledgementDurationMs,
      });
      if (response.status === 409 &&
          (data?.code === "BUILD_PREVIEW_SOURCE_CONFLICT" ||
           data?.code === "BUILD_PREVIEW_NEWER_OPERATION")) {
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
        const bootstrapStartedAt = performance.now();
        let capacityRetries = 0;
        let bootstrap: Response;
        let bootstrapData: ApiPayload | null;
        try {
          bootstrap = await requestBootstrap();
          bootstrapData = await payload(bootstrap);
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
            const bootstrapCancelled = !mountedRef.current || !bootstrapAllowedRef.current ||
                workspaceRevisionRef.current !== startingWorkspaceRevision ||
                sourceVersionRef.current !== startingVersion;
            if (bootstrapCancelled) {
              recordPreviewBrowserTiming({stage:"dependency_bootstrap",kind:startKind,
                outcome:"cancelled",durationMs:performance.now()-bootstrapStartedAt});
            }
            if (!mountedRef.current || !bootstrapAllowedRef.current ||
                workspaceRevisionRef.current !== startingWorkspaceRevision ||
                sourceVersionRef.current !== startingVersion) return;
            capacityRetries += 1;
            bootstrap = await requestBootstrap();
            bootstrapData = await payload(bootstrap);
          }
        } catch (error) {
          recordPreviewBrowserTiming({stage:"dependency_bootstrap",kind:startKind,
            outcome:"error",durationMs:performance.now()-bootstrapStartedAt});
          throw error;
        }
        recordPreviewBrowserTiming({
          stage:"dependency_bootstrap",kind:startKind,
          outcome:bootstrap.ok&&bootstrapData?.ok?"ok":"error",
          durationMs:performance.now()-bootstrapStartedAt,
        });
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
        // Even an exact-lock adoption with an unchanged CAS can be refreshed
        // via the owner-authenticated project reader. A complete page reload
        // discards the preview transition and recompiles the entire UI.
        if (await reconcilePreparedDependencies(startingVersion)) return;
        // Never destroy newly typed edits or the version-specific Zoé chat
        // because an authoritative in-page refresh could not be verified.
        throw new Error("Dependency preparation succeeded, but the saved source could not be synchronized. Reload the saved project when your edits are safe.");
      }

      // The runner owns startup beyond the HTTP request. Follow its journaled
      // operation state; never infer success from an elapsed browser timeout.
      if (response.ok && data?.ok && data.operation?.operationId) {
        const operationId = data.operation.operationId;
        if (!/^preview_op_[0-9a-f-]{36}$/i.test(operationId) ||
            data.operation.sourceVersion !== startingVersion) {
          throw new Error("The preview operation returned an invalid source identity.");
        }
        // The runner owns the operation deadline. A separate browser deadline
        // could falsely fail a still-active install while the browser's API
        // route is blocked by development compilation.
        let current = data.operation;
        operationStartedAtForMetrics = performance.now();
        while (true) {
          // A browser tab may select a different saved revision while the
          // runner continues. Do not publish an obsolete preview document.
          if (!mountedRef.current) { recordOperationTiming("cancelled"); return; }
          if (sourceVersionRef.current !== startingVersion ||
              workspaceRevisionRef.current !== startingWorkspaceRevision) {
            supersededDuringStart = true;
            recordOperationTiming("cancelled");
            return;
          }
          if (current.state === "ready" && current.preview) {
            recordOperationTiming("ok");
            data = { ok: true, preview: current.preview };
            break;
          }
          if (current.state === "failed" || current.state === "cancelled") {
            recordOperationTiming(current.state==="cancelled"?"cancelled":"error");
            const failure = current.code === "PREVIEW_RUNNER_RESTARTED"
              ? "The preview worker restarted. Retry to start a new preview."
              : current.code === "PREVIEW_LEASE_UNAVAILABLE"
                ? "The preview worker stopped responding. Retry to start a replacement."
              : current.code === "PREVIEW_CAPACITY"
                ? "Preview capacity is busy. Retry when the worker is available."
                : current.code === "PREVIEW_SOURCE_CONFLICT"
                  ? "The saved version changed while its preview was preparing."
                  : current.state === "cancelled"
                    ? "The preview startup was cancelled. Retry preview."
                    : "The preview worker could not prepare this website. Retry preview.";
            throw new Error(failure);
          }
          const stageMessage = previewOperationStageMessage(current.stage);
          if (mountedRef.current) setPreview(previous => ({
            src: null, state: "starting", message: stageMessage,
            revision: previous?.revision ?? 0,
          }));
          await new Promise<void>(resolve => window.setTimeout(resolve, PREVIEW_OPERATION_POLL_INTERVAL_MS));
          if (!mountedRef.current) { recordOperationTiming("cancelled"); return; }
          if (sourceVersionRef.current !== startingVersion ||
              workspaceRevisionRef.current !== startingWorkspaceRevision) {
            supersededDuringStart = true;
            recordOperationTiming("cancelled");
            return;
          }
          const statusResponse = await readPreviewOperationStatus(
            `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/operations/${encodeURIComponent(operationId)}`,
          );
          const statusPayload = await payload(statusResponse);
          if (statusResponse.status === 409 && statusPayload?.code === "BUILD_PREVIEW_SOURCE_CONFLICT") {
            if (await reconcileConflict(startingVersion)) return;
            throw new Error("A newer saved source is active. Refresh the selected version.");
          }
          if (statusResponse.status === 401) {
            throw new Error("Your Zoéskoul session could not be renewed. Reconnect your account, then retry preview. The saved source is unchanged.");
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

      // The owner-authenticated operation status has already verified this
      // preview capability and its source fence at the runner. Do not issue a
      // second serial browser document GET here: the sandboxed iframe owns
      // loading and validates its exact revision's rendered React root. A
      // browser 404 or auth error must not be misreported as a runner timeout.
      const changedDuringStart=sourceVersionRef.current !== startingVersion ||
        !workspaceSyncEntriesEqual(startingEntries,exportWorkspaceEntries(workspaceRef.current.nodes));
      if (changedDuringStart) setConfirmedSourceVersion(null);

      const nextSession: PreviewSession = {
        previewId,
        sourceVersion: startingVersion,
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
        if (!changedDuringStart &&
            workspaceSyncEntriesEqual(startingEntries, exportWorkspaceEntries(workspaceRef.current.nodes))) {
          setConfirmedSourceVersion(startingVersion);
          triedResyncVersionsRef.current.delete(startingVersion);
        }
        else setConfirmedSourceVersion(null);
        setPreview(changedDuringStart
          ? {src:null,state:"syncing",message:"Synchronizing the newly selected version…",revision:0}
          : {src:basePath,state:"ready",message:null,revision:0,
              observability:{kind:startKind,intentStartedAt,onTiming:recordPreviewBrowserTiming}});
      }

      if (changedDuringStart || workspaceRevisionRef.current !== startingWorkspaceRevision) {
        // Old start responses never become visible while a newer source is selected.
        // TanStack server functions live in an immutable sandbox: retire the
        // old lease and start the newly selected source, never in-place sync it.
        try {
          await syncCurrent();
        } catch (error) {
          if (error instanceof Error && error.message === "PREVIEW_RESTART_REQUIRED") {
            await cancelCurrent();
            supersededDuringStart = true;
            return;
          }
          throw error;
        }
      }
    })();

    startPromiseRef.current = task;
    try {
      await task;
    } catch (error) {
      recordOperationTiming("error");
      // A failed operation from an older selection must not replace the current
      // version's preview state. A newer request starts after this retires.
      const stillCurrent = previewStartOutcomeIsCurrent({
        startedSourceVersion: startingSourceVersion,
        selectedSourceVersion: sourceVersionRef.current,
        startedWorkspaceRevision: startingWorkspaceRevision,
        selectedWorkspaceRevision: workspaceRevisionRef.current,
      });
      if (!stillCurrent) supersededDuringStart = true;
      if (mountedRef.current && stillCurrent) {
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
  }, [input.buildProjectId, input.enabled, syncCurrent, cancelCurrent, reconcileConflict, reconcilePreparedDependencies]);

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

  // A successful bootstrap may have adopted the exact dependency lock
  // without incrementing the source token. Do not require a CAS change to
  // continue the same selected version. Wait for the old start to settle,
  // then use the freshly hydrated workspace from React's committed render.
  useEffect(() => {
    if (!input.enabled || preparedReplaySerial === 0) return;
    let cancelled = false;
    void (async () => {
      await startPromiseRef.current?.catch(() => undefined);
      if (cancelled || !mountedRef.current || !input.enabled ||
          sourceVersionRef.current !== input.sourceVersion) return;
      setPreparedReplaySerial(0);
      if (!sessionRef.current) await start();
      else {
        try { await syncCurrent(); }
        catch (error) {
          if (error instanceof Error && error.message === "PREVIEW_RESTART_REQUIRED") {
            await cancelCurrent();
            if (!cancelled && mountedRef.current) await start();
          } else throw error;
        }
      }
    })().catch(() => {
      if (mountedRef.current) setPreview(current => ({
        src: null, state: "error",
        message: "The prepared preview could not resume. Retry the saved version.",
        revision: current?.revision ?? 0,
      }));
    });
    return () => { cancelled = true; };
  }, [preparedReplaySerial, input.enabled, input.sourceVersion, input.workspace, start, syncCurrent, cancelCurrent]);

  const restart = useCallback(() => {
    // Prevent retry clicks from racing with a not-yet-completed cold start.
    if (restartPromiseRef.current) return;
    try {
      clearSavedDependencyRecoveryGuards(window.sessionStorage,
        `zoebuild:dependency-recovery:${input.buildProjectId}:${sourceVersionRef.current}`);
    } catch { /* optional */ }
    const task=(async()=>{
      await startPromiseRef.current?.catch(()=>{});
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
      const reopenStartedAt = performance.now();
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
          observability:{kind:"reopen",intentStartedAt:reopenStartedAt,
            onTiming:recordPreviewBrowserTiming},
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
  }, [input.enabled, input.sourceVersion, input.allowDependencyBootstrap, restart, syncCurrent, workspaceContentRevision]);

  return preview ? { ...preview, confirmedSourceVersion, attemptedSourceVersion, routes: registeredTanstackPreviewRoutes(initialWorkspaceEntries), onRetry: restart } : null;
}
