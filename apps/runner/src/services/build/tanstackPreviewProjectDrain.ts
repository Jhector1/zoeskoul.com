import { sharedPreviewProjectDrains } from "./sharedPreviewRuntimeState.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";

/**
 * The canonical TanStack-only project-deletion barrier. New preview starts
 * are rejected by the same sharedPreviewProjectDrains gate. The caller must
 * supply the authenticated actor; the browser never chooses an owner key.
 *
 * A failed Docker/workspace teardown keeps the lease counted and leaves the
 * project drain in place. No database deletion may proceed until every
 * matching lease closes successfully and cleanup has been verified.
 */
export async function drainTanstackProjectPreviews(input: Readonly<{
  ownerKey: string;
  buildProjectId: string;
}>) {
  const drainId = sharedPreviewProjectDrains.beginDrain(input.ownerKey, input.buildProjectId);
  const stoppedCount = await sharedFullStackPreviews.drain(input.ownerKey, input.buildProjectId);
  if (sharedFullStackPreviews.list().some(lease =>
      lease.ownerKey === input.ownerKey && lease.buildProjectId === input.buildProjectId)) {
    throw new Error("Preview cleanup could not be verified.");
  }
  return { ok: true as const, drainId, stoppedCount };
}

/** Releasing a deletion barrier requires the exact owner/project/drain token. */
export function releaseTanstackProjectPreviewDrain(input: Readonly<{
  ownerKey: string;
  buildProjectId: string;
  drainId: string;
}>): boolean {
  return sharedPreviewProjectDrains.releaseDrain(input.ownerKey, input.buildProjectId, input.drainId);
}
