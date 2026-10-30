import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { FileEntry } from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import {
  assertSafeWorkspacePath,
  assertWorkspaceRootHasCapacity,
  normalizeWorkspaceEntries,
  type NormalizedWorkspaceEntry,
} from "./workspacePolicy.js";
import { ensureWorkspaceWritableForShellUser } from "./workspacePermissions.js";

export type WorkspaceSyncEntry =
  | (FileEntry & { kind?: "file" })
  | { kind: "directory"; path: string };

// Rootless-Docker preview note:
// Runtime containers run as a non-root UID, but bind-mounted host workspaces
// are created by the runner service. Use writable workspace permissions for
// per-session sandbox directories, while keeping the container isolated with
// no network, read-only rootfs, cap_drop, pids/mem/cpu limits, and cleanup.
const DIR_MODE = 0o777;
const FILE_MODE = 0o666;
const HISTORY_MODE = 0o666;

async function ensureWorkspaceRoot(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
  await fs.chmod(dir, DIR_MODE).catch(() => {});
}

async function ensureWorkspaceDir(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
  await fs.chmod(dir, DIR_MODE).catch(() => {});
}

async function writeWorkspaceTextFile(abs: string, content: string) {
  await ensureWorkspaceDir(path.dirname(abs));
  await fs.writeFile(abs, content, "utf8");
  await fs.chmod(abs, FILE_MODE).catch(() => {});
}

async function writeWorkspaceBinaryFile(abs: string, bytes: Buffer) {
  await ensureWorkspaceDir(path.dirname(abs));
  await fs.writeFile(abs, bytes);
  await fs.chmod(abs, FILE_MODE).catch(() => {});
}

async function ensureBashHistory(workspaceDir: string) {
  const historyPath = path.join(workspaceDir, ".bash_history");
  const existing = await fs.lstat(historyPath).catch((error: any) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error("Unsafe workspace history entry.");
  }
  const handle = await fs.open(historyPath, "a");
  await handle.close();

  await fs.chmod(historyPath, HISTORY_MODE).catch(() => {});
}

export async function ensureWorkspaceRuntimeFiles(
  workspaceDir: string,
  prepareDirs: string[] = [],
) {
  await ensureWorkspaceDir(workspaceDir);
  await ensureBashHistory(workspaceDir);

  for (const dir of prepareDirs) {
    const safe = assertSafeWorkspacePath(dir);
    let parent = workspaceDir;
    for (const part of safe.split("/")) {
      parent = path.join(parent, part);
      const current = await fs.lstat(parent).catch((error: any) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (current && (!current.isDirectory() || current.isSymbolicLink())) {
        throw new Error(`Unsafe workspace runtime directory: ${safe}`);
      }
    }
    await ensureWorkspaceDir(path.join(workspaceDir, safe));
  }
}

async function writeInitialEntries(
  root: string,
  entries: NormalizedWorkspaceEntry[],
) {
  for (const entry of entries) {
    const abs = path.join(root, entry.path);

    if (entry.kind === "directory") {
      await ensureWorkspaceDir(abs);
      continue;
    }

    if (entry.storage === "binary") {
      await writeWorkspaceBinaryFile(abs, entry.bytes);
    } else {
      await writeWorkspaceTextFile(abs, entry.content);
    }
  }
}

export async function createWorkspace(files: WorkspaceSyncEntry[]) {
  const rootBase = env.workspaceRoot;

  // Observability only: no changes to workspace authorization, file writes,
  // ownership, capacity enforcement, or cleanup. No source names or contents.
  const started = Date.now();
  let checkpoint = started;
  const timings = {
    rootReadyMs: 0,
    quotaMs: 0,
    normalizeMs: 0,
    workspaceDirMs: 0,
    writeEntriesMs: 0,
    runtimeFilesMs: 0,
    permissionsMs: 0,
  };
  let stage = "root-ready";
  await ensureWorkspaceRoot(rootBase);
  timings.rootReadyMs = Date.now() - checkpoint;
  checkpoint = Date.now();
  stage = "quota";
  await assertWorkspaceRootHasCapacity(rootBase);
  timings.quotaMs = Date.now() - checkpoint;
  checkpoint = Date.now();

  stage = "normalize";
  const normalized = normalizeWorkspaceEntries(files ?? [], {
    dropRunnerManaged: true,
  });
  timings.normalizeMs = Date.now() - checkpoint;
  checkpoint = Date.now();

  const root = path.join(rootBase, `zoeskoul-run-${crypto.randomUUID()}`);
  stage = "workspace-directory";
  await ensureWorkspaceDir(root);
  timings.workspaceDirMs = Date.now() - checkpoint;
  checkpoint = Date.now();

  try {
    stage = "write-entries";
    await writeInitialEntries(root, normalized);
    timings.writeEntriesMs = Date.now() - checkpoint;
    checkpoint = Date.now();
    stage = "runtime-files";
    await ensureWorkspaceRuntimeFiles(root);
    timings.runtimeFilesMs = Date.now() - checkpoint;
    checkpoint = Date.now();
    stage = "permissions";
    await ensureWorkspaceWritableForShellUser(root);
    timings.permissionsMs = Date.now() - checkpoint;
    const totalMs = Date.now() - started;
    if (totalMs >= 1000) {
      console.info("RUNNER workspace creation timings", {
        ...timings,
        entries: normalized.length,
        totalMs,
      });
    }
    return root;
  } catch (err) {
    console.warn("RUNNER workspace creation failed", {
      stage,
      elapsedMs: Date.now() - started,
    });
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}
