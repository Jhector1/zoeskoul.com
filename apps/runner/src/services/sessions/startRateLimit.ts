import { env } from "../../lib/env.js";

const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;

export type SessionStartKind = "code" | "shell";

function limitFor(kind: SessionStartKind) {
  return kind === "code"
    ? env.codeStartsPerMinutePerActor
    : env.shellStartsPerMinutePerActor;
}

export function consumeStartToken(actorKey: string, kind: SessionStartKind) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const bucketKey = `${kind}\0${actorKey}`;
  const bucket = (buckets.get(bucketKey) ?? []).filter((ts) => ts > cutoff);
  const limit = limitFor(kind);

  if (bucket.length >= limit) {
    throw new Error(
      kind === "code"
        ? `Too many code runs. Limit is ${limit} per minute.`
        : `Too many terminal starts. Limit is ${limit} per minute.`,
    );
  }

  bucket.push(now);
  buckets.set(bucketKey, bucket);
}

export function pruneStartRateLimitBuckets() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [actorKey, bucket] of buckets) {
    const next = bucket.filter((ts) => ts > cutoff);
    if (next.length) buckets.set(actorKey, next);
    else buckets.delete(actorKey);
  }
}
