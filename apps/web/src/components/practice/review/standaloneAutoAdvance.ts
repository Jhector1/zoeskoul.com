import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import type { QItem } from "@/lib/practice/uiTypes";

const STANDALONE_AUTO_ADVANCE_MODES = new Set<PracticeExperienceMode>([
  "practice",
  "standard",
  "daily_five",
  "assignment",
]);

export function supportsStandaloneAutoAdvance(mode: PracticeExperienceMode) {
  return STANDALONE_AUTO_ADVANCE_MODES.has(mode);
}

/**
 * Mirrors Review QuizBlock's flow-completion rule for practice questions:
 * advance after a correct answer, or after a limited-attempt exercise is
 * exhausted. Revealing an answer remains deliberate and never jumps away.
 */
export function isStandaloneAnswerResolved(args: {
  current: QItem | null;
  maxAttempts: number;
}) {
  const current = args.current;
  if (!current || current.revealed) return false;
  if (current.result?.ok === true) return true;

  const maxAttempts = Number(args.maxAttempts);
  const attempts = Number(current.attempts ?? 0);

  return (
    Number.isFinite(maxAttempts) &&
    maxAttempts > 0 &&
    Number.isFinite(attempts) &&
    attempts >= maxAttempts
  );
}
