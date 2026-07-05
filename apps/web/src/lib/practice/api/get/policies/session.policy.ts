import type { Difficulty } from "@/lib/practice/types";
import { resolvePracticeExperienceMode } from "@/lib/practice/experience/resolve";
import { getPracticeExperiencePolicy } from "@/lib/practice/experience/policy";

type SessionRevealShape = {
  id?: string | null;
  mode?: string | null;
  meta?: unknown;
  assignmentId?: string | null;
  difficulty?: string | null;
  assignment?: {
    allowReveal?: boolean | null;
    difficulty?: string | null;
    maxAttempts?: number | null;
    maxQuestionAttempts?: number | null;
  } | null;
};

export function computeAllowRevealEffective(
  session: SessionRevealShape | null | undefined,
  allowRevealParam?: "true" | "false",
) {
  const mode = resolvePracticeExperienceMode(session);
  const requested = allowRevealParam === "true";

  const policy = getPracticeExperiencePolicy({
    mode,
    difficulty: (session?.assignment?.difficulty ?? session?.difficulty ?? "easy") as Difficulty,
    assignmentAllowReveal: Boolean(session?.assignment?.allowReveal),
    assignmentQuestionMaxAttempts: session?.assignment?.maxQuestionAttempts ?? null,
  });

  // Locked product experiences own their reveal policy. A caller cannot disable
  // Daily-practice/public-challenge help by omitting a query parameter, and cannot
  // enable reveal for an assignment whose author disabled it.
  if (
    mode === "assignment" ||
    mode === "public_challenge" ||
    mode === "daily_five" ||
    mode === "onboarding_trial"
  ) {
    return policy.allowReveal;
  }

  return requested;
}

export function getAssignmentDifficulty(
  session: SessionRevealShape | null | undefined,
): Difficulty | null {
  const d = session?.assignment?.difficulty;
  return d ? (d as Difficulty) : null;
}
