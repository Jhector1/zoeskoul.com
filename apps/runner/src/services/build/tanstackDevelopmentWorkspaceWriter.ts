import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
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
  let failure: unknown;
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
  } catch (error) {
    failure = error;
  }
  try {
    await container.unpause();
  } catch {
    // This may leave the sandbox paused; the Phase 3A caller must quarantine
    // and attempt Docker teardown rather than exposing an inconsistent lease.
    throw new Error("Development preview sandbox resume failed.");
  }
  if (failure) throw new Error("Development preview workspace update failed.");
}

const ALLOWED_SOURCE = /^src\/(?:routes|components|hooks|styles|lib)\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:tsx?|jsx?|css|scss)$/;
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
    if (!safePath(candidate) || !ALLOWED_SOURCE.test(candidate) ||
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
  if (stat && (stat.isSymbolicLink() || !stat.isFile()))
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
