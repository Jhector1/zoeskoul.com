import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Runner-private, process-local installed-dependency snapshots. Never mount the
// cache into an untrusted sandbox, and never serve its directories directly.
// The installer is the trusted frozen-lockfile, ignore-scripts command.
const MAX_ENTRIES = 3;
const MAX_ITEM_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 768 * 1024 * 1024;
const MAX_FILES = 60_000;
const TTL_MS = 30 * 60_000;

export function previewInstalledDependencyKey(input: Readonly<{
  actorKey: string;
  projectId: string;
  dependencyFingerprint: string;
  command: readonly string[];
  imageId: string;
}>): string {
  return createHash("sha256")
    .update(JSON.stringify([
      "zoebuild-preview-installed-v1", input.actorKey, input.projectId,
      input.dependencyFingerprint, input.command, input.imageId,
    ]))
    .digest("hex");
}

// Node's fs.cp recursively walks large pnpm trees with many per-file async
// operations. On Linux, GNU cp performs the same isolated tree copy much more
// efficiently and uses a copy-on-write reflink when the filesystem supports it.
// Always keep a fail-safe Node copy for environments without the GNU options.
// Never hardlink: a sandbox must not share writable inodes with this cache.
const execFileAsync = promisify(execFile);

async function copyIndependentTree(source: string, destination: string): Promise<void> {
  if (process.platform === "linux") {
    try {
      await execFileAsync("cp", [
        "-a", "--no-preserve=ownership", "--reflink=auto", "--", source, destination,
      ]);
      return;
    } catch {
      // A partially copied tree must never be used as a fallback destination.
      await fs.rm(destination, { recursive: true, force: true });
    }
  }
  await fs.cp(source, destination, {
    recursive: true, force: false, errorOnExist: true,
    verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE,
  });
}

type Snapshot = { dir: string; bytes: number; expiresAt: number };

export class PreviewInstalledDependencyCache {
  private readonly root = path.join(os.tmpdir(), `zoebuild-preview-deps-${randomUUID()}`);
  private readonly entries = new Map<string, Snapshot>();
  private totalBytes = 0;

  constructor() {
    // Expire disk snapshots even if the user stops switching versions.
    const sweep = setInterval(() => void this.expire(Date.now()), 60_000);
    sweep.unref?.();
  }

  private async remove(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
    await fs.rm(entry.dir, { recursive: true, force: true }).catch(() => undefined);
  }

  private async expire(now: number): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) await this.remove(key);
    }
  }

  // Verify that a package tree contains neither escaping symlinks nor an
  // unexpectedly large amount of data before caching it. A failed scan means
  // ordinary installation remains authoritative; it is never a cache hit.
  private async safeTreeSize(root: string): Promise<number | null> {
    let count = 0;
    let bytes = 0;
    // On macOS /var/... resolves through /private/var/... . Compare
    // canonical paths on both sides so safe pnpm links are not rejected
    // solely because the workspace was reached through a path alias.
    const canonicalRoot = await fs.realpath(root);
    const pending = [root];
    const prefix = canonicalRoot + path.sep;
    while (pending.length) {
      const dir = pending.pop()!;
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        if (++count > MAX_FILES) return null;
        const filename = path.join(dir, item.name);
        const stat = await fs.lstat(filename);
        if (stat.isSymbolicLink()) {
          const target = await fs.readlink(filename);
          // pnpm's normal links are relative and remain inside node_modules.
          if (path.isAbsolute(target)) return null;
          const resolved = await fs.realpath(filename).catch(() => null);
          if (!resolved || (resolved !== canonicalRoot && !resolved.startsWith(prefix))) return null;
        } else if (stat.isDirectory()) {
          pending.push(filename);
        } else if (stat.isFile()) {
          bytes += stat.size;
          if (bytes > MAX_ITEM_BYTES) return null;
        } else {
          return null;
        }
      }
    }
    return bytes;
  }

  async restore(key: string, workspaceDir: string): Promise<boolean> {
    await this.expire(Date.now());
    const entry = this.entries.get(key);
    if (!entry) return false;
    const destination = path.join(workspaceDir, "node_modules");
    if (await fs.lstat(destination).catch(() => null)) return false;
    try {
      // The cache is runner-private and previously checked for escaping links.
      // Always create an independent destination; never mount or hardlink it.
      await copyIndependentTree(entry.dir, destination);
      this.entries.delete(key);
      this.entries.set(key, entry);
      entry.expiresAt = Date.now() + TTL_MS;
      return true;
    } catch {
      await fs.rm(destination, { recursive: true, force: true }).catch(() => undefined);
      await this.remove(key);
      return false;
    }
  }

  async remember(key: string, workspaceDir: string): Promise<boolean> {
    const source = path.join(workspaceDir, "node_modules");
    try {
      if (!/^[a-f0-9]{64}$/.test(key)) return false;
      if (!(await fs.lstat(source)).isDirectory()) return false;
      const bytes = await this.safeTreeSize(source);
      if (bytes === null) return false;
      await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
      await fs.chmod(this.root, 0o700);
      await this.expire(Date.now());
      await this.remove(key);
      while (this.entries.size >= MAX_ENTRIES || this.totalBytes + bytes > MAX_TOTAL_BYTES) {
        const oldest = this.entries.keys().next().value;
        if (!oldest) break;
        await this.remove(oldest);
      }
      const destination = path.join(this.root, `${key}-${randomUUID()}`);
      try {
        await copyIndependentTree(source, destination);
        this.entries.set(key, { dir: destination, bytes, expiresAt: Date.now() + TTL_MS });
        this.totalBytes += bytes;
        return true;
      } catch {
        await fs.rm(destination, { recursive: true, force: true }).catch(() => undefined);
        return false;
      }
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    for (const key of [...this.entries.keys()]) await this.remove(key);
    await fs.rm(this.root, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const previewInstalledDependencyCache = new PreviewInstalledDependencyCache();
