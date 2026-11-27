/** Editor-only, bounded retry policy. Never retry stale/auth/invalid requests. */
export const THUMBNAIL_INITIAL_DELAY_MS = 12_000;
export const THUMBNAIL_RETRY_DELAYS_MS = [8_000, 20_000] as const;
export const THUMBNAIL_MAX_ATTEMPTS = 1 + THUMBNAIL_RETRY_DELAYS_MS.length;
export type ThumbnailStatus = "waiting" | "capturing" | "retrying" | "saved" | "failed";
export function thumbnailRetryDelay(attempts: number, status: number | null): number | null {
  if (status !== null && status !== 503 && status !== 429) return null;
  return THUMBNAIL_RETRY_DELAYS_MS[attempts - 1] ?? null;
}
