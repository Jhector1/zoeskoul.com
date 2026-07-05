import "server-only";

export const DEFAULT_DAILY_PRACTICE_TARGET_COUNT = 3;
export const MIN_DAILY_PRACTICE_TARGET_COUNT = 1;
export const MAX_DAILY_PRACTICE_TARGET_COUNT = 20;

export function normalizeDailyPracticeTargetCount(
  value: unknown,
  fallback = DEFAULT_DAILY_PRACTICE_TARGET_COUNT,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;

  const whole = Math.trunc(parsed);
  return Math.min(
    MAX_DAILY_PRACTICE_TARGET_COUNT,
    Math.max(MIN_DAILY_PRACTICE_TARGET_COUNT, whole),
  );
}

/**
 * Number of unique exercises placed in each newly-created daily-practice run.
 *
 * Existing runs keep the target count stored in PracticeSession/meta, so an
 * environment change never rewrites or invalidates a learner's active run.
 */
export const DAILY_PRACTICE_TARGET_COUNT = normalizeDailyPracticeTargetCount(
  process.env.PRACTICE_DAILY_TARGET_COUNT,
);
