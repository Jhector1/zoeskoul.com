import {
  nextWorkspaceSaveRevision,
} from "@zoeskoul/learning-runtime/review/workspacePersistenceContract";

export const REVIEW_PROGRESS_STANDARD_REMOTE_POLL_MS = 30_000;
export const REVIEW_PROGRESS_TUTORING_REMOTE_POLL_MS = 4_000;

export function reviewProgressSaveRevisionOf(
  state: unknown,
): number {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return 0;
  }

  const raw = Number(
    (state as { __saveRevision?: unknown }).__saveRevision ?? 0,
  );

  if (!Number.isFinite(raw) || raw < 0) {
    return 0;
  }

  return Math.trunc(raw);
}

/**
 * Rebase a queued snapshot immediately before it is sent.
 *
 * A payload may sit in the queue while an earlier request is accepted.
 * The server is allowed to advance that earlier request's revision to its
 * own current clock time. Therefore a revision assigned when the later
 * payload was queued can already be stale by the time it reaches the wire.
 *
 * Revisions are transport metadata. Rebasing changes no learner progress,
 * workspace content, completion state, or exercise ownership.
 */
export function rebaseReviewProgressStateRevisionForSend<
  T extends Record<string, unknown>,
>(
  state: T,
  acceptedRevision: number,
  now = Date.now(),
): T {
  const localRevision = reviewProgressSaveRevisionOf(state);
  const accepted = Number.isFinite(acceptedRevision)
    ? Math.max(0, Math.trunc(acceptedRevision))
    : 0;

  const previousRevision = Math.max(
    localRevision,
    accepted,
  );

  const nextRevision = nextWorkspaceSaveRevision({
    previousRevision,
    now,
  });

  return {
    ...state,
    __saveRevision: nextRevision,
  };
}
