/** Canonical private Redis connection for PTY session leases only.
 * This must never fall back to generic Redis or auth-handoff Redis. */
export type PtyRedisEnvironment = {
  PTY_REDIS_URL?: string;
};

export function selectPtyRedisUrl(
  env: PtyRedisEnvironment = { PTY_REDIS_URL: process.env.PTY_REDIS_URL },
): string {
  const value = env.PTY_REDIS_URL?.trim();
  if (!value) {
    throw new Error("PTY_REDIS_URL is required for PTY session leases.");
  }
  return value;
}
