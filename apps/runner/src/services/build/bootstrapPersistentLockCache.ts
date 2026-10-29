import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

// A private POSITIVE cache: a completed trusted runner operation is the only
// writer. No arbitrary project files, package tree, approval seals, or secrets
// are stored here. The caller MUST use a key that includes the actual Docker
// image ID, trusted argv, project identity and exact dependency input bytes.
const LOCK_CACHE_DIR = ".zoebuild-trusted-bootstrap-locks-v1";
const MAX_LOCK_BYTES = 2 * 1024 * 1024;
const MAX_RECORD_BYTES = MAX_LOCK_BYTES + 2048;
const TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_RECORDS = 64;
const KEY_PATTERN = /^[a-f0-9]{64}$/;

type RecordV1 = Readonly<{
  format: 1;
  key: string;
  lock: string;
  lockSha256: string;
  expiresAt: number;
}>;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

async function privateCacheRoot(workspaceRoot: string): Promise<string | null> {
  const dir = path.join(workspaceRoot, LOCK_CACHE_DIR);
  try {
    await fs.mkdir(dir, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") return null;
  }
  try {
    const stat = await fs.lstat(dir);
    // Reject symlinks, a foreign-owner directory, or readable/writable
    // directories outside the runner's own identity. Never chmod an existing
    // suspicious directory into acceptability.
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) return null;
    return dir;
  } catch {
    return null;
  }
}

function validateRecord(value: unknown, key: string, now: number): string | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<RecordV1>;
  if (data.format !== 1 || data.key !== key ||
      typeof data.lock !== "string" || !data.lock.trim() ||
      Buffer.byteLength(data.lock, "utf8") > MAX_LOCK_BYTES ||
      data.lockSha256 !== digest(data.lock) ||
      typeof data.expiresAt !== "number" || !Number.isSafeInteger(data.expiresAt) ||
      data.expiresAt <= now || data.expiresAt > now + TTL_MS) return null;
  return data.lock;
}

export async function readPersistedBootstrapLock(
  workspaceRoot: string,
  key: string,
  now = Date.now(),
): Promise<string | null> {
  if (!safeKey(key)) return null;
  const dir = await privateCacheRoot(workspaceRoot);
  if (!dir) return null;
  let file: FileHandle | null = null;
  try {
    file = await fs.open(path.join(dir, `${key}.json`),
      constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid?.() ||
        (stat.mode & 0o077) !== 0 || stat.size > MAX_RECORD_BYTES || stat.size < 2) return null;
    const content = await file.readFile("utf8");
    return validateRecord(JSON.parse(content), key, now);
  } catch {
    return null; // cache failure must never authorize or prevent a trusted run
  } finally {
    await file?.close().catch(() => undefined);
  }
}

async function prune(dir: string, now: number): Promise<void> {
  // Bounded private filesystem maintenance. Never follow links or traverse
  // cached paths. If maintenance fails, correctness is unaffected.
  const entries = await fs.readdir(dir);
  if (entries.length > 256) return; // fail closed on unexpected volume
  const records: Array<{ file: string; mtimeMs: number }> = [];
  for (const file of entries) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
    const absolute = path.join(dir, file);
    const stat = await fs.lstat(absolute).catch(() => null);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) continue;
    if (stat.mtimeMs + TTL_MS < now) {
      await fs.rm(absolute, { force: true }).catch(() => undefined);
    } else records.push({ file: absolute, mtimeMs: stat.mtimeMs });
  }
  records.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of records.slice(0, Math.max(0, records.length - MAX_RECORDS))) {
    await fs.rm(entry.file, { force: true }).catch(() => undefined);
  }
}

export async function persistBootstrapLock(
  workspaceRoot: string,
  key: string,
  lock: string,
  now = Date.now(),
): Promise<boolean> {
  if (!safeKey(key) || !lock.trim() ||
      Buffer.byteLength(lock, "utf8") > MAX_LOCK_BYTES) return false;
  const dir = await privateCacheRoot(workspaceRoot);
  if (!dir) return false;
  const entry: RecordV1 = {
    format: 1, key, lock, lockSha256: digest(lock), expiresAt: now + TTL_MS,
  };
  const temporary = path.join(dir, `${key}-${randomUUID()}.tmp`);
  let file: FileHandle | null = null;
  try {
    file = await fs.open(temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600);
    await file.writeFile(JSON.stringify(entry), "utf8");
    await file.sync();
    await file.close();
    file = null;
    await fs.rename(temporary, path.join(dir, `${key}.json`));
    await prune(dir, now).catch(() => undefined);
    return true;
  } catch {
    return false;
  } finally {
    await file?.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}
