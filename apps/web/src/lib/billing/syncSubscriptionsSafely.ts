type SyncSubscriptionsSafelyArgs = {
  userId: string;
  source: string;
  sync: (userId: string) => Promise<void>;
  logError?: (
    message: string,
    details: { userId: string; error: unknown },
  ) => void;
};

/**
 * Preserve the existing sync-on-read fallback behavior while making failures
 * observable. A Stripe outage should not crash the billing page, but it must
 * never be silently swallowed because that leaves stale local status hidden.
 */
export async function syncSubscriptionsSafely({
  userId,
  source,
  sync,
  logError = console.error,
}: SyncSubscriptionsSafelyArgs): Promise<boolean> {
  try {
    await sync(userId);
    return true;
  } catch (error) {
    logError(`[${source}] Stripe subscription sync failed`, {
      userId,
      error,
    });
    return false;
  }
}
