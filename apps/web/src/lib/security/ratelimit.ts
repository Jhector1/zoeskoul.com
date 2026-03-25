// src/lib/security/ratelimit.ts
import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimitResult =
    | { ok: true; limit: number; remaining: number; resetMs: number }
    | { ok: false; limit: number; remaining: number; resetMs: number };

function mustGet(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

// Singleton (module-level) clients
let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit {
    if (_ratelimit) return _ratelimit;

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

    _ratelimit = new Ratelimit({
        redis,
        // Choose limits that fit your traffic. This is a safe baseline:
        // - 120 requests / 60 seconds per actor+ip key
        limiter: Ratelimit.slidingWindow(120, "60 s"),
        analytics: true,
        prefix: "learnoir:rl",
    });

    return _ratelimit;
}

export async function rateLimit(key: string): Promise<LimitResult> {
    const rl = getRatelimit();
    const out = await rl.limit(key);

    return {
        ok: out.success,
        limit: out.limit,
        remaining: out.remaining,
        resetMs: out.reset, // epoch ms when window resets
    };
}