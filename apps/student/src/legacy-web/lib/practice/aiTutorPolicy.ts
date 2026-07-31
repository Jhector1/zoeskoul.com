export const AI_TUTOR_FAILURE_THRESHOLD = 2;

function nonNegativeWholeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

export function hasReachedAiTutorFailureThreshold(value: unknown) {
  return nonNegativeWholeNumber(value) >= AI_TUTOR_FAILURE_THRESHOLD;
}

export function resolveAiTutorFailureCount(args: {
  persistedFailures: unknown;
  reportedFailures?: unknown;
}) {
  return Math.max(
    nonNegativeWholeNumber(args.persistedFailures),
    nonNegativeWholeNumber(args.reportedFailures),
  );
}
