import { env } from "../../lib/env.js";

const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;

export function consumeStartToken(actorKey: string) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const bucket = (buckets.get(actorKey) ?? []).filter((ts) => ts > cutoff);

  if (bucket.length >= env.startsPerMinutePerActor) {
    throw new Error(
      `Too many session starts. Limit is ${env.startsPerMinutePerActor} per minute.`,
    );
  }

  bucket.push(now);
  buckets.set(actorKey, bucket);
}

export function pruneStartRateLimitBuckets() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [actorKey, bucket] of buckets) {
    const next = bucket.filter((ts) => ts > cutoff);
    if (next.length) buckets.set(actorKey, next);
    else buckets.delete(actorKey);
  }
}
