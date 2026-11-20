import { constants, type BigIntStats } from "node:fs";
import fs, { type FileHandle } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isTanstackLiveSourcePath, type ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { docker } from "../docker/dockerClient.js";

/**
 * Internal, non-routed source writer for a future authenticated development
 * preview. The Phase 3A transaction coordinator MUST own the exclusive lease
 * update and the trusted control plane MUST verify the saved source before and
 * after this call. This function is NOT a source-authorization boundary.
 *
 * The sandbox is stopped with Docker pause while host paths are inspected and
 * replaced. The container ID and mounted workspace identity are checked from
 * Docker, rather than trusting an HTTP request or a user-supplied path.
 * Only source paths admitted by the more restrictive Phase 1 policy are used.
 * Existing immutable-preview routes must NEVER invoke this module.
 */
export async function applySuspendedTanstackDevelopmentSource(input: Readonly<{
  containerId: string;
  /** Trusted Runner configuration's workspaceRoot, NOT supplied by a client. */
  workspaceRoot: string;
  /** Trusted private sandbox handle's workspaceDir, NOT supplied by a client. */
  workspaceDir: string;
  changedPaths: readonly string[];
  next: Pick<ProductionBuildJobRequestV1, "files">;
}>): Promise<void> {
  const changes = validateChanges(input.changedPaths, input.next.files);
  const root = await validateWorkspaceRoot(input.workspaceRoot, input.workspaceDir);
  if (!/^[a-f0-9]{12,64}$/i.test(input.containerId))
    throw new Error("Invalid development preview container identity.");

  const container = docker.getContainer(input.containerId);
  const inspect = async () => {
    const info = await container.inspect();
    if (info.Id !== input.containerId ||
        info.Config?.Labels?.["com.zoeskoul.runner.purpose"] !== "tanstack-start-preview" ||
        info.HostConfig?.NetworkMode !== "none" ||
        !info.State?.Running ||
        !info.Mounts?.some(m => m.Type === "bind" && m.RW === true &&
          m.Source === root && m.Destination === "/workspace"))
      throw new Error("Development preview sandbox identity mismatch.");
    return info;
  };

  const before = await inspect();
  if (before.State?.Paused) throw new Error("Development preview sandbox already paused.");
  await container.pause();
  const notifications: WatcherNotification[] = [];
  try {
    let failed = false;
    try {
      const paused = await inspect();
      if (!paused.State?.Paused) throw new Error("Development preview did not pause.");
      // Recheck the entire root after Docker has suspended untrusted code.
      await validateWorkspaceRoot(input.workspaceRoot, input.workspaceDir);
      // Preflight every candidate before the first mutation. A failure after the
      // first write is treated as partial by Phase 3A and quarantines the lease.
      for (const change of changes) await inspectTarget(root, change.path, false);
      for (const change of changes) {
        const destination = await inspectTarget(root, change.path, true);
        if (change.content === null) {
          if (!destination.exists) throw new Error("Development source deletion target missing.");
          await fs.unlink(destination.path);
        } else {
          await replaceAtomically(destination.path, change.content);
        }
        await syncDirectory(path.dirname(destination.path));
      }
      // Acquire every notification handle while untrusted code is suspended.
      // The existing bounded change list also bounds the number of open handles.
      for (const change of changes)
        await pinWatcherNotification(root, change, notifications);
    } catch {
      failed = true;
    }
    try {
      await container.unpause();
    } catch {
      // This may leave the sandbox paused; the coordinator must quarantine it.
      throw new Error("Development preview sandbox resume failed.");
    }
    if (failed) throw new Error("Development preview workspace update failed.");
    try {
      // After resume only the pinned handles may mutate metadata. Path checks
      // are read-only race detection, not the basis for mutation authority.
      // The outer update lock still queues HMR frames until the revision CAS.
      for (const notification of notifications) {
        await checkWatcherNotification(root, notification);
        const state = await notification.handle.stat({bigint:true});
        assertWatcherIdentity(notification, state);
        const modified = new Date(Math.max(Date.now(), Number(state.mtimeMs) + 1));
        await notification.handle.utimes(state.atime, modified);
        await checkWatcherNotification(root, notification);
      }
    } catch {
      throw new Error("Development preview workspace update failed.");
    }
  } finally {
    // Never leak a handle on partial acquisition, failed resume, or notification
    // failure. A close failure also fails the transaction rather than hiding it.
    const closed = await Promise.allSettled(notifications.map(item => item.handle.close()));
    if (closed.some(result => result.status === "rejected"))
      throw new Error("Development preview workspace update failed.");
  }
}

const WORKSPACE_NAME = /^zoeskoul-run-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_CHANGE_BYTES = 2 * 1024 * 1024;
const MAX_CHANGED_FILES = 32;

type SourceChange = Readonly<{path: string; content: string | null}>;

/** Pure, bounded validation before any Docker operation or host filesystem write. */
export function validateDevelopmentSourceChanges(
  changedPaths: readonly string[], files: readonly {path:string;content:string}[],
): readonly SourceChange[] { return validateChanges(changedPaths, files); }

function validateChanges(
  changedPaths: readonly string[], files: readonly {path:string;content:string}[],
): readonly SourceChange[] {
  if (!Array.isArray(changedPaths) || !changedPaths.length ||
      changedPaths.length > MAX_CHANGED_FILES || !Array.isArray(files) || files.length > 300)
    throw new Error("Invalid development preview source changes.");
  const byPath = new Map<string,string>();
  const allKeys = new Set<string>();
  for (const entry of files) {
    if (!entry || typeof entry.path !== "string" ||
        typeof entry.content !== "string" ||
        !safePath(entry.path) || allKeys.has(entry.path.toLowerCase()))
      throw new Error("Invalid development preview source manifest.");
    allKeys.add(entry.path.toLowerCase());
    byPath.set(entry.path,entry.content);
  }
  const selected = new Set<string>();
  const changes: SourceChange[] = [];
  let totalBytes = 0;
  for (const candidate of changedPaths) {
    if (!safePath(candidate) || !isTanstackLiveSourcePath(candidate) ||
        selected.has(candidate.toLowerCase()))
      throw new Error("Unsafe development preview source path.");
    selected.add(candidate.toLowerCase());
    const content = byPath.get(candidate) ?? null; // null is an explicit removal.
    if (content !== null) {
      const bytes = Buffer.byteLength(content,"utf8");
      totalBytes += bytes;
      if (bytes > MAX_FILE_BYTES || totalBytes > MAX_CHANGE_BYTES)
        throw new Error("Development preview source update too large.");
    }
    changes.push({path:candidate,content});
  }
  return changes;
}

function safePath(candidate: unknown): candidate is string {
  return typeof candidate === "string" && candidate.length > 0 && candidate.length <= 512 &&
    !candidate.startsWith("/") && !candidate.includes("\\") && !candidate.includes("\0") &&
    candidate.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

async function validateWorkspaceRoot(workspaceRoot: string, workspaceDir: string) {
  if (!path.isAbsolute(workspaceRoot) || !path.isAbsolute(workspaceDir) ||
      path.normalize(workspaceRoot) !== workspaceRoot || path.normalize(workspaceDir) !== workspaceDir ||
      path.dirname(workspaceDir) !== workspaceRoot ||
      !WORKSPACE_NAME.test(path.basename(workspaceDir)))
    throw new Error("Invalid development preview workspace identity.");
  for (const candidate of [workspaceRoot, workspaceDir]) {
    const stat = await fs.lstat(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Unsafe development preview workspace root.");
  }
  const rootCanonical = await fs.realpath(workspaceRoot);
  const workspaceCanonical = await fs.realpath(workspaceDir);
  if (workspaceCanonical !== path.join(rootCanonical,path.basename(workspaceDir)))
    throw new Error("Unsafe development preview workspace root.");
  return workspaceDir;
}

async function inspectTarget(root: string, rel: string, createParents: boolean): Promise<{path:string;exists:boolean}> {
  const pieces = rel.split("/");
  let dir = root;
  for (const name of pieces.slice(0,-1)) {
    dir = path.join(dir,name);
    let stat = await lstatOptional(dir);
    if (!stat && createParents) {
      await fs.mkdir(dir,{mode:0o755});
      stat = await fs.lstat(dir);
    }
    if (!stat) continue; // Parents will be made after the complete preflight.
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("Unsafe development preview parent directory.");
  }
  const target = path.join(dir,pieces.at(-1)!);
  const stat = await lstatOptional(target);
  if (stat && (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1))
    throw new Error("Unsafe development preview source target.");
  return {path:target,exists:Boolean(stat)};
}

async function lstatOptional(p: string) {
  try { return await fs.lstat(p); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function replaceAtomically(destination: string, content: string) {
  const parent = path.dirname(destination);
  const temp = path.join(parent,`.zoebuild-source-${randomUUID()}.tmp`);
  let created = false;
  try {
    const file = await fs.open(temp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
    created = true;
    try {
      await file.writeFile(content,"utf8");
      await file.chmod(0o644);
      await file.sync();
    } finally { await file.close(); }
    await fs.rename(temp,destination);
    created = false;
  } finally {
    if (created) await fs.unlink(temp).catch(()=>undefined);
  }
}

async function syncDirectory(directory:string) {
  const handle = await fs.open(directory,constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); }
  finally { await handle.close(); }
}

type WatcherNotification = Readonly<{
  change: SourceChange;
  handle: FileHandle;
  dev: bigint;
  ino: bigint;
}>;

function assertWatcherIdentity(notification: WatcherNotification, state: BigIntStats) {
  const directory = notification.change.content === null;
  if (state.dev !== notification.dev || state.ino !== notification.ino ||
      (directory ? !state.isDirectory() || state.nlink < 1n : !state.isFile() || state.nlink !== 1n))
    throw new Error("Development preview watcher target changed.");
}

async function watcherTarget(root: string, change: SourceChange) {
  const destination = await inspectTarget(root, change.path, false);
  if (destination.exists !== (change.content !== null))
    throw new Error("Development preview watcher target changed.");
  return change.content === null ? path.dirname(destination.path) : destination.path;
}

async function pinWatcherNotification(
  root: string, change: SourceChange, notifications: WatcherNotification[],
) {
  const target = await watcherTarget(root, change);
  const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW |
    (change.content === null ? constants.O_DIRECTORY : 0));
  let retained = false;
  try {
    const state = await handle.stat({bigint:true});
    const notification = {change, handle, dev: state.dev, ino: state.ino};
    assertWatcherIdentity(notification, state);
    assertWatcherIdentity(notification, await fs.lstat(target,{bigint:true}));
    notifications.push(notification);
    retained = true;
  } finally {
    if (!retained) await handle.close();
  }
}

async function checkWatcherNotification(root: string, notification: WatcherNotification) {
  // The sandbox is running. Never reopen this path for a privileged mutation.
  // Check root and parents to detect substitutions, then compare the pathname
  // with the pinned descriptor. Even if this check races, utimes targets the
  // original inode only, not a new symlink or hard-link destination.
  await validateWorkspaceRoot(path.dirname(root), root);
  const target = await watcherTarget(root, notification.change);
  const named = await fs.lstat(target,{bigint:true});
  assertWatcherIdentity(notification, named);
  assertWatcherIdentity(notification, await notification.handle.stat({bigint:true}));
}
