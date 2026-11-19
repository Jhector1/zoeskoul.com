import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { env } from "../../lib/env.js";
import { assertWorkspaceRootCanGrowBy } from "../workspace/workspacePolicy.js";
import {
  previewObservability,
  type DependencyLayerLookupOutcome,
} from "./previewObservability.js";

/**
 * Content-verified, project-scoped dependency layers in the SAME bind-mounted
 * root seen by the runner and the rootless Docker executor. Only trusted
 * frozen-lockfile/ignore-scripts installs may publish. A sandbox gets one
 * read-only mount, never this directory's writable parent or the runner root.
 */
const MAX_ENTRIES = 24;
// TanStack Start + Cloudflare installs can exceed 256 MiB. Keep publication
// bounded, still subject to workspace headroom, symlink safety, and full
// content attestation on every cache acquire. A 2 GiB total retains several
// ~478 MiB project layers without exhausting the shared 10 GiB workspace cap.
const MAX_ITEM_BYTES = 640 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
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
type TreeAttestation =
  | Readonly<{ ok: true; tree: Omit<Manifest, "schema" | "key" | "createdAt"> }>
  | Readonly<{ ok: false; reason:
      | "root-unavailable"
      | "file-limit"
      | "byte-limit"
      | "unsafe-link"
      | "external-hardlink"
      | "unsupported-entry"
      | "read-failure" }>;
export type DependencyLayerLease = { nodeModulesDir: string; release(): void };
export type DependencyLayerLookup = Readonly<{
  outcome: DependencyLayerLookupOutcome;
  verificationMs: number | null;
  lease: DependencyLayerLease | null;
}>;

export function previewDependencyLayerKey(input: Readonly<{
  actorKey: string;
  projectId: string;
  dependencyFingerprint: string;
  command: readonly string[];
  imageId: string;
  installPolicyFingerprint: string;
}>): string {
  return createHash("sha256")
    .update(JSON.stringify([SCHEMA, input.actorKey, input.projectId,
      input.dependencyFingerprint, input.command, input.imageId,
      input.installPolicyFingerprint]))
    .digest("hex");
}

/** Static trusted worker code. Paths and limits are data, never interpolated
 * into executable source. Keep the v1 byte digest and locale order identical.
 * Synchronous syscalls run off the Runner event loop, avoiding per-file libuv
 * dispatch and duplicate prefetch stats. Never use mtime as a cache hit proof. */
const ATTESTATION_WORKER = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parentPort, workerData } = require('node:worker_threads');
const { root, options, maxFiles, maxBytes } = workerData;
const failed = reason => ({ ok: false, reason });
function same(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode &&
    a.nlink === b.nlink && a.size === b.size &&
    a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function scan() {
  let st, canonical;
  try {
    st = fs.lstatSync(root, { bigint: true });
    if (!st.isDirectory() || st.isSymbolicLink()) return failed('root-unavailable');
    canonical = fs.realpathSync(root);
  } catch { return failed('root-unavailable'); }
  const digest = createHash('sha256');
  const buffer = Buffer.alloc(256 * 1024);
  let bytes = 0, files = 0;
  function walk(dir, prefix, before) {
    const children = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a,b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (++files > maxFiles) return 'file-limit';
      const filename = path.join(dir, child.name);
      const relative = prefix ? prefix + '/' + child.name : child.name;
      const info = fs.lstatSync(filename, { bigint: true });
      if (info.isSymbolicLink()) {
        const target = fs.readlinkSync(filename);
        if (path.isAbsolute(target)) return 'unsafe-link';
        let resolved;
        try { resolved = fs.realpathSync(filename); } catch { return 'unsafe-link'; }
        if (resolved !== canonical && !resolved.startsWith(canonical + path.sep)) return 'unsafe-link';
        if (!same(info, fs.lstatSync(filename, { bigint: true }))) return 'read-failure';
        digest.update('L\0' + relative + '\0' + target + '\0');
      } else if (info.isDirectory()) {
        digest.update('D\0' + relative + '\0');
        const error = walk(filename, relative, info);
        if (error) return error;
      } else if (info.isFile()) {
        if (!options.allowExternalHardlinks && info.nlink > 1n) return 'external-hardlink';
        if (info.size < 0n || info.size > BigInt(maxBytes - bytes)) return 'byte-limit';
        const size = Number(info.size);
        bytes += size;
        digest.update('F\0' + relative + '\0' + (Number(info.mode) & 0o111) + '\0' + size + '\0');
        if (!options.metadataOnly) {
          // Never follow a substituted final-component link or block on a FIFO.
          // Pin the inode, validate identity, and hash exactly the declared bytes.
          const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
          try {
            const opened = fs.fstatSync(fd, { bigint: true });
            if (!opened.isFile() || !same(info, opened)) return 'read-failure';
            let read = 0;
            while (read < size) {
              const n = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - read), null);
              if (n <= 0) return 'read-failure';
              digest.update(buffer.subarray(0,n)); read += n;
            }
            if (fs.readSync(fd, buffer, 0, 1, null) !== 0 ||
                !same(opened, fs.fstatSync(fd, { bigint: true }))) return 'read-failure';
          } finally { fs.closeSync(fd); }
        }
      } else return 'unsupported-entry';
    }
    // Detect directory-entry replacements during traversal. These are extra
    // stability checks, not a substitute for reading any regular file's bytes.
    if (!same(before, fs.lstatSync(dir, { bigint: true }))) return 'read-failure';
    return null;
  }
  try {
    const error = walk(root, '', st);
    if (error) return failed(error);
    return { ok: true, tree: { digest: digest.digest('hex'), bytes, files } };
  } catch { return failed('read-failure'); }
}
parentPort.postMessage(scan());
`;

// Global (not per tree or per store) bound on off-thread filesystem work.
// Release a slot only after its worker exits; queue wait is included in verification.
const MAX_ATTESTATION_WORKERS = 2;
let activeAttestationWorkers = 0;
const attestationWaiters: Array<() => void> = [];
async function reserveAttestationWorker(): Promise<() => void> {
  if (activeAttestationWorkers < MAX_ATTESTATION_WORKERS) activeAttestationWorkers++;
  else await new Promise<void>(resolve => attestationWaiters.push(resolve));
  return () => {
    const next = attestationWaiters.shift();
    if (next) next(); else activeAttestationWorkers--;
  };
}

function validateAttestation(value: unknown): TreeAttestation {
  if (value && typeof value === "object") {
    const a = value as TreeAttestation;
    if (a.ok === true && a.tree && typeof a.tree.digest === "string" && KEY.test(a.tree.digest) &&
        Number.isSafeInteger(a.tree.bytes) && a.tree.bytes >= 0 && a.tree.bytes <= MAX_ITEM_BYTES &&
        Number.isSafeInteger(a.tree.files) && a.tree.files >= 0 && a.tree.files <= MAX_FILES)
      return a;
    if (a.ok === false && ["root-unavailable", "file-limit", "byte-limit", "unsafe-link",
      "external-hardlink", "unsupported-entry", "read-failure"].includes(a.reason)) return a;
  }
  return { ok: false, reason: "read-failure" };
}

/** A complete byte scan on every acquire. Existing manifests remain valid. */
async function attestTree(root: string, options: Readonly<{
  allowExternalHardlinks?: boolean;
  metadataOnly?: boolean;
}> = {}): Promise<TreeAttestation> {
  const release = await reserveAttestationWorker();
  try {
    return await new Promise<TreeAttestation>((resolve) => {
      let result: TreeAttestation = { ok: false, reason: "read-failure" };
      let failed = false;
      const worker = new Worker(ATTESTATION_WORKER, {
        eval: true, execArgv: [], env: {},
        workerData: { root, options, maxBytes: MAX_ITEM_BYTES, maxFiles: MAX_FILES },
        resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8, stackSizeMb: 4 },
      });
      // Request termination after ten minutes; never accept a timed-out worker.
      // A blocked kernel filesystem call may delay termination and slot release.
      const timeout = setTimeout(() => { failed = true; void worker.terminate().catch(() => undefined); }, 10 * 60_000);
      worker.once("message", (value: unknown) => { result = validateAttestation(value); });
      worker.once("error", () => { failed = true; });
      worker.once("exit", (code) => {
        clearTimeout(timeout);
        resolve(!failed && code === 0 ? result : { ok: false, reason: "read-failure" });
      });
    });
  } catch { return { ok: false, reason: "read-failure" }; }
  finally { release(); }
}

export class PreviewDependencyLayerStore {
  private readonly leases = new Map<string, number>();
  private readonly removing = new Set<string>();
  private readonly verifying = new Map<string, number>();
  private readonly root: string;
  private readonly workspaceRoot: string;
  private readonly now: () => number;
  private readonly reserveCapacity: (root: string, additionalBytes: number) => Promise<void>;
  private readonly activeStaging = new Set<string>();
  private publicationTail: Promise<void> = Promise.resolve();
  private lookups = 0;
  private hits = 0;
  private misses = 0;
  private rejected = 0;
  private unavailable = 0;
  private corrupt = 0;
  private publishAttempts = 0;
  private published = 0;
  private publishSkipped = 0;
  constructor(
    workspaceRoot: string = env.workspaceRoot,
    options: Readonly<{
      now?: () => number;
      reserveCapacity?: (root: string, additionalBytes: number) => Promise<void>;
    }> = {},
  ) {
    this.workspaceRoot = workspaceRoot;
    this.root = path.join(workspaceRoot, ".zoebuild-preview-dependency-layers-v1");
    this.now = options.now ?? Date.now;
    this.reserveCapacity = options.reserveCapacity ?? assertWorkspaceRootCanGrowBy;
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
          !Number.isSafeInteger(m.createdAt) || m.createdAt > this.now() ||
          !KEY.test(m.digest) || !Number.isSafeInteger(m.bytes) ||
          m.bytes < 0 || m.bytes > MAX_ITEM_BYTES ||
          !Number.isSafeInteger(m.files) || m.files < 0 || m.files > MAX_FILES) return null;
      return m;
    } catch { return null; }
  }

  private async verified(key: string): Promise<Readonly<{
    outcome: DependencyLayerLookupOutcome;
    manifest: Manifest | null;
    verificationMs: number | null;
  }>> {
    const m = await this.manifest(key);
    if (!m) {
      const exists = await fs.lstat(this.entry(key)).catch(() => null);
      return { outcome: exists ? "corrupt" : "miss", manifest: null, verificationMs: null };
    }
    if (this.now() - m.createdAt > TTL_MS)
      return { outcome: "rejected", manifest: null, verificationMs: null };
    const startedAt = performance.now();
    const attestation = await attestTree(path.join(this.entry(key), "node_modules"));
    const verificationMs = performance.now() - startedAt;
    if (!attestation.ok || attestation.tree.digest !== m.digest ||
        attestation.tree.bytes !== m.bytes || attestation.tree.files !== m.files)
      return { outcome: "corrupt", manifest: null, verificationMs };
    return { outcome: "hit", manifest: m, verificationMs };
  }

  private async remove(key: string): Promise<boolean> {
    if (this.leases.get(key) || this.verifying.get(key) || this.removing.has(key)) return false;
    this.removing.add(key);
    try {
      // Pin a verification until it fails or becomes a counted lease. Never
      // remove and republish its path between byte attestation and lease issue.
      if (this.leases.get(key) || this.verifying.get(key)) return false;
      const dir = this.entry(key);
      const st = await fs.lstat(dir).catch(() => null);
      if (st?.isSymbolicLink()) { await fs.unlink(dir); return true; }
      if (st?.isDirectory()) await fs.rm(dir, { recursive: true, force: true });
      return Boolean(st);
    } finally {
      this.removing.delete(key);
    }
  }

  /** Reclaim old entries without touching any mounted by a live preview. */
  private async sweep(excludeKey: string, incomingBytes: number): Promise<void> {
    const entries: { key: string; createdAt: number; bytes: number }[] = [];
    for (const name of await fs.readdir(this.root)) {
      if (/^\.pending-[0-9a-f-]{36}$/i.test(name)) {
        if (this.activeStaging.has(name)) continue;
        const pending = path.join(this.root, name);
        const info = await fs.lstat(pending).catch(() => null);
        if (info && !info.isSymbolicLink() &&
            this.now() - info.mtimeMs > MIN_EVICTION_AGE_MS) {
          try {
            await fs.rm(pending, { recursive: true, force: true });
            previewObservability.recordDependencyLayerCleanup("evicted");
          } catch {
            previewObservability.recordDependencyLayerCleanup("failed");
          }
        }
        continue;
      }
      if (!KEY.test(name)) continue;
      const m = await this.manifest(name);
      if (!m) {
        // Never delete a possibly mounted dependency tree immediately after
        // another runner process recreated/crashed. Quarantine until older
        // than the maximum preview lifetime even when metadata is invalid.
        const info = await fs.lstat(this.entry(name)).catch(() => null);
        if (name !== excludeKey && info &&
            this.now() - info.mtimeMs > MIN_EVICTION_AGE_MS) {
          try {
            if (await this.remove(name)) previewObservability.recordDependencyLayerCleanup("evicted");
          } catch { previewObservability.recordDependencyLayerCleanup("failed"); }
        }
        continue;
      }
      if (this.now() - m.createdAt > TTL_MS) {
        if (name !== excludeKey && this.now() - m.createdAt > MIN_EVICTION_AGE_MS) {
          try {
            if (await this.remove(name)) previewObservability.recordDependencyLayerCleanup("evicted");
          } catch { previewObservability.recordDependencyLayerCleanup("failed"); }
        }
        continue;
      }
      entries.push({ key: name, createdAt: m.createdAt, bytes: m.bytes });
    }
    entries.sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
    let bytes = entries.reduce((n, e) => n + e.bytes, 0);
    let count = entries.length;
    for (const e of entries) {
      if (count < MAX_ENTRIES && bytes + incomingBytes <= MAX_TOTAL_BYTES) break;
      if (e.key === excludeKey || this.leases.get(e.key) ||
          this.now() - e.createdAt < MIN_EVICTION_AGE_MS) continue;
      try {
        if (await this.remove(e.key)) {
          previewObservability.recordDependencyLayerCleanup("evicted");
          bytes -= e.bytes;
          count--;
        }
      } catch { previewObservability.recordDependencyLayerCleanup("failed"); }
    }
  }

  private lease(key: string): DependencyLayerLease {
    this.leases.set(key, (this.leases.get(key) ?? 0) + 1);
    previewObservability.recordDependencyLayerLease("acquire");
    let released = false;
    return {
      nodeModulesDir: path.join(this.entry(key), "node_modules"),
      release: () => {
        if (released) return;
        released = true;
        const remaining = (this.leases.get(key) ?? 1) - 1;
        if (remaining) this.leases.set(key, remaining);
        else this.leases.delete(key);
        previewObservability.recordDependencyLayerLease("release");
      },
    };
  }

  async lookup(key: string): Promise<DependencyLayerLookup> {
    const startedAt = performance.now();
    this.lookups += 1;
    if (!KEY.test(key)) {
      this.rejected += 1;
      const durationMs = performance.now() - startedAt;
      previewObservability.recordDependencyLayerLookup("rejected", durationMs, null);
      return { outcome: "rejected", verificationMs: null, lease: null };
    }
    if (!await this.rootReady()) {
      this.unavailable += 1;
      const durationMs = performance.now() - startedAt;
      previewObservability.recordDependencyLayerLookup("unavailable", durationMs, null);
      return { outcome: "unavailable", verificationMs: null, lease: null };
    }
    if (this.removing.has(key)) {
      this.misses += 1;
      previewObservability.recordDependencyLayerLookup("miss", performance.now() - startedAt, null);
      return { outcome: "miss", verificationMs: null, lease: null };
    }
    this.verifying.set(key, (this.verifying.get(key) ?? 0) + 1);
    try {
      const verified = await this.verified(key);
      if (verified.outcome !== "hit") {
        this.misses += 1;
        if (verified.outcome === "rejected") this.rejected += 1;
        if (verified.outcome === "corrupt") this.corrupt += 1;
        const durationMs = performance.now() - startedAt;
        previewObservability.recordDependencyLayerLookup(
          verified.outcome, durationMs, verified.verificationMs,
        );
        return { outcome: verified.outcome, verificationMs: verified.verificationMs, lease: null };
      }
      if (this.removing.has(key)) {
        this.misses += 1;
        const durationMs = performance.now() - startedAt;
        previewObservability.recordDependencyLayerLookup(
          "miss", durationMs, verified.verificationMs,
        );
        return { outcome: "miss", verificationMs: verified.verificationMs, lease: null };
      }
      this.hits += 1;
      const durationMs = performance.now() - startedAt;
      previewObservability.recordDependencyLayerLookup("hit", durationMs, verified.verificationMs);
      return { outcome: "hit", verificationMs: verified.verificationMs, lease: this.lease(key) };
    } finally {
      const count = (this.verifying.get(key) ?? 1) - 1;
      if (count) this.verifying.set(key, count); else this.verifying.delete(key);
    }
  }

  async acquire(key: string): Promise<DependencyLayerLease | null> {
    return (await this.lookup(key)).lease;
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
    const prior = this.publicationTail;
    let release!: () => void;
    this.publicationTail = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try {
      return await this.publishExclusive(key, workspaceDir);
    } finally {
      release();
    }
  }

  /** Serialize capacity reservation, eviction, copy, and rename in the one
   * active Runner process so concurrent misses cannot jointly overcommit disk. */
  private async publishExclusive(
    key: string,
    workspaceDir: string,
  ): Promise<DependencyLayerLease | null> {
    const startedAt = performance.now();
    this.publishAttempts += 1;
    const skip = (reason: string) => {
      this.publishSkipped += 1;
      previewObservability.recordDependencyLayerPublication(
        "skipped", performance.now() - startedAt,
      );
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
    if (!inspected.ok) return skip(`source-tree-${inspected.reason}`);
    for (const name of [".vite", ".vite-temp"]) {
      const entry = await fs.lstat(path.join(source, name)).catch(() => null);
      if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
        return skip("vite-mount-target-conflict");
      }
    }
    const existing = await this.acquire(key);
    if (existing) {
      this.publishSkipped += 1;
      previewObservability.recordDependencyLayerPublication(
        "skipped", performance.now() - startedAt,
      );
      return existing;
    }
    await this.sweep(key, inspected.tree.bytes).catch(() => undefined);
    const published = (await Promise.all((await fs.readdir(this.root))
      .filter(name => KEY.test(name)).map(name => this.manifest(name)))).filter((m): m is Manifest => m !== null);
    if (published.length >= MAX_ENTRIES ||
        published.reduce((sum, m) => sum + m.bytes, 0) + inspected.tree.bytes > MAX_TOTAL_BYTES) {
      return skip("cache-capacity");
    }
    try {
      await this.reserveCapacity(this.workspaceRoot, inspected.tree.bytes);
    } catch {
      return skip("disk-headroom");
    }

    const staged = path.join(this.root, `.pending-${randomUUID()}`);
    const stagedName = path.basename(staged);
    const dest = this.entry(key);
    this.activeStaging.add(stagedName);
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
      if (!tree.ok) return skip(`detached-tree-${tree.reason}`);
      const manifest: Manifest = {
        schema: SCHEMA, key, createdAt: this.now(), ...tree.tree,
      };
      await fs.writeFile(path.join(staged, "manifest.json"), JSON.stringify(manifest), {
        mode: 0o644, flag: "wx",
      });
      if (await fs.lstat(dest).catch(() => null)) {
        // An old writer can finish the same content concurrently. Only
        // replace an unleased invalid entry; never alter a mounted layer.
        const winner = await this.acquire(key);
        if (winner) {
          this.publishSkipped += 1;
          previewObservability.recordDependencyLayerPublication(
            "skipped", performance.now() - startedAt,
          );
          return winner;
        }
        if (this.leases.get(key)) return skip("layer-in-use");
        await this.remove(key);
      }
      await fs.rename(staged, dest);
      this.published += 1;
      previewObservability.recordDependencyLayerPublication(
        "published", performance.now() - startedAt,
      );
      return this.lease(key);
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error &&
        typeof error.code === "string" ? error.code : "unclassified";
      console.info("RUNNER React preview dependency layer publication", {
        result: "skipped", reason: "staging-failed", code,
      });
      this.publishSkipped += 1;
      previewObservability.recordDependencyLayerPublication(
        "skipped", performance.now() - startedAt,
      );
      return null;
    } finally {
      this.activeStaging.delete(stagedName);
      await fs.rm(staged, { force: true, recursive: true }).catch(() => undefined);
    }
  }

  snapshot() {
    return {
      lookups: this.lookups,
      hits: this.hits,
      misses: this.misses,
      rejected: this.rejected,
      unavailable: this.unavailable,
      corrupt: this.corrupt,
      publishAttempts: this.publishAttempts,
      published: this.published,
      publishSkipped: this.publishSkipped,
      activeKeys: this.leases.size,
      activeLeases: [...this.leases.values()].reduce((sum, count) => sum + count, 0),
      diskBytes: { available: false, reason: "included_in_workspace_root_scan" },
    } as const;
  }

  /** Bounded metadata-only inventory for the authenticated metrics endpoint. */
  async storageSnapshot() {
    if (!await this.rootReady()) return { available: false as const, entries: 0, bytes: 0 };
    let entries = 0;
    let bytes = 0;
    for (const name of await fs.readdir(this.root)) {
      if (!KEY.test(name)) continue;
      const manifest = await this.manifest(name);
      if (!manifest) continue;
      entries += 1;
      bytes += manifest.bytes;
    }
    return { available: true as const, entries, bytes };
  }

  /** Reject unavailable mounts without exposing the private store root. */
  static bind(lease: DependencyLayerLease): string {
    const normalized = path.resolve(lease.nodeModulesDir);
    const layer = path.dirname(normalized);
    const store = path.dirname(layer);
    if (!path.isAbsolute(lease.nodeModulesDir) || normalized !== lease.nodeModulesDir ||
        path.basename(normalized) !== "node_modules" || !KEY.test(path.basename(layer)) ||
        path.basename(store) !== ".zoebuild-preview-dependency-layers-v1" ||
        /[\r\n:]/.test(lease.nodeModulesDir)) {
      throw new Error("Invalid trusted dependency layer mount.");
    }
    return `${lease.nodeModulesDir}:/workspace/node_modules:ro`;
  }
}

export const previewDependencyLayerStore = new PreviewDependencyLayerStore();
