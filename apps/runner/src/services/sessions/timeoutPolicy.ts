export type TimeoutPolicy = {
    idleTimeoutMs: number;
    wallTimeoutMs: number;
};

const MIN_IDLE_MS = 15_000;
const MIN_WALL_MS = 30_000;

const MAX_IDLE_MS = 60 * 60_000; // 60 minutes
const MAX_WALL_MS = 4 * 60 * 60_000; // 4 hours

const CODE_POLICY: TimeoutPolicy = {
    idleTimeoutMs: 60_000,
    wallTimeoutMs: 3 * 60_000,
};

const SHELL_POLICY: TimeoutPolicy = {
    idleTimeoutMs: 20 * 60_000,
    wallTimeoutMs: 60 * 60_000,
};

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

export function resolveTimeoutPolicy(args: {
    kind: "code" | "shell";
    requestedIdleTimeoutMs?: number;
    requestedWallTimeoutMs?: number;
}): TimeoutPolicy {
    const base = args.kind === "shell" ? SHELL_POLICY : CODE_POLICY;

    const idleTimeoutMs = clamp(
        args.requestedIdleTimeoutMs ?? base.idleTimeoutMs,
        MIN_IDLE_MS,
        MAX_IDLE_MS,
    );

    const wallTimeoutMs = clamp(
        args.requestedWallTimeoutMs ?? base.wallTimeoutMs,
        MIN_WALL_MS,
        MAX_WALL_MS,
    );

    return {
        idleTimeoutMs,
        wallTimeoutMs,
    };
}