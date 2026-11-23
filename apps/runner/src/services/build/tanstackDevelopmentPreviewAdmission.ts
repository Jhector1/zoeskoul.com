import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { classifyTanstackPreviewTransition } from "@zoeskoul/build-executor-contracts";
import type { FullStackPreviewLease } from "./sharedPreviewRegistry.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { authorizeTanstackPreviewSource } from "./tanstackPreviewSourceAuthorization.js";

/**
 * Runner-side, side-effect-free candidate admission for a FUTURE development
 * preview update. This is not permission to write Docker workspace files.
 *
 * The entrypoint must first authenticate its service actor, verify that `next`
 * comes from the DB-authoritative saved source, take an exclusive per-lease
 * update lock, check liveness and perform a post-write version CAS. Until then
 * no runtime route may use the returned candidate to mutate a preview.
 */
export function assessTanstackDevelopmentPreviewUpdate(input: Readonly<{
  lease: Pick<FullStackPreviewLease,
    "mode" | "ownerKey" | "buildProjectId" | "sourceVersion" | "identity" | "basePath"> | null;
  actorKey: string;
  /** Last verified source request bound to the live lease; never browser supplied. */
  previous: ProductionBuildJobRequestV1;
  /** DB-authoritative next saved-source request passed through service auth. */
  next: ProductionBuildJobRequestV1;
}>): Readonly<{
  action: "live_candidate" | "restart";
  reason: string;
  changedPaths: readonly string[];
  expectedSourceVersion: number;
  nextSourceVersion: number;
  nextSourceFingerprint: string;
}> {
  const { lease, actorKey, previous, next } = input;
  if (!lease || lease.basePath.startsWith("/quarantined/"))
    throw new Error("Preview not found.");
  if (!actorKey || lease.ownerKey !== actorKey)
    throw new Error("Forbidden.");
  if (lease.mode !== "development")
    throw new Error("Development preview lease required.");
  if (!Number.isSafeInteger(lease.sourceVersion) || lease.sourceVersion < 1 ||
      previous.buildProjectId !== lease.buildProjectId ||
      previous.sourceVersion !== lease.sourceVersion ||
      next.buildProjectId !== lease.buildProjectId ||
      !Number.isSafeInteger(next.sourceVersion) ||
      next.sourceVersion <= lease.sourceVersion)
    throw new Error("Preview source is stale.");

  // Prevent a caller from substituting a fabricated previous snapshot, even
  // with a valid owner actor key and valid next dependency approval.
  const currentIdentity = createTanstackPreviewIdentity(
    previous, lease.identity.runtimeImageId);
  if (currentIdentity.fingerprint !== lease.identity.fingerprint ||
      currentIdentity.sourceFingerprint !== lease.identity.sourceFingerprint ||
      currentIdentity.dependencyFingerprint !== lease.identity.dependencyFingerprint)
    throw new Error("Preview source identity mismatch.");

  // Recheck the server's cryptographic approval for the exact pinned
  // dependency set, even for a CSS-only update. Do not trust user claims.
  authorizeTanstackPreviewSource(next);
  const transition = classifyTanstackPreviewTransition({
    mode: "development", previous, next,
    allowBinaryLive: process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_BINARY_HMR_ENABLED === "true",
  });
  if (transition.action === "reject" || transition.action === "hold" ||
      transition.action === "unchanged")
    throw new Error("Invalid development preview transition.");

  const nextIdentity = createTanstackPreviewIdentity(
    next, lease.identity.runtimeImageId);
  if (transition.action === "live_candidate" &&
      nextIdentity.dependencyFingerprint !== lease.identity.dependencyFingerprint)
    throw new Error("Dependency identity changed during live-source admission.");

  return {
    action: transition.action,
    reason: transition.reason,
    changedPaths: transition.changedPaths,
    expectedSourceVersion: lease.sourceVersion,
    nextSourceVersion: next.sourceVersion,
    nextSourceFingerprint: nextIdentity.sourceFingerprint,
  };
}
