import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import type { FullStackPreviewLease, SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { assessTanstackDevelopmentPreviewUpdate } from "./tanstackDevelopmentPreviewAdmission.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { previewObservability, type PreviewObservability, type DevelopmentUpdateStage }
  from "./previewObservability.js";

export class DevelopmentPreviewUpdateFailure extends Error {
  constructor(readonly category: "pre_write_authority" | "quarantined",
    readonly stage: DevelopmentUpdateStage) {
    super(category === "quarantined" ? "Development preview update failed." :
      "Saved-source authority rejected the request.");
    this.name = "DevelopmentPreviewUpdateFailure";
  }
}

/**
 * Internal, non-routed development-preview transaction coordinator.
 *
 * The callbacks MUST be supplied by a future trusted service boundary:
 * - authorizeCurrentSavedSource: verifies actor/project ownership and exact
 *   DB-authoritative saved source bytes/revision, not browser-provided claims.
 *   Called BEFORE and AFTER the workspace write; its post-write check must
 *   reject a newly superseded DB revision before publishing the lease CAS.
 * - verifyLiveWorkspace: verifies the isolated Docker workspace is still live.
 * - applyApprovedSource: writes only the admitted paths to a verified private
 *   workspace using a path-safe, bounded filesystem capability.
 *
 * This module does not supply those privileges, expose a route, or create a
 * development lease. Until the filesystem and DB auth adapters exist, it may
 * only be exercised with injected test callbacks.
 */
export async function coordinateTanstackDevelopmentPreviewUpdate(input: Readonly<{
  registry: SharedFullStackPreviewRegistry;
  observability?: PreviewObservability;
  previewId: string;
  actorKey: string;
  /** Legacy internal callers may pass a previous source directly. Trusted
   * development updates MUST instead resolve it from the private source store
   * while holding the exclusive lease slot. Exactly one source form required. */
  previous?: ProductionBuildJobRequestV1;
  resolvePrevious?: (lease: FullStackPreviewLease) =>
    ProductionBuildJobRequestV1 | null | Promise<ProductionBuildJobRequestV1 | null>;
  next: ProductionBuildJobRequestV1;
  /** Called only after the lease CAS, while still in the exclusive slot.
   * Any failure quarantines/closes the lease; the source snapshot MUST NOT
   * be advanced before commit. */
  afterCommittedLease?: (lease: FullStackPreviewLease,
    next: ProductionBuildJobRequestV1) => void | Promise<void>;
  authorizeCurrentSavedSource: (actorKey: string,
    next: ProductionBuildJobRequestV1) => Promise<void>;
  verifyLiveWorkspace: (lease: FullStackPreviewLease) => Promise<boolean>;
  applyApprovedSource: (input: Readonly<{
    lease: FullStackPreviewLease;
    changedPaths: readonly string[];
    next: ProductionBuildJobRequestV1;
  }>) => Promise<void>;
}>): Promise<Readonly<{
  action: "updated" | "restart_required";
  sourceVersion: number;
  reason: string;
  changedPaths: readonly string[];
}>> {
  if (!input.previewId || !input.actorKey ||
      typeof input.authorizeCurrentSavedSource !== "function" ||
      typeof input.verifyLiveWorkspace !== "function" ||
      typeof input.applyApprovedSource !== "function" ||
      (input.previous === undefined) === (input.resolvePrevious === undefined) ||
      (input.resolvePrevious !== undefined && typeof input.resolvePrevious !== "function") ||
      (input.afterCommittedLease !== undefined && typeof input.afterCommittedLease !== "function"))
    throw new Error("Development preview authorization required.");

  const metrics = input.observability ?? previewObservability;
  const started = metrics.now();
  let stage: DevelopmentUpdateStage | null = "queue_wait";
  let stageStarted = started;
  let outcome: "ok" | "error" | "restart_required" = "error";
  function finishStage(result: "ok" | "error" | "restart_required") {
    if (stage !== null) metrics.recordDevelopmentUpdateStage(stage, result, metrics.now() - stageStarted);
    stage = null;
  }
  function advance(next: DevelopmentUpdateStage) {
    finishStage("ok"); stage = next; stageStarted = metrics.now();
  }
  let mustClose = false;
  try {
    const result = await input.registry.withDevelopmentUpdate(input.previewId, async initial => {
      advance("owner_check");
      // Refuse wrong actors before invoking potentially expensive callbacks.
      if (initial.ownerKey !== input.actorKey) throw new Error("Forbidden.");
      advance("pre_write_authority");
      try { await input.authorizeCurrentSavedSource(input.actorKey, input.next); }
      catch { throw new DevelopmentPreviewUpdateFailure("pre_write_authority", "pre_write_authority"); }
      advance("source_resolve");
      const lease = input.registry.assertDevelopmentUpdateOpen(
        input.previewId, initial.sourceVersion, initial.identity.fingerprint);
      // Resolve *inside* the exclusive update slot. A queued revision must
      // see the snapshot committed by its predecessor, not stale data obtained
      // before waiting. Never ask the browser for this historical snapshot.
      const previous = input.resolvePrevious
        ? await input.resolvePrevious(lease)
        : input.previous;
      if (!previous) throw new Error("Development preview canonical source unavailable.");
      input.registry.assertDevelopmentUpdateOpen(
        input.previewId, lease.sourceVersion, lease.identity.fingerprint);
      advance("admission");
      const admission = assessTanstackDevelopmentPreviewUpdate({
        lease, actorKey: input.actorKey, previous, next: input.next,
      });
      if (admission.action === "restart") {
        finishStage("restart_required");
        return {
        action: "restart_required" as const,
        sourceVersion: lease.sourceVersion,
        reason: admission.reason,
        changedPaths: admission.changedPaths,
        };
      }

      advance("workspace_verify");
      if (!await input.verifyLiveWorkspace(lease))
        throw new Error("Preview not found.");
      // A cancel/drain may begin during an awaited health check.
      input.registry.assertDevelopmentUpdateOpen(
        input.previewId, admission.expectedSourceVersion, lease.identity.fingerprint);
      try {
        // If this begins, ANY failure is potentially a partial workspace
        // mutation. Quarantine before releasing the exclusive update slot.
        advance("workspace_write");
        await input.applyApprovedSource({
          lease, changedPaths: admission.changedPaths, next: input.next,
        });
        // A newer saved version may have appeared while source was written.
        // Never publish a superseded revision even when Docker accepted it.
        advance("post_write_authority");
        await input.authorizeCurrentSavedSource(input.actorKey, input.next);
        advance("lease_commit");
        input.registry.assertDevelopmentUpdateOpen(
          input.previewId, admission.expectedSourceVersion, lease.identity.fingerprint);
        const identity = createTanstackPreviewIdentity(
          input.next, lease.identity.runtimeImageId);
        const committed = input.registry.commitDevelopmentUpdate(input.previewId, {
          expectedVersion: admission.expectedSourceVersion,
          expectedFingerprint: lease.identity.fingerprint,
          nextVersion: admission.nextSourceVersion,
          nextIdentity: identity,
        });
        // CAS + canonical source publication share the exclusive slot.
        // The old snapshot is no longer resolvable after CAS until this
        // callback succeeds. Failure enters the same quarantine path as a
        // partial filesystem write; no stale/half-committed preview escapes.
        advance("snapshot_publish");
        await input.afterCommittedLease?.(committed, input.next);
      } catch {
        const failedStage = stage ?? "workspace_write";
        finishStage("error");
        mustClose = true;
        input.registry.quarantineDevelopmentUpdate(input.previewId);
        throw new DevelopmentPreviewUpdateFailure("quarantined", failedStage);
      }
      finishStage("ok");
      return {
        action: "updated" as const,
        sourceVersion: admission.nextSourceVersion,
        reason: admission.reason,
        changedPaths: admission.changedPaths,
      };
    });
    outcome = result.action === "updated" ? "ok" : "restart_required";
    return result;
  } catch (error) {
    finishStage("error");
    throw error;
  } finally {
    if (mustClose) {
      // Must happen AFTER the exclusive transaction has released its slot.
      // If Docker teardown fails, the quarantined lease remains reserved.
      const cleanupStarted = metrics.now();
      try {
        await input.registry.close(input.previewId);
        metrics.recordDevelopmentUpdateStage("cleanup", "ok", metrics.now() - cleanupStarted);
      } catch {
        metrics.recordDevelopmentUpdateStage("cleanup", "error", metrics.now() - cleanupStarted);
      }
    }
    metrics.recordDevelopmentUpdateStage("total", outcome, metrics.now() - started);
  }
}
