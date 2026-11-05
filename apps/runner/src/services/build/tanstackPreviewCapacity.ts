import { env } from "../../lib/env.js";
import { countActiveSessionsForActor, countActiveSessionsGlobal } from "../sessions/sessionStore.js";
import { consumeStartToken } from "../sessions/startRateLimit.js";
import { choosePreviewsToReclaim } from "./previewAdmissionPolicy.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { assertZoeBuildPreviewCapacity, ZOEBUILD_MAX_CONCURRENT_PREVIEWS } from "./zoeBuildPreviewCapacity.js";

/** Admission for the sole supported TanStack Start preview runtime.
 * A reservation counts from startup until verified container/workspace teardown.
 * The single-process Runner uses the existing shared admission queue and the
 * shared lease registry; no extra Docker executor or owner-chosen identity.
 */
const pendingByActor = new Map<string, number>();
let pendingGlobal = 0;
const IDLE_MS = 10 * 60_000;
const HARD_LIFETIME_MS = 60 * 60_000;
const CROSS_ACTOR_IDLE_MS = 45_000;

function activeForActor(ownerKey: string): number {
  return sharedFullStackPreviews.countForOwner(ownerKey) + (pendingByActor.get(ownerKey) ?? 0);
}

function needsSlot(ownerKey: string): boolean {
  const total = sharedFullStackPreviews.count() + pendingGlobal;
  return total >= ZOEBUILD_MAX_CONCURRENT_PREVIEWS ||
    countActiveSessionsGlobal() + total >= env.maxConcurrentGlobal ||
    countActiveSessionsForActor(ownerKey) + activeForActor(ownerKey) >= env.maxConcurrentPerActor;
}

/** Reclaim only verifiedly closed idle leases, never an active foreign preview.
 * Failed Docker/workspace teardown MUST propagate and retain its lease.
 * This also retries expiration cleanup on every admitted preview start.
 */
export async function reclaimTanstackPreviewCapacity(ownerKey: string, buildProjectId: string): Promise<void> {
  if (!ownerKey || !buildProjectId) throw new Error("Preview identity required.");
  const now = Date.now();
  await sharedFullStackPreviews.sweep(now, IDLE_MS, HARD_LIFETIME_MS);
  if (!needsSlot(ownerKey)) return;
  const candidates = choosePreviewsToReclaim(
    sharedFullStackPreviews.list(), ownerKey, buildProjectId, now, CROSS_ACTOR_IDLE_MS,
  );
  for (const lease of candidates) {
    if (!needsSlot(ownerKey)) break;
    await sharedFullStackPreviews.close(lease.id);
  }
}

/** The existing code-run start-rate budget is charged before reservation.
 * No second reservation is possible while a start is pending or a preview
 * lease (including an orphan/quarantined lease) remains live.
 */
export function reserveTanstackPreviewCapacity(ownerKey: string): () => void {
  if (!ownerKey) throw new Error("Preview owner required.");
  consumeStartToken(ownerKey, "code");
  const actorCount = countActiveSessionsForActor(ownerKey) + activeForActor(ownerKey);
  if (actorCount >= env.maxConcurrentPerActor) {
    throw new Error(`Too many active sessions. Limit is ${env.maxConcurrentPerActor} per user.`);
  }
  const globalCount = countActiveSessionsGlobal() + sharedFullStackPreviews.count() + pendingGlobal;
  if (globalCount >= env.maxConcurrentGlobal) {
    throw new Error(`Runner is busy. Global active session limit is ${env.maxConcurrentGlobal}.`);
  }
  assertZoeBuildPreviewCapacity(sharedFullStackPreviews.count(), pendingGlobal);
  pendingByActor.set(ownerKey, (pendingByActor.get(ownerKey) ?? 0) + 1);
  pendingGlobal++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (pendingByActor.get(ownerKey) ?? 1) - 1;
    if (remaining > 0) pendingByActor.set(ownerKey, remaining);
    else pendingByActor.delete(ownerKey);
    pendingGlobal--;
  };
}
