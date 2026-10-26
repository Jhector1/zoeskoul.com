import "server-only";

import Redis from "ioredis";

/**
 * The handoff is an identity trust boundary. It must not share the PTY Redis
 * URL (which may be an SSH-forwarded older Redis) or silently fall back to it.
 */
const environmentKey = "ZOESKOUL_BUILD_HANDOFF_REDIS_URL";

const globalForHandoff = globalThis as typeof globalThis & {
  __zoeskoulBuildHandoffRedis?: Redis;
  __zoeskoulBuildHandoffRedisUrl?: string;
  __zoeskoulBuildHandoffReady?: Promise<Redis> | null;
};

function redisUrl(): string {
  const url = process.env.ZOESKOUL_BUILD_HANDOFF_REDIS_URL?.trim();
  if (!url) throw new Error(`${environmentKey} must be configured`);
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error(`${environmentKey} is not a valid URL`); }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(`${environmentKey} must use redis:// or rediss://`);
  }
  return url;
}

function client(): Redis {
  const url = redisUrl();
  if (globalForHandoff.__zoeskoulBuildHandoffRedis) {
    if (url !== globalForHandoff.__zoeskoulBuildHandoffRedisUrl) {
      throw new Error("Handoff Redis address changed; restart the website server");
    }
    return globalForHandoff.__zoeskoulBuildHandoffRedis;
  }
  const redis = new Redis(url, {
    lazyConnect: true,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    retryStrategy(times) { return times > 3 ? null : Math.min(times * 200, 1_000); },
  });
  // Attach a listener so connection failures cannot become unhandled events.
  // Do not log URLs, passwords, ticket keys, or other authentication material.
  redis.on("error", () => {});
  globalForHandoff.__zoeskoulBuildHandoffRedis = redis;
  globalForHandoff.__zoeskoulBuildHandoffRedisUrl = url;
  return redis;
}

async function awaitReady(redis: Redis): Promise<void> {
  if (redis.status === "ready") return;
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      redis.off("ready", onReady);
      redis.off("error", onError);
      redis.off("end", onEnd);
      clearTimeout(timeout);
    };
    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = (error: unknown) => finish(error);
    const onEnd = () => finish(new Error("Handoff Redis connection ended"));
    const timeout = setTimeout(() => finish(new Error("Handoff Redis connection timed out")), 2_500);
    redis.once("ready", onReady);
    redis.once("error", onError);
    redis.once("end", onEnd);
    if (redis.status === "ready") finish();
  });
}

/** Redis >= 6.2 required: GETDEL provides single-use, atomic ticket redemption. */
export async function getBuildHandoffRedisReady(): Promise<Redis> {
  const redis = client();
  if (redis.status === "ready") return redis;
  if (globalForHandoff.__zoeskoulBuildHandoffReady) {
    return globalForHandoff.__zoeskoulBuildHandoffReady;
  }
  const pending = (async () => {
    if (redis.status === "wait" || redis.status === "end") await redis.connect();
    else if (redis.status !== "ready") await awaitReady(redis);
    if (redis.status !== "ready") throw new Error("Handoff Redis is unavailable");
    return redis;
  })();
  globalForHandoff.__zoeskoulBuildHandoffReady = pending;
  try { return await pending; }
  finally { globalForHandoff.__zoeskoulBuildHandoffReady = null; }
}
