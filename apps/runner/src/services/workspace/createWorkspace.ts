import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { FileEntry } from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import {
  assertSafeWorkspacePath,
  normalizeWorkspaceEntries,
  reserveWorkspaceRootCapacity,
  assertWorkspaceRootHasCapacity,
  type NormalizedWorkspaceEntry,
} from "./workspacePolicy.js";
import { ensureWorkspaceWritableForShellUser } from "./workspacePermissions.js";
import { ensureManagedWorkspaceDirectory, workspaceFileMode } from "./workspaceFilesystemPolicy.js";

export type WorkspaceSyncEntry =
  | (FileEntry & { kind?: "file" })
  | { kind: "directory"; path: string };

// The dedicated ZoeBuild group policy is opt-in; older pools retain their
// accepted behavior until the new rootless identity canary is complete.
const ensureWorkspaceRoot = ensureManagedWorkspaceDirectory;
const ensureWorkspaceDir = ensureManagedWorkspaceDirectory;

async function writeWorkspaceTextFile(abs: string, content: string) {
  await ensureWorkspaceDir(path.dirname(abs));
  await fs.writeFile(abs, content, "utf8");
  await fs.chmod(abs, workspaceFileMode()).catch(() => {});
}

async function writeWorkspaceBinaryFile(abs: string, bytes: Buffer) {
  await ensureWorkspaceDir(path.dirname(abs));
  await fs.writeFile(abs, bytes);
  await fs.chmod(abs, workspaceFileMode()).catch(() => {});
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

  await fs.chmod(historyPath, workspaceFileMode()).catch(() => {});
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

export async function createWorkspace(
  files: WorkspaceSyncEntry[],
  options: Readonly<{ onWorkspaceAllocated?: (workspaceDir: string) => Promise<void> }> = {},
) {
  const rootBase = env.workspaceRoot;

  // Bounded stage diagnostics; never log source names or contents.
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
  type Stage="root-preparation"|"entry-normalization"|"quota-verification"|
    "journal-allocation"|"directory-creation"|"write-entries"|"runtime-files"|"permissions";
  let stage:Stage="root-preparation";
  let root:string|null=null;
  let allocated=false;
  let releaseCapacity:(()=>void)|null=null;
  try {
    await ensureWorkspaceRoot(rootBase);
    timings.rootReadyMs=Date.now()-checkpoint;checkpoint=Date.now();
    stage="entry-normalization";
    const normalized=normalizeWorkspaceEntries(files??[],{dropRunnerManaged:true});
    timings.normalizeMs=Date.now()-checkpoint;checkpoint=Date.now();
    // Reserve only normalized source bytes. The root is still reconciled in
    // full; the reservation remains held through writes and cleanup.
    const incomingBytes=normalized.reduce((total,entry)=>total+
      (entry.kind==="file" ? entry.storage==="binary" ? entry.bytes.byteLength :
        Buffer.byteLength(entry.content,"utf8") : 0),0);
    stage="quota-verification";
    if (env.workspaceFilesystemPolicy === "shared-group-v1")
      releaseCapacity=await reserveWorkspaceRootCapacity(rootBase,incomingBytes);
    else await assertWorkspaceRootHasCapacity(rootBase);
    timings.quotaMs=Date.now()-checkpoint;checkpoint=Date.now();
    root=path.join(rootBase,`zoeskoul-run-${crypto.randomUUID()}`);
    // Optional trusted lifecycle hook: durable owner records the future path
    // before the first mkdir, closing the crash/rollback identification gap.
    stage="journal-allocation";
    await options.onWorkspaceAllocated?.(root);
    stage="directory-creation";
    await ensureWorkspaceDir(root);
    allocated=true;
    timings.workspaceDirMs=Date.now()-checkpoint;checkpoint=Date.now();
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
    if(root && allocated)await fs.rm(root,{recursive:true,force:true}).catch(()=>{});
    throw err;
  } finally {releaseCapacity?.();}
}
