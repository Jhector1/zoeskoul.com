// src/lib/security/ratelimit.ts
import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { inMemoryRateLimit } from "./inMemoryRateLimit";

type LimitResult =
    | { ok: true; limit: number; remaining: number; resetMs: number }
    | { ok: false; limit: number; remaining: number; resetMs: number };

function mustGet(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

// Singleton (module-level) clients
const ratelimitCache = new Map<string, Ratelimit>();
const warnedDevelopmentFallbacks = new Set<string>();

type RateLimitConfig = {
    bucket: string;
    limit: number;
    window: `${number} s` | `${number} m` | `${number} h`;
};

const DEFAULT_CONFIG: RateLimitConfig = {
    bucket: "default",
    limit: 120,
    window: "60 s",
};

function getRatelimit(config: RateLimitConfig = DEFAULT_CONFIG): Ratelimit {
    const cacheKey = `${config.bucket}:${config.limit}:${config.window}`;
    const cached = ratelimitCache.get(cacheKey);
    if (cached) return cached;

    // Fail-closed in production: no Redis env => no API access (safer than “no limits”)
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (process.env.NODE_ENV === "production") {
        // Throw if missing
        mustGet("UPSTASH_REDIS_REST_URL");
        mustGet("UPSTASH_REDIS_REST_TOKEN");
    }

    if (!url || !token) {
        // dev fallback: no limiter (or you can add in-memory here if you want)
        // Returning a dummy limiter is dangerous in prod, so we already throw above.
        throw new Error(
            "Rate limiter not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).",
        );
    }

    const redis = new Redis({ url, token });

    const limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.limit, config.window),
        analytics: true,
        prefix: `learnoir:rl:${config.bucket}`,
    });

    ratelimitCache.set(cacheKey, limiter);
    return limiter;
}

function developmentFallbackWarning(
    config: RateLimitConfig,
    error: unknown,
): void {
    const warningKey = [
        config.bucket,
        config.limit,
        config.window,
    ].join(":");

    if (warnedDevelopmentFallbacks.has(warningKey)) {
        return;
    }

    warnedDevelopmentFallbacks.add(warningKey);

    console.warn(
        "[ratelimit] remote limiter unavailable; using process-local development fallback",
        {
            bucket: config.bucket,
            limit: config.limit,
            window: config.window,
            error:
                error instanceof Error
                    ? error.message
                    : String(error),
        },
    );
}

export async function rateLimit(
    key: string,
    config?: Partial<RateLimitConfig>,
): Promise<LimitResult> {
    const mergedConfig: RateLimitConfig = {
        ...DEFAULT_CONFIG,
        ...(config ?? {}),
        bucket: config?.bucket ?? DEFAULT_CONFIG.bucket,
        limit: config?.limit ?? DEFAULT_CONFIG.limit,
        window: config?.window ?? DEFAULT_CONFIG.window,
    };

    try {
        const rl = getRatelimit(mergedConfig);
        const out = await rl.limit(key);

        return {
            ok: out.success,
            limit: out.limit,
            remaining: out.remaining,
            resetMs: out.reset, // epoch ms when window resets
        };
    } catch (error) {
        if (process.env.NODE_ENV === "production") {
            throw error;
        }

        developmentFallbackWarning(mergedConfig, error);

        return inMemoryRateLimit(
            key,
            mergedConfig,
        );
    }
}
