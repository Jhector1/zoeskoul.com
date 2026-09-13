/**
 * Decide whether a persisted Review workspace may enter the current in-memory
 * reset generation.
 *
 * resetRevision is session-local. On a fresh page load (resetRevision === 0),
 * the latest server document establishes the session baseline regardless of an
 * old session-local generation number.
 *
 * After an explicit reset in the current session (resetRevision > 0), a
 * workspace must prove that it was produced in exactly that generation.
 * Missing or older generation metadata is rejected instead of being promoted
 * to the current generation by hydration.
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
