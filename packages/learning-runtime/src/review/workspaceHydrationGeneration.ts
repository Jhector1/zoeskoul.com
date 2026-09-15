/**
 * Review reset generations use 0 only for the fresh-session hydration
 * baseline. Once an explicit reset occurs, the generation becomes epoch-like
 * so persisted work from an older browser session cannot accidentally share
 * the same generation as the new reset.
 *
 * The wall-clock component prevents the historical 0 -> 1 collision across
 * browser sessions. current + 1 preserves strict monotonicity when multiple
 * resets happen in the same millisecond or when the local clock moves
 * backwards during the active session.
 */
export function nextReviewResetRevision(
  currentRevision: unknown,
  wallClockMs: unknown = Date.now(),
): number {
  const current = Number.isFinite(currentRevision)
    ? Math.max(0, Math.trunc(Number(currentRevision)))
    : 0;

  const wallClock = Number.isFinite(wallClockMs)
    ? Math.max(1, Math.trunc(Number(wallClockMs)))
    : 1;

  return Math.max(current + 1, wallClock);
}

/**
 * Decide whether a persisted Review workspace may enter the current in-memory
 * reset generation.
 *
 * On a fresh page load (resetRevision === 0), the latest server document
 * establishes the session baseline regardless of its persisted generation.
 *
 * After an explicit reset, persisted workspace state must prove that it was
 * produced by that exact reset generation. Historical session generations,
 * missing metadata, older generations, and unrelated future generations are
 * rejected instead of being relabeled as current.
 */
export function resolveReviewProgressHydrationGeneration(args: {
  persistedGeneration: unknown;
  runtimeResetRevision: number;
}): number | undefined {
  const active = Number.isFinite(args.runtimeResetRevision)
    ? Math.max(0, Math.trunc(Number(args.runtimeResetRevision)))
    : 0;

  if (active === 0) {
    return 0;
  }

  if (!Number.isFinite(args.persistedGeneration)) {
    return undefined;
  }

  const persisted = Math.max(
    0,
    Math.trunc(Number(args.persistedGeneration)),
  );

  return persisted === active ? active : undefined;
}
