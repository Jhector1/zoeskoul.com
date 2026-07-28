export type InMemoryRateLimitConfig = {
    bucket: string;
    limit: number;
    window: `${number} s` | `${number} m` | `${number} h`;
};

export type InMemoryRateLimitResult =
    | { ok: true; limit: number; remaining: number; resetMs: number }
    | { ok: false; limit: number; remaining: number; resetMs: number };

type WindowState = {
    timestamps: number[];
};

const windows = new Map<string, WindowState>();

function windowMilliseconds(
    window: InMemoryRateLimitConfig["window"],
): number {
    const match = /^(\d+)\s([smh])$/.exec(window);

    if (!match) {
        throw new Error(`Unsupported rate-limit window: ${window}`);
    }

    const amount = Number(match[1]);
    const unit = match[2];

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid rate-limit window: ${window}`);
    }

    if (unit === "h") return amount * 60 * 60 * 1_000;
    if (unit === "m") return amount * 60 * 1_000;
    return amount * 1_000;
}

function stateKey(
    key: string,
    config: InMemoryRateLimitConfig,
): string {
    return [
        config.bucket,
        config.limit,
        config.window,
        key,
    ].join(":");
}

/**
 * Process-local sliding-window limiter used only when the remote development
 * limiter is unavailable. Production must continue to use the shared remote
 * limiter so limits are consistent across instances.
 */
export function inMemoryRateLimit(
    key: string,
    config: InMemoryRateLimitConfig,
    now = Date.now(),
): InMemoryRateLimitResult {
    const windowMs = windowMilliseconds(config.window);
    const cutoff = now - windowMs;
    const cacheKey = stateKey(key, config);
    const previous = windows.get(cacheKey)?.timestamps ?? [];
    const active = previous.filter((timestamp) => timestamp > cutoff);

    if (active.length >= config.limit) {
        windows.set(cacheKey, { timestamps: active });

        return {
            ok: false,
            limit: config.limit,
            remaining: 0,
            resetMs: (active[0] ?? now) + windowMs,
        };
    }

    const timestamps = [...active, now];
    windows.set(cacheKey, { timestamps });

    return {
        ok: true,
        limit: config.limit,
        remaining: Math.max(0, config.limit - timestamps.length),
        resetMs: (timestamps[0] ?? now) + windowMs,
    };
}

export function resetInMemoryRateLimitsForTests(): void {
    windows.clear();
}
