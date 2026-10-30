import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { env } from "../../lib/env.js";

/**
 * Content-verified, project-scoped dependency layers in the SAME bind-mounted
 * root seen by the runner and the rootless Docker executor. Only trusted
 * frozen-lockfile/ignore-scripts installs may publish. A sandbox gets one
 * read-only mount, never this directory's writable parent or the runner root.
 */
const MAX_ENTRIES = 24;
const MAX_ITEM_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_FILES = 60_000;
const TTL_MS = 24 * 60 * 60_000; // exceeds the preview hard lifetime
const MIN_EVICTION_AGE_MS = 75 * 60_000; // survives active previews after service restart
const SCHEMA = "zoebuild-preview-dependency-layer-v1";
const KEY = /^[a-f0-9]{64}$/;

type Manifest = {
  schema: typeof SCHEMA;
  key: string;
  createdAt: number;
  digest: string;
  bytes: number;
  files: number;
};
export type DependencyLayerLease = { nodeModulesDir: string; release(): void };

export function previewDependencyLayerKey(input: Readonly<{
  actorKey: string;
  projectId: string;
  dependencyFingerprint: string;
  command: readonly string[];
  imageId: string;
}>): string {
  return createHash("sha256")
    .update(JSON.stringify([SCHEMA, input.actorKey, input.projectId,
      input.dependencyFingerprint, input.command, input.imageId]))
    .digest("hex");
}

function within(root: string, absolute: string) {
  return absolute === root || absolute.startsWith(root + path.sep);
}

/** Verify file content, symlink containment, and bounded disk footprint. */
async function attestTree(root: string, options: Readonly<{
  allowExternalHardlinks?: boolean;
  metadataOnly?: boolean;
}> = {}): Promise<Omit<Manifest, "schema" | "key" | "createdAt"> | null> {
  const st = await fs.lstat(root).catch(() => null);
  if (!st?.isDirectory() || st.isSymbolicLink()) return null;
  const canonical = await fs.realpath(root);
  const digest = createHash("sha256");
  let bytes = 0;
  let files = 0;
  const walk = async (dir: string, prefix: string): Promise<boolean> => {
    const children = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (++files > MAX_FILES) return false;
      const filename = path.join(dir, child.name);
      const relative = prefix ? `${prefix}/${child.name}` : child.name;
      const info = await fs.lstat(filename);
      if (info.isSymbolicLink()) {
        const target = await fs.readlink(filename);
        if (path.isAbsolute(target)) return false;
        const resolved = await fs.realpath(filename).catch(() => null);
        if (!resolved || !within(canonical, resolved)) return false;
        digest.update(`L\0${relative}\0${target}\0`);
      } else if (info.isDirectory()) {
        digest.update(`D\0${relative}\0`);
        if (!await walk(filename, relative)) return false;
      } else if (info.isFile()) {
        // Do not accept an inode also reachable through a writable external
        // path. A read-only Docker mount does not make its other hardlinks RO.
        if (!options.allowExternalHardlinks && info.nlink > 1) return false;
        bytes += info.size;
        if (bytes > MAX_ITEM_BYTES) return false;
        digest.update(`F\0${relative}\0${info.mode & 0o111}\0${info.size}\0`);
        // Stream large files so a cache check cannot allocate hundreds of MiB
        // inside the runner's 512 MiB service memory allowance.
        if (!options.metadataOnly) {
          for await (const chunk of createReadStream(filename)) digest.update(chunk as Buffer);
        }
      } else return false;
    }
    return true;
  };
  try {
    if (!await walk(root, "")) return null;
  } catch { return null; }
  return { digest: digest.digest("hex"), bytes, files };
}

export class PreviewDependencyLayerStore {
  private readonly leases = new Map<string, number>();
  private readonly root: string;
  constructor(workspaceRoot: string = env.workspaceRoot) {
    this.root = path.join(workspaceRoot, ".zoebuild-preview-dependency-layers-v1");
  }

  private entry(key: string): string {
    if (!KEY.test(key)) throw new Error("Invalid dependency layer key.");
    return path.join(this.root, key);
  }

  private async rootReady(): Promise<boolean> {
    try {
      const parent = await fs.realpath(path.dirname(this.root));
      if (!path.isAbsolute(parent)) return false;
      await fs.mkdir(this.root, { recursive: true, mode: 0o711 });
      const state = await fs.lstat(this.root);
      if (!state.isDirectory() || state.isSymbolicLink()) return false;
      // A traverse-only parent is needed by the rootless Docker daemon for a
      // nested read-only bind. A preview never receives this parent as a mount.
      await fs.chmod(this.root, 0o711);
      return true;
    } catch { return false; }
  }

  private async manifest(key: string): Promise<Manifest | null> {
    try {
      const dir = this.entry(key);
      const s = await fs.lstat(dir);
      if (!s.isDirectory() || s.isSymbolicLink()) return null;
      const meta = await fs.lstat(path.join(dir, "manifest.json"));
      if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 1000) return null;
      const parsed: unknown = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
      if (!parsed || typeof parsed !== "object") return null;
      const m = parsed as Manifest;
      if (m.schema !== SCHEMA || m.key !== key ||
          !Number.isSafeInteger(m.createdAt) || m.createdAt > Date.now() ||
          !KEY.test(m.digest) || !Number.isSafeInteger(m.bytes) ||
          m.bytes < 0 || m.bytes > MAX_ITEM_BYTES ||
          !Number.isSafeInteger(m.files) || m.files < 0 || m.files > MAX_FILES) return null;
      return m;
    } catch { return null; }
  }

  private async verified(key: string): Promise<Manifest | null> {
    const m = await this.manifest(key);
    if (!m) return null;
    if (Date.now() - m.createdAt > TTL_MS) return null;
    const tree = await attestTree(path.join(this.entry(key), "node_modules"));
    if (!tree || tree.digest !== m.digest || tree.bytes !== m.bytes || tree.files !== m.files) return null;
    return m;
  }

  private async remove(key: string): Promise<void> {
    if (this.leases.get(key)) return;
    const dir = this.entry(key);
    const st = await fs.lstat(dir).catch(() => null);
    if (st?.isSymbolicLink()) { await fs.unlink(dir); return; }
    if (st?.isDirectory()) await fs.rm(dir, { recursive: true, force: true });
  }

  /** Reclaim old entries without touching any mounted by a live preview. */
  private async sweep(excludeKey: string): Promise<void> {
    const entries: { key: string; createdAt: number; bytes: number }[] = [];
    for (const name of await fs.readdir(this.root)) {
      if (!KEY.test(name)) continue;
      const m = await this.manifest(name);
      if (!m) {
        // Never delete a possibly mounted dependency tree immediately after
        // another runner process recreated/crashed. Quarantine until older
        // than the maximum preview lifetime even when metadata is invalid.
        const info = await fs.lstat(this.entry(name)).catch(() => null);
        if (name !== excludeKey && info &&
            Date.now() - info.mtimeMs > MIN_EVICTION_AGE_MS) await this.remove(name);
        continue;
      }
      if (Date.now() - m.createdAt > TTL_MS) {
        if (name !== excludeKey && Date.now() - m.createdAt > MIN_EVICTION_AGE_MS) await this.remove(name);
        continue;
      }
      entries.push({ key: name, createdAt: m.createdAt, bytes: m.bytes });
    }
    entries.sort((a, b) => a.createdAt - b.createdAt);
    let bytes = entries.reduce((n, e) => n + e.bytes, 0);
    let count = entries.length;
    for (const e of entries) {
      if (count <= MAX_ENTRIES && bytes <= MAX_TOTAL_BYTES) break;
      if (e.key === excludeKey || this.leases.get(e.key) ||
          Date.now() - e.createdAt < MIN_EVICTION_AGE_MS) continue;
      await this.remove(e.key);
      bytes -= e.bytes;
      count--;
    }
  }

  private lease(key: string): DependencyLayerLease {
    this.leases.set(key, (this.leases.get(key) ?? 0) + 1);
    let released = false;
    return {
      nodeModulesDir: path.join(this.entry(key), "node_modules"),
      release: () => {
        if (released) return;
        released = true;
        const remaining = (this.leases.get(key) ?? 1) - 1;
        if (remaining) this.leases.set(key, remaining);
        else this.leases.delete(key);
      },
    };
  }

  async acquire(key: string): Promise<DependencyLayerLease | null> {
    if (!KEY.test(key) || !await this.rootReady()) return null;
    if (!await this.verified(key)) return null;
    return this.lease(key);
  }

  /**
   * A cold sandbox install may be owned by a rootless user namespace and use
   * hardlinks into its private pnpm store. Do NOT chmod or mutate that tree.
   * Copy ONCE to a runner-owned staging dir (CoW when supported), verify all
   * bytes/links again, then publish atomically. Warm previews only verify and
   * mount the shared tree RO; they never copy it into the workspace.
   *
   * The original install remains private to the first preview and is cleaned
   * up with that workspace. Failed publication must never break that preview.
   */
  async publish(key: string, workspaceDir: string): Promise<DependencyLayerLease | null> {
    const skip = (reason: string) => {
      console.info("RUNNER React preview dependency layer publication", { result: "skipped", reason });
      return null;
    };
    if (!KEY.test(key)) return skip("invalid-key");
    if (!await this.rootReady()) return skip("cache-root-unavailable");
    const source = path.join(workspaceDir, "node_modules");
    // Safety and capacity validation BEFORE using additional storage. This
    // input is private and no longer modified by the trusted install container.
    // External hardlinks are allowed only here, before detachment.
    const inspected = await attestTree(source, {
      allowExternalHardlinks: true, metadataOnly: true,
    });
    if (!inspected) return skip("source-tree-unavailable-or-limit");
    for (const name of [".vite", ".vite-temp"]) {
      const entry = await fs.lstat(path.join(source, name)).catch(() => null);
      if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
        return skip("vite-mount-target-conflict");
      }
    }
    const existing = await this.acquire(key);
    if (existing) return existing;
    await this.sweep(key).catch(() => undefined);
    const published = (await Promise.all((await fs.readdir(this.root))
      .filter(name => KEY.test(name)).map(name => this.manifest(name)))).filter((m): m is Manifest => m !== null);
    if (published.length >= MAX_ENTRIES ||
        published.reduce((sum, m) => sum + m.bytes, 0) + inspected.bytes > MAX_TOTAL_BYTES) {
      return skip("cache-capacity");
    }

    const staged = path.join(this.root, `.pending-${randomUUID()}`);
    const dest = this.entry(key);
    try {
      await fs.mkdir(staged, { mode: 0o755 });
      const cloned = path.join(staged, "node_modules");
      // Explicitly detach pnpm's content-addressed hardlinks. Never mount a
      // writable hardlink outside this layer into another preview.
      await fs.cp(source, cloned, {
        recursive: true, force: false, errorOnExist: true,
        verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE,
      });
      // Node fs.cp preserves the source directory mode. A rootless install
      // may have a read-only (0555) node_modules root, so writing .vite
      // mount points into the DETACHED copy would fail with EACCES.
      // Make only our private copy owner-writable; never chmod the source.
      const clonedRoot = await fs.lstat(cloned);
      if (!clonedRoot.isDirectory() || clonedRoot.isSymbolicLink()) {
        return skip("detached-tree-invalid");
      }
      await fs.chmod(cloned, (clonedRoot.mode & 0o777) | 0o700);
      for (const name of [".vite", ".vite-temp"]) {
        await fs.mkdir(path.join(cloned, name), { recursive: true, mode: 0o755 });
      }
      // This scan rejects any hardlink that survived the copy and symlinks
      // that now escape the copied tree. A digest covers *actual* bytes.
      const tree = await attestTree(cloned);
      if (!tree) return skip("detached-tree-invalid");
      const manifest: Manifest = { schema: SCHEMA, key, createdAt: Date.now(), ...tree };
      await fs.writeFile(path.join(staged, "manifest.json"), JSON.stringify(manifest), {
        mode: 0o644, flag: "wx",
      });
      if (await fs.lstat(dest).catch(() => null)) {
        // An old writer can finish the same content concurrently. Only
        // replace an unleased invalid entry; never alter a mounted layer.
        const winner = await this.acquire(key);
        if (winner) return winner;
        if (this.leases.get(key)) return skip("layer-in-use");
        await this.remove(key);
      }
      await fs.rename(staged, dest);
      return this.lease(key);
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error &&
        typeof error.code === "string" ? error.code : "unclassified";
      console.info("RUNNER React preview dependency layer publication", {
        result: "skipped", reason: "staging-failed", code,
      });
      return null;
    } finally {
      await fs.rm(staged, { force: true, recursive: true }).catch(() => undefined);
    }
  }

  /** Reject unavailable mounts without exposing the private store root. */
  static bind(lease: DependencyLayerLease): string {
    if (!path.isAbsolute(lease.nodeModulesDir) || !lease.nodeModulesDir.endsWith("/node_modules")) {
      throw new Error("Invalid trusted dependency layer mount.");
    }
    return `${lease.nodeModulesDir}:/workspace/node_modules:ro`;
  }
}

export const previewDependencyLayerStore = new PreviewDependencyLayerStore();
