import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import {
  isWorkspacePreservedPath,
  RUNNER_MANAGED_DIRS,
} from "./runnerManagedWorkspace.js";
import {
  assertRunnerFilesystemHasCapacity,
  isSafeRelativePath,
  normalizeWorkspaceEntries,
} from "./workspacePolicy.js";
import { ensureWorkspaceWritableForShellUser } from "./workspacePermissions.js";
import type { NormalizedWorkspaceEntry } from "./workspacePolicy.js";

type CurrentEntry = {
  kind: "file" | "directory";
  path: string;
};

function parentDirsOf(relPath: string) {
  const parts = relPath.split("/").filter(Boolean);
  const out: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join("/"));
  }

  return out;
}

async function walkCurrentEntries(
  root: string,
  dir: string,
  out: CurrentEntry[],
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");

    if (!isSafeRelativePath(rel)) continue;
    if (entry.isDirectory()) {
      out.push({ kind: "directory", path: rel });
      await walkCurrentEntries(root, abs, out);
      continue;
    }

    if (entry.isFile()) {
      out.push({ kind: "file", path: rel });
    }
  }
}


/** Conflict means a terminal/editor changed the same path after the supplied
 * baseline. Return 409 instead of silently destroying either edit. */
export class WorkspaceSyncConflictError extends Error {
  constructor(relPath: string) {
    super(`Workspace changed since last synchronization: ${relPath}. Refresh and resolve the conflict before saving.`);
    this.name = "WorkspaceSyncConflictError";
  }
}

function asBytes(file: { storage: "text"; content: string } | { storage: "binary"; bytes: Buffer }) {
  return file.storage === "text" ? Buffer.from(file.content, "utf8") : file.bytes;
}

function matchingEntry(left: NormalizedWorkspaceEntry | undefined, right: NormalizedWorkspaceEntry | undefined) {
  if (!left || !right) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === "directory" && right.kind === "directory") return true;
  if (left.kind !== "file" || right.kind !== "file") return false;
  return asBytes(left).equals(asBytes(right));
}

async function statOrNull(abs: string) {
  try { return await fs.lstat(abs); }
  catch (e: any) { if (e?.code === "ENOENT") return null; throw e; }
}

/** Refuse symlink parents (including pre-existing directory symlinks). */
async function assertSafeParents(root: string, relPath: string) {
  let at = root;
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Unsafe workspace root.");
  for (const segment of relPath.split("/").slice(0, -1)) {
    at = path.join(at, segment);
    const st = await statOrNull(at);
    if (st && (!st.isDirectory() || st.isSymbolicLink())) {
      throw new Error(`Unsafe workspace path: ${relPath}`);
    }
  }
}

/** Never truncate an inode owned by the learner from the host-side runner.
 * A temporary file + rename can replace a 0644/0755 file without opening it
 * for writing. The V4 ownership helper restores the learner UID after sync.
 * Directory write permissions must still permit the rename; failures remain
 * explicit rather than escalating host privileges.
 */
async function atomicWrite(abs: string, data: Buffer, mode: number) {
  const temporary = path.join(path.dirname(abs), `.${path.basename(abs)}.zoe-sync-${crypto.randomUUID()}`);
  try {
    await fs.writeFile(temporary, data, { flag: "wx", mode });
    await fs.chmod(temporary, mode);
    await fs.rename(temporary, abs);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function readDiskFile(abs: string): Promise<Buffer | null> {
  const st = await statOrNull(abs);
  if (!st) return null;
  if (!st.isFile() || st.isSymbolicLink()) throw new Error(`Unsafe or incompatible workspace entry: ${abs}`);
  return await fs.readFile(abs);
}

/** Change-aware three-way merge. Only paths changed from the browser's prior
 * baseline may be mutated. Unrelated terminal-created files are left alone.
 * All conflicts and target-parent safety checks happen before the first edit.
 */
async function replaceFromBaseline(
  root: string,
  desired: NormalizedWorkspaceEntry[],
  baseline: NormalizedWorkspaceEntry[],
) {
  const next = new Map(desired.map((e) => [e.path, e]));
  const previous = new Map(baseline.map((e) => [e.path, e]));
  const changed = new Set([...next.keys(), ...previous.keys()]);
  const creations: string[] = [];
  const writes: Array<{ rel: string; data: Buffer; mode: number }> = [];
  const deletions: string[] = [];
  const dirDeletes: string[] = [];

  for (const rel of [...changed].sort()) {
    const want = next.get(rel);
    const was = previous.get(rel);
    if (matchingEntry(want, was)) continue;
    await assertSafeParents(root, rel);
    const abs = path.join(root, rel);
    const st = await statOrNull(abs);
    if (st?.isSymbolicLink()) throw new Error(`Unsafe workspace symlink: ${rel}`);

    if (want?.kind === "directory") {
      if (st && !st.isDirectory()) throw new WorkspaceSyncConflictError(rel);
      if (!st) creations.push(rel);
      continue;
    }
    if (was?.kind === "directory" && !want) {
      if (st && !st.isDirectory()) throw new WorkspaceSyncConflictError(rel);
      if (st) dirDeletes.push(rel);
      continue;
    }
    if (was?.kind === "directory" || (want && want.kind !== "file") || (was && was.kind !== "file")) {
      throw new WorkspaceSyncConflictError(rel);
    }
    if (st && !st.isFile()) throw new WorkspaceSyncConflictError(rel);
    const disk = await readDiskFile(abs);
    const before = was?.kind === "file" ? asBytes(was) : null;
    const after = want?.kind === "file" ? asBytes(want) : null;
    // Retried replace after a successful write is idempotent.
    if ((disk === null && after === null) || (disk && after && disk.equals(after))) continue;
    if (before === null ? disk !== null : disk === null || !disk.equals(before)) {
      throw new WorkspaceSyncConflictError(rel);
    }
    if (after) writes.push({ rel, data: after, mode: st ? (st.mode & 0o777) : 0o666 });
    else if (disk) deletions.push(rel);
  }

  // Pre-stage changed files before committing any replacement. This avoids
  // mid-write truncation and catches ordinary staging failures early. The PTY
  // writes outside this lock: a concurrent terminal edit can still conflict.
  const staged: Array<{ from: string; to: string }> = [];
  try {
    for (const rel of creations.sort((a, b) => a.split('/').length - b.split('/').length)) {
      await fs.mkdir(path.join(root, rel), { recursive: true, mode: 0o777 });
    }
    for (const { rel, data, mode } of writes) {
      const abs = path.join(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true, mode: 0o777 });
      await assertSafeParents(root, rel);
      const temporary = path.join(path.dirname(abs), `.${path.basename(abs)}.zoe-sync-${crypto.randomUUID()}`);
      await fs.writeFile(temporary, data, { flag: "wx", mode });
      await fs.chmod(temporary, mode);
      staged.push({ from: temporary, to: abs });
    }
    // A fresh conflict check immediately before committing staged changes.
    for (const { rel } of writes) {
      await assertSafeParents(root, rel);
      const disk = await readDiskFile(path.join(root, rel));
      const was = previous.get(rel);
      const before = was?.kind === "file" ? asBytes(was) : null;
      const after = next.get(rel);
      const afterBytes = after?.kind === "file" ? asBytes(after) : null;
      if (!(disk === null && before === null) &&
          !(disk && before && disk.equals(before)) &&
          !(disk && afterBytes && disk.equals(afterBytes))) {
        throw new WorkspaceSyncConflictError(rel);
      }
    }
    for (const item of staged) await fs.rename(item.from, item.to);
    for (const rel of deletions) await fs.rm(path.join(root, rel), { force: true });
    for (const rel of dirDeletes.sort((a, b) => b.split('/').length - a.split('/').length)) {
      // Remove only empty directories. Never erase terminal-created content.
      await fs.rmdir(path.join(root, rel)).catch((error: any) => {
        if (error?.code !== "ENOTEMPTY" && error?.code !== "ENOENT") throw error;
      });
    }
  } finally {
    for (const item of staged) await fs.rm(item.from, { force: true }).catch(() => {});
  }
}

export async function replaceWorkspaceFiles(
  workspaceDir: string,
  files: WorkspaceSyncEntry[],
  options: { baselineFiles?: WorkspaceSyncEntry[] } = {},
) {
  await assertRunnerFilesystemHasCapacity(workspaceDir);

  const normalized = normalizeWorkspaceEntries(files, {
    dropRunnerManaged: true,
  });

  await fs.mkdir(workspaceDir, { recursive: true, mode: 0o777 });
  await fs.chmod(workspaceDir, 0o777).catch(() => {});
  await ensureWorkspaceWritableForShellUser(workspaceDir);

  if (options.baselineFiles) {
    const baseline = normalizeWorkspaceEntries(options.baselineFiles, { dropRunnerManaged: true });
    await replaceFromBaseline(workspaceDir, normalized, baseline);
    await ensureWorkspaceWritableForShellUser(workspaceDir);
    return { fileCount: normalized.filter((entry) => entry.kind === "file").length };
  }

  const currentEntries: CurrentEntry[] = [];
  await walkCurrentEntries(workspaceDir, workspaceDir, currentEntries);

  const currentFiles = new Set(
    currentEntries.filter((e) => e.kind === "file").map((e) => e.path),
  );
  const currentDirs = new Set(
    currentEntries.filter((e) => e.kind === "directory").map((e) => e.path),
  );

  const desiredFiles = new Map<
    string,
    | { storage: "text"; content: string }
    | { storage: "binary"; bytes: Buffer }
  >();
  const desiredDirs = new Set<string>();

  for (const entry of normalized) {
    if (entry.kind === "directory") {
      desiredDirs.add(entry.path);
      for (const parent of parentDirsOf(entry.path)) desiredDirs.add(parent);
      continue;
    }

    desiredFiles.set(
      entry.path,
      entry.storage === "binary"
        ? { storage: "binary", bytes: entry.bytes }
        : { storage: "text", content: entry.content },
    );
    for (const parent of parentDirsOf(entry.path)) desiredDirs.add(parent);
  }

  // 1) Make directories exist first. If a file is in the way, remove it.
  const dirPaths = [...desiredDirs].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });

  for (const relPath of dirPaths) {
    await assertSafeParents(workspaceDir, relPath);
    const abs = path.join(workspaceDir, relPath);

    if (currentFiles.has(relPath)) {
      await fs.rm(abs, { force: true });
      currentFiles.delete(relPath);
    }

    await fs.mkdir(abs, { recursive: true, mode: 0o777 });
    await fs.chmod(abs, 0o777).catch(() => {});
    currentDirs.add(relPath);
  }

  // 2) Write/update desired files. If a directory is in the way, remove it first.
  for (const [relPath, file] of desiredFiles) {
    const abs = path.join(workspaceDir, relPath);

    if (currentDirs.has(relPath)) {
      await fs.rm(abs, { recursive: true, force: true });
      currentDirs.delete(relPath);
    }

    await assertSafeParents(workspaceDir, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    // Preserve the execute bit on files that the learner already chmod'd.
    // A workspace/editor resync must not silently turn a runnable script into
    // a non-executable file. New files retain the existing default 0666 mode.
    const existingMode = currentFiles.has(relPath)
      ? (await fs.stat(abs)).mode & 0o777
      : null;
    const data = asBytes(file);
    const current = await readDiskFile(abs);
    if (!current || !current.equals(data)) {
      await atomicWrite(abs, data, existingMode ?? 0o666);
    }
    currentFiles.add(relPath);
  }

  // 3) Delete files no longer desired.
  for (const relPath of [...currentFiles]) {
    if (desiredFiles.has(relPath)) continue;

    // Keep terminal/runtime metadata even when the editor replaces the workspace.
    if (isWorkspacePreservedPath(relPath)) continue;

    const abs = path.join(workspaceDir, relPath);
    await fs.rm(abs, { force: true });
    currentFiles.delete(relPath);
  }

  // 4) Delete directories no longer desired, deepest-first.
  const keepDirs = new Set<string>(desiredDirs);

  const dirsToDelete = [...currentDirs]
    .filter((relPath) => !keepDirs.has(relPath))
    .filter((relPath) => !isWorkspacePreservedPath(relPath))
    .sort((a, b) => {
      const da = a.split("/").length;
      const db = b.split("/").length;
      if (da !== db) return db - da;
      return b.localeCompare(a);
    });

  for (const relPath of dirsToDelete) {
    const abs = path.join(workspaceDir, relPath);
    await fs.rm(abs, { recursive: true, force: true });
  }

  const historyPath = path.join(workspaceDir, ".bash_history");
  if ((await statOrNull(historyPath))?.isSymbolicLink()) {
    throw new Error("Unsafe workspace history symlink.");
  }
  const handle = await fs.open(historyPath, "a");
  await handle.close();
  await fs.chmod(historyPath, 0o666).catch(() => {});

  for (const dir of RUNNER_MANAGED_DIRS) {
    const abs = path.join(workspaceDir, dir);
    if ((await statOrNull(abs))?.isSymbolicLink()) {
      throw new Error(`Unsafe runner-managed directory: ${dir}`);
    }
    await fs.mkdir(abs, { recursive: true, mode: 0o777 });
    await fs.chmod(abs, 0o777).catch(() => {});
  }

  await ensureWorkspaceWritableForShellUser(workspaceDir);

  return {
    fileCount: normalized.filter((entry) => entry.kind === "file").length,
  };
}
