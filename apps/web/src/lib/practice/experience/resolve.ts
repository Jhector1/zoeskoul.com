import { readSharedChallengeMeta } from "@/lib/practice/challenges/session";
import type { PracticeExperienceMode } from "./types";

type SessionShape = {
  id?: string | null;
  mode?: string | null;
  assignmentId?: string | null;
  meta?: unknown;
};

const PERSISTED_MODES = new Set<PracticeExperienceMode>([
  "standard",
  "daily_five",
  "onboarding_trial",
  "public_challenge",
  "assignment",
]);

function readMetaKind(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const kind = (meta as Record<string, unknown>).kind;
  return typeof kind === "string" ? kind : null;
}

/**
 * Resolve the product experience from an explicit database mode.
 *
 * Two legacy fallbacks are kept temporarily so existing rows continue to work
 * during deployment:
 * - assignmentId on an old `standard` row => assignment
 * - shared_challenge meta on an old `onboarding_trial` row => public_challenge
 *
 * New writes must never rely on either fallback.
 */
export function resolvePracticeExperienceMode(
  session: SessionShape | null | undefined,
): PracticeExperienceMode {
  if (!session?.id) return "practice";

  if (session.assignmentId) return "assignment";

  if (readSharedChallengeMeta(session.meta)) {
    return "public_challenge";
  }

  const raw = String(session.mode ?? "standard") as PracticeExperienceMode;
  return PERSISTED_MODES.has(raw) ? raw : "standard";
}

export function assertPracticeExperienceInvariant(
  session: SessionShape | null | undefined,
) {
  if (!session?.id) return;

  const mode = resolvePracticeExperienceMode(session);

  if (mode === "assignment" && !session.assignmentId) {
    const error = new Error("Assignment sessions must have assignmentId.");
    (error as any).status = 500;
    (error as any).code = "INVALID_ASSIGNMENT_SESSION";
    throw error;
  }

  if (mode !== "assignment" && session.assignmentId) {
    const error = new Error("Only assignment sessions may have assignmentId.");
    (error as any).status = 500;
    (error as any).code = "INVALID_NON_ASSIGNMENT_SESSION";
    throw error;
  }

  if (mode === "public_challenge" && !readSharedChallengeMeta(session.meta)) {
    const error = new Error("Public challenge session is missing challenge metadata.");
    (error as any).status = 500;
    (error as any).code = "INVALID_PUBLIC_CHALLENGE_SESSION";
    throw error;
  }

  if (mode === "onboarding_trial" && readMetaKind(session.meta) !== "onboarding_trial") {
    const error = new Error("Onboarding trial session is missing onboarding metadata.");
    (error as any).status = 500;
    (error as any).code = "INVALID_ONBOARDING_TRIAL_SESSION";
    throw error;
  }

  if (mode === "daily_five" && readMetaKind(session.meta) !== "daily_five") {
    const error = new Error("Daily-practice session is missing daily metadata.");
    (error as any).status = 500;
    (error as any).code = "INVALID_DAILY_FIVE_SESSION";
    throw error;
  }
}

export function isAssignmentSession(session: SessionShape | null | undefined) {
  return resolvePracticeExperienceMode(session) === "assignment";
}

export function isPublicChallengeSession(session: SessionShape | null | undefined) {
  return resolvePracticeExperienceMode(session) === "public_challenge";
}

export function isOnboardingTrialExperience(session: SessionShape | null | undefined) {
  return resolvePracticeExperienceMode(session) === "onboarding_trial";
}

export function isDailyFiveSession(session: SessionShape | null | undefined) {
  return resolvePracticeExperienceMode(session) === "daily_five";
}
