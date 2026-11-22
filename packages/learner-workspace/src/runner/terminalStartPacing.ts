/**
 * Pure rolling-window guard for optional automatic terminal acquisition.
 * Never replaces Runner rate limiting, workspace identity or authorization.
 */
export function getAutomaticTerminalStartWaitMs(args: {
    starts: readonly number[];
    now: number;
    limit: number;
    windowMs: number;
}): number {
    const { starts, now, limit, windowMs } = args;
    if (!Number.isFinite(now) || !Number.isInteger(limit) || limit < 1 ||
        !Number.isFinite(windowMs) || windowMs <= 0) {
        throw new Error("Invalid automatic terminal start pacing configuration");
    }
    const recent = starts
        .filter((at) => Number.isFinite(at) && at <= now && at > now - windowMs)
        .sort((a, b) => a - b);
    if (recent.length < limit) return 0;
    return Math.max(1, recent[recent.length - limit] + windowMs - now + 1);
}
