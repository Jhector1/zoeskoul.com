/**
 * AI4B4E2F: opt-in canonical reader for R2-managed source revisions.
 * A persisted R2 snapshot must never reach an existing FullIDE, preview,
 * history, or build consumer before exact-version byte hydration.
 *
 * This pure boundary supports a legacy fast path when disabled; in that
 * path it does not contact the manifest DB or private object store.
 */
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {parseBuildWorkspaceMutation} from "./buildWorkspaceMutation";
import {
  loadHydratedManagedBinaryRevision,
  type ManagedBinaryAtomicSourcePort,
} from "./managedBinaryCommit";
import type {ManagedBinaryScope} from "./managedBinaryRevision";

/** Exact opt-in only. 'true', 'on', and empty values stay OFF. */
export function managedBinaryReadsEnabled(value: string | undefined): boolean {
  return value === "1";
}

export async function resolveOwnedBuildWorkspace(input: Readonly<{
  enabled: boolean;
  scope: ManagedBinaryScope;
  sourceVersion: number;
  legacyWorkspace: unknown;
  port: ManagedBinaryAtomicSourcePort<WorkspaceStateV2>;
  readObject: (key: string) => Promise<Uint8Array | null>;
}>): Promise<WorkspaceStateV2> {
  if (!input.enabled) {
    // No DB lookup or R2 secret access for the entire installed legacy fleet.
    return parseBuildWorkspaceMutation(input.legacyWorkspace);
  }
  if (!input.scope.ownerId || !input.scope.buildProjectId ||
      !Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1) {
    throw new Error("MANAGED_READ_SCOPE_INVALID");
  }
  const workspace = await loadHydratedManagedBinaryRevision({
    scope: input.scope,
    sourceVersion: input.sourceVersion,
    port: input.port,
    readObject: input.readObject,
  });
  if (!workspace) throw new Error("MANAGED_READ_REVISION_NOT_FOUND");
  // The same canonical policy applies to legacy and R2-hydrated snapshots.
  return parseBuildWorkspaceMutation(workspace);
}
