import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { docker } from "../docker/dockerClient.js";
import type { FullStackPreviewLease, SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { coordinateTanstackDevelopmentPreviewUpdate } from "./tanstackDevelopmentPreviewUpdate.js";
import { applySuspendedTanstackDevelopmentSource } from "./tanstackDevelopmentWorkspaceWriter.js";

/**
 * Driver-owned, private workspace reference. This MUST be resolved from a
 * server-held Docker preview handle, never from an HTTP body, query or browser
 * claim. No existing immutable preview driver publishes such a handle.
 *
 * This binding is intentionally internal and not called by a runtime route.
 * A separately authorized development-lease creator / trusted handle store
 * must exist before this capability is ever exposed to an authenticated API.
 */
export type TrustedTanstackDevelopmentWorkspace = Readonly<{
  previewId: string;
  ownerKey: string;
  buildProjectId: string;
  sourceVersion: number;
  identityFingerprint: string;
  containerId: string;
  /** Configured Runner workspace root (not client-supplied). */
  workspaceRoot: string;
  /** Workspace directory allocated by the trusted Docker driver. */
  workspaceDir: string;
}>;

function isBoundToLease(
  handle: TrustedTanstackDevelopmentWorkspace | null,
  lease: FullStackPreviewLease,
): handle is TrustedTanstackDevelopmentWorkspace {
  return Boolean(handle && lease.mode === "development" &&
    !lease.basePath.startsWith("/quarantined/") &&
    handle.previewId === lease.id &&
    handle.ownerKey === lease.ownerKey &&
    handle.buildProjectId === lease.buildProjectId &&
    handle.sourceVersion === lease.sourceVersion &&
    handle.identityFingerprint === lease.identity.fingerprint &&
    handle.containerId === lease.containerId &&
    typeof handle.workspaceRoot === "string" && handle.workspaceRoot.length > 0 &&
    typeof handle.workspaceDir === "string" && handle.workspaceDir.length > 0);
}

/** A fresh, read-only Docker check before the coordinator grants write access.
 * The writer performs its own Docker and path checks again while paused. */
async function isLiveBoundSandbox(
  handle: TrustedTanstackDevelopmentWorkspace,
): Promise<boolean> {
  try {
    const info = await docker.getContainer(handle.containerId).inspect();
    return info.Id === handle.containerId &&
      info.State?.Running === true && info.State?.Paused !== true &&
      info.Config?.Labels?.["com.zoeskoul.runner.purpose"] === "tanstack-start-preview" &&
      info.HostConfig?.NetworkMode === "none" &&
      info.Mounts?.some(m => m.Type === "bind" && m.RW === true &&
        m.Source === handle.workspaceDir && m.Destination === "/workspace") === true;
  } catch {
    return false;
  }
}

/**
 * Phase 3C: wire the Phase 3A serialized transaction to the Phase 3B suspended
 * Docker writer WITHOUT enabling the legacy /sync endpoint or public HMR.
 *
 * Security invariants:
 * - DB-current saved source is authorized twice (coordinator, before/after).
 * - A trusted driver-owned workspace is bound to the exact active lease.
 * - A fresh sandbox/mount check happens before calling the writer.
 * - The writer independently verifies Docker identity and path safety.
 * - Any attempted-write failure quarantines and closes the development lease.
 * - Dependency/config changes take the restart-required path without writes.
 *
 * Neither this function nor a callback is an authentication endpoint. The
 * caller must supply the trusted DB authorization and private driver handle.
 */
export function coordinateTanstackDevelopmentWorkspaceUpdate(input: Readonly<{
  registry: SharedFullStackPreviewRegistry;
  previewId: string;
  actorKey: string;
  /** Previous authoritative saved source bound to the current lease. */
  previous?: ProductionBuildJobRequestV1;
  /** Private canonical snapshot resolver; called after obtaining the per-lease
   * serialized slot. Production code must use this instead of previous. */
  resolvePrevious?: (lease: FullStackPreviewLease) =>
    ProductionBuildJobRequestV1 | null | Promise<ProductionBuildJobRequestV1 | null>;
  /** Update private canonical source only AFTER the registry commits. */
  afterCommittedLease?: (lease: FullStackPreviewLease,
    next: ProductionBuildJobRequestV1) => void | Promise<void>;
  /** Next DB-authoritative saved source, not a client-provided file list. */
  next: ProductionBuildJobRequestV1;
  authorizeCurrentSavedSource: (actorKey: string,
    next: ProductionBuildJobRequestV1) => Promise<void>;
  /** Resolve ONLY from the Runner's private driver/workspace record. */
  resolveTrustedWorkspace: (lease: FullStackPreviewLease) =>
    Promise<TrustedTanstackDevelopmentWorkspace | null>;
}>) {
  if (typeof input.resolveTrustedWorkspace !== "function" ||
      typeof input.authorizeCurrentSavedSource !== "function")
    throw new Error("Development preview trusted workspace required.");

  let bound: TrustedTanstackDevelopmentWorkspace | null = null;
  return coordinateTanstackDevelopmentPreviewUpdate({
    registry: input.registry,
    previewId: input.previewId,
    actorKey: input.actorKey,
    previous: input.previous,
    resolvePrevious: input.resolvePrevious,
    afterCommittedLease: input.afterCommittedLease,
    next: input.next,
    authorizeCurrentSavedSource: input.authorizeCurrentSavedSource,
    verifyLiveWorkspace: async lease => {
      // Copy fields rather than holding a mutable reference across awaits.
      const candidate = await input.resolveTrustedWorkspace(lease);
      if (!isBoundToLease(candidate, lease)) return false;
      const snapshot = Object.freeze({ ...candidate });
      if (!await isLiveBoundSandbox(snapshot)) return false;
      bound = snapshot;
      return true;
    },
    applyApprovedSource: async ({ lease, changedPaths, next }) => {
      // This callback is reached only inside the coordinator's exclusive slot.
      if (!isBoundToLease(bound, lease))
        throw new Error("Development preview workspace binding is stale.");
      await applySuspendedTanstackDevelopmentSource({
        containerId: lease.containerId,
        workspaceRoot: bound.workspaceRoot,
        workspaceDir: bound.workspaceDir,
        changedPaths,
        next,
      });
    },
  });
}
