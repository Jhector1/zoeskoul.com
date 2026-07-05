import type { Actor } from "@/lib/practice/actor";
import { resolvePracticeExperienceMode } from "@/lib/practice/experience/resolve";

type SharedSessionShape = {
  id?: string | null;
  mode?: string | null;
  meta?: unknown;
  userId?: string | null;
  guestId?: string | null;
  assignmentId?: string | null;
};

function makeError(message: string, status: number, code?: string) {
  const err = new Error(message);
  (err as any).status = status;
  if (code) (err as any).code = code;
  return err;
}

export function assertSessionOwnerMatchesActor(
  session: SharedSessionShape | null | undefined,
  actor: Actor,
) {
  if (!session) return;

  if (session.userId) {
    if (!actor.userId || actor.userId !== session.userId) {
      throw makeError("Forbidden.", 403, "SESSION_OWNER_USER_MISMATCH");
    }
    return;
  }

  if (session.guestId) {
    if (!actor.guestId || actor.guestId !== session.guestId) {
      throw makeError("Forbidden.", 403, "SESSION_OWNER_GUEST_MISMATCH");
    }
    return;
  }

  throw makeError("Session has no owner.", 500, "SESSION_HAS_NO_OWNER");
}

/**
 * Teacher assignments are not subscription trials. Their access boundary is
 * the published assignment plus the authenticated learner who owns the run.
 */
export function assertAssignmentSessionAccess(
  session: SharedSessionShape | null | undefined,
  actor: Actor,
) {
  if (resolvePracticeExperienceMode(session) !== "assignment") return;

  if (!actor.userId) {
    throw makeError(
      "Sign in to continue this assignment.",
      401,
      "ASSIGNMENT_AUTH_REQUIRED",
    );
  }

  if (!session?.userId || session.userId !== actor.userId) {
    throw makeError(
      "Forbidden.",
      403,
      "ASSIGNMENT_OWNER_MISMATCH",
    );
  }
}
