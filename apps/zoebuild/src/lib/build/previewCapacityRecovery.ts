/** Capacity retry policy for one trusted preview bootstrap attempt.
 * A bounded delay prevents an overloaded runner from being hammered.
 * Retry-After is advisory; a pathological or malformed value is ignored.
 */
export const PREVIEW_CAPACITY_RETRY_DEFAULT_MS = 45_000;
export function previewCapacityRetryDelayMs(retryAfter: string | null): number {
  if (retryAfter === null || !/^[0-9]{1,2}$/.test(retryAfter.trim()))
    return PREVIEW_CAPACITY_RETRY_DEFAULT_MS;
  const seconds = Number(retryAfter.trim());
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 60
    ? seconds * 1000 : PREVIEW_CAPACITY_RETRY_DEFAULT_MS;
}
