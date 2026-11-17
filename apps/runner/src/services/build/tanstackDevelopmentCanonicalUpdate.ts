import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import type { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { coordinateTanstackDevelopmentWorkspaceUpdate } from "./tanstackDevelopmentWorkspaceBinding.js";
import type { TrustedTanstackDevelopmentSourceStore } from "./tanstackDevelopmentSourceStore.js";
import type { TrustedTanstackDevelopmentWorkspaceStore } from "./tanstackDevelopmentWorkspaceStore.js";

/**
 * Internal-only canonical update binding. No route uses this service yet.
 *
 * The caller supplies an already DB-loaded *next* snapshot and an authoritative
 * authorization callback which MUST verify owner, current saved revision,
 * exact saved file bytes and signed dependency approval at BOTH checks.
 * Neither the previous source nor workspace path is accepted from an HTTP body.
 *
 * The coordinator serializes the entire transaction per development lease:
 *   canonical previous -> admission -> Docker write -> DB reauthorization
 *   -> registry CAS -> canonical source advancement.
 * Any post-write failure quarantines and closes the preview.
 */
export function updateCanonicalTanstackDevelopmentPreview(input: Readonly<{
  registry: SharedFullStackPreviewRegistry;
  sources: Pick<TrustedTanstackDevelopmentSourceStore,
    "resolve" | "advanceAfterCommittedLease">;
  workspaces: Pick<TrustedTanstackDevelopmentWorkspaceStore, "resolve">;
  previewId: string;
  actorKey: string;
  next: ProductionBuildJobRequestV1;
  authorizeCurrentSavedSource: (actorKey: string,
    next: ProductionBuildJobRequestV1) => Promise<void>;
}>) {
  if (!input.sources || !input.workspaces ||
      typeof input.sources.resolve !== "function" ||
      typeof input.sources.advanceAfterCommittedLease !== "function" ||
      typeof input.workspaces.resolve !== "function" ||
      typeof input.authorizeCurrentSavedSource !== "function")
    throw new Error("Trusted development preview source authority required.");

  return coordinateTanstackDevelopmentWorkspaceUpdate({
    registry: input.registry,
    previewId: input.previewId,
    actorKey: input.actorKey,
    next: input.next,
    authorizeCurrentSavedSource: input.authorizeCurrentSavedSource,
    // These resolve only from in-process Runner-owned records and the exact
    // live registry lease. They are called within the exclusive update slot.
    resolvePrevious: lease => input.sources.resolve(lease),
    resolveTrustedWorkspace: async lease => input.workspaces.resolve(lease),
    afterCommittedLease: (committed, next) =>
      input.sources.advanceAfterCommittedLease(committed, next),
  });
}
