import "server-only";

import Redis from "ioredis";

const REDIS_UNAVAILABLE_MESSAGE =
    "Redis is unavailable. Start Redis and set REDIS_URL, then restart the app.";

const globalForRedis = globalThis as typeof globalThis & {
    __zoeskoulRedis?: Redis;
    __zoeskoulRedisReadyPromise?: Promise<Redis> | null;
};

function getRedisUrl() {
    return (
        process.env.PTY_REDIS_URL?.trim() ||
        process.env.REDIS_URL?.trim() ||
        ""
    );
}

function friendlyRedisError(error: unknown) {
    const message =
        error instanceof Error ? error.message : String(error ?? "");

    if (
        message.includes("ECONNREFUSED") ||
        message.includes("max retries per request") ||
        message.includes("Connection is closed") ||
        message.includes("Stream isn't writeable") ||
        message.includes("connect ETIMEDOUT") ||
        message.includes("ENOTFOUND")
    ) {
        return REDIS_UNAVAILABLE_MESSAGE;
    }

    return null;
}

export function isRedisUnavailableError(error: unknown) {
    return friendlyRedisError(error) !== null;
}

export function redisUnavailableMessage(error: unknown) {
    return friendlyRedisError(error) ?? REDIS_UNAVAILABLE_MESSAGE;
}

export function getServerRedis(): Redis {
    const existing = globalForRedis.__zoeskoulRedis;
    if (existing) return existing;

    const url = getRedisUrl();

    if (!url) {
        throw new Error(
            "Missing REDIS_URL or PTY_REDIS_URL. Redis is required for production PTY session leases.",
        );
    }

    const redis = new Redis(url, {
        lazyConnect: true,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2_000,
        retryStrategy(times) {
            if (times > 3) return null;
            return Math.min(times * 200, 1_000);
        },
    });

    redis.on("error", (err) => {
        console.error("[redis] connection error", {
            message: err?.message,
        });
    });

    globalForRedis.__zoeskoulRedis = redis;
    return redis;
}

async function waitForReady(redis: Redis, timeoutMs = 2_500) {
    if (redis.status === "ready") return;

    await new Promise<void>((resolve, reject) => {
        let done = false;

        const cleanup = () => {
            redis.off("ready", onReady);
            redis.off("error", onError);
            redis.off("end", onEnd);
            clearTimeout(timer);
        };

        const finish = (error?: unknown) => {
            if (done) return;
            done = true;
            cleanup();

            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        const onReady = () => finish();
        const onError = (error: unknown) => finish(error);
        const onEnd = () => finish(new Error("Redis connection ended."));

        const timer = setTimeout(() => {
            finish(new Error(REDIS_UNAVAILABLE_MESSAGE));
        }, timeoutMs);

        redis.once("ready", onReady);
        redis.once("error", onError);
        redis.once("end", onEnd);
    });
}

export async function getServerRedisReady(): Promise<Redis> {
    const redis = getServerRedis();

    if (redis.status === "ready") {
        return redis;
    }

    if (globalForRedis.__zoeskoulRedisReadyPromise) {
        return await globalForRedis.__zoeskoulRedisReadyPromise;
    }

    const run = (async () => {
        try {
            if (redis.status === "wait" || redis.status === "end") {
                await redis.connect();
            }

            if (redis.status !== "ready") {
                await waitForReady(redis);
            }

            return redis;
        } catch (error) {
            const friendly = friendlyRedisError(error);
            if (friendly) {
                throw new Error(friendly);
            }

            throw error;
        }
    })();

    globalForRedis.__zoeskoulRedisReadyPromise = run;

    try {
        return await run;
    } finally {
        globalForRedis.__zoeskoulRedisReadyPromise = null;
    }
}