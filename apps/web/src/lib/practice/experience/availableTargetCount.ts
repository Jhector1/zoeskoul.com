/**
 * Shared count policy for a practice scope.
 *
 * Product defaults describe the preferred session size. The authored exercise
 * pool is authoritative: a valid smaller scope should produce a smaller
 * session instead of starting a run that can never reach its target.
 */
export const DEFAULT_STANDARD_PRACTICE_TARGET_COUNT = 10;

function positiveWholeNumber(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export function resolveAvailablePracticeTargetCount(args: {
  requested: unknown;
  available: unknown;
  fallback?: number;
}) {
  const fallback = positiveWholeNumber(
    args.fallback ?? DEFAULT_STANDARD_PRACTICE_TARGET_COUNT,
    DEFAULT_STANDARD_PRACTICE_TARGET_COUNT,
  );
  const requested = positiveWholeNumber(args.requested, fallback);
  const available = Math.max(
    0,
    Math.floor(Number.isFinite(Number(args.available)) ? Number(args.available) : 0),
  );

  return available === 0 ? 0 : Math.min(requested, available);
}
