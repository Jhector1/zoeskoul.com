import { createHash } from "node:crypto";

// Process-local positive cache only: no shared writable node_modules,
// untrusted lock input, persistent permissions, or automatic approval.
const MAX_ENTRIES = 16;
const MAX_LOCK_BYTES = 2 * 1024 * 1024;
const TTL_MS = 60 * 60_000;
const cache = new Map<string, Readonly<{ lock: string; expiresAt: number }>>();

export function bootstrapLockCacheKey(args: Readonly<{
  projectId: string;
  files: readonly Readonly<{ path: string; content: string }>[];
  command: readonly string[];
  image: string;
}>): string {
  const files = [...args.files].sort((a, b) => a.path.localeCompare(b.path));
  return createHash("sha256")
    .update(JSON.stringify(["zoebuild-lock-v1", args.projectId, args.image, args.command,
      files.map(file => [file.path, file.content])]))
    .digest("hex");
}

export function cachedBootstrapLock(key: string, now = Date.now()): string | null {
  const value = cache.get(key);
  if (!value) return null;
  if (value.expiresAt <= now) { cache.delete(key); return null; }
  // Maintain LRU order without changing the cache content.
  cache.delete(key);
  cache.set(key, value);
  return value.lock;
}

export function rememberBootstrapLock(key: string, lock: string, now = Date.now()): void {
  if (!/^[a-f0-9]{64}$/.test(key) || !lock.trim() ||
    Buffer.byteLength(lock, "utf8") > MAX_LOCK_BYTES) return;
  cache.delete(key);
  cache.set(key, { lock, expiresAt: now + TTL_MS });
  for (const [entry, value] of cache) {
    if (value.expiresAt <= now) cache.delete(entry);
  }
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// Coalesce only identical, already validated project-scoped resolutions.
// A rejected attempt is removed immediately, never cached and remains retryable.
// Limit retained promises independently of the positive cache: if capacity is
// reached, a new unrelated key executes as before instead of failing closed.
const MAX_INFLIGHT = 32;
const inflight = new Map<string, Promise<string>>();

export async function resolveBootstrapLockOnce(
  key: string,
  resolve: () => Promise<string>,
): Promise<Readonly<{ lock: string; mode: "hit" | "joined" | "resolved" }>> {
  const cached = cachedBootstrapLock(key);
  if (cached !== null) return { lock: cached, mode: "hit" };

  const existing = inflight.get(key);
  if (existing) return { lock: await existing, mode: "joined" };

  const resolveAndRemember = async () => {
    const lock = await resolve();
    rememberBootstrapLock(key, lock);
    return lock;
  };
  if (inflight.size >= MAX_INFLIGHT) {
    return { lock: await resolveAndRemember(), mode: "resolved" };
  }
  const job = resolveAndRemember();
  inflight.set(key, job);
  try {
    return { lock: await job, mode: "resolved" };
  } finally {
    if (inflight.get(key) === job) inflight.delete(key);
  }
}
