import crypto from "node:crypto";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import {
  assertWorkspaceRelativePath,
  isSafeWorkspaceRelativePath,
  normalizeWorkspaceBase64,
  normalizeWorkspaceRelativePath,
  resolveWorkspaceFileCapability,
  workspaceBase64DecodedByteLength,
} from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import { getWorkerDirectoryUsage } from "./workspaceUsageWorker.js";
import {
  isRunnerManagedDirPath,
  isRunnerManagedFilePath,
  isWorkspaceProtectedTrashPath,
} from "./runnerManagedWorkspace.js";

export type NormalizedWorkspaceEntry =
  | { kind: "directory"; path: string }
  | {
      kind: "file";
      storage: "text";
      path: string;
      content: string;
      mimeType: string;
    }
  | {
      kind: "file";
      storage: "binary";
      path: string;
      bytes: Buffer;
      mimeType: string;
      checksum?: string;
    };

export const IGNORED_SNAPSHOT_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "target",
  "__pycache__",
]);

export function isAllowedWorkspaceFile(relPath: string) {
  return resolveWorkspaceFileCapability(relPath) !== null;
}

export function normalizeWorkspacePath(input: string) {
  return normalizeWorkspaceRelativePath(input);
}

export function isSafeRelativePath(relPath: string) {
  return isSafeWorkspaceRelativePath(relPath);
}

export function assertSafeWorkspacePath(input: string) {
  return assertWorkspaceRelativePath(input);
}

function entryKind(entry: WorkspaceSyncEntry) {
  return entry.kind === "directory" ? "directory" : "file";
}

export function sortWorkspaceEntries<T extends { path: string; kind?: string }>(
  entries: T[],
) {
  return [...entries].sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;

    const ak = a.kind === "directory" ? "directory" : "file";
    const bk = b.kind === "directory" ? "directory" : "file";
    if (ak === bk) return 0;
    return ak === "directory" ? -1 : 1;
  });
}

function decodeBase64Strict(value: unknown, relPath: string) {
  const source = normalizeWorkspaceBase64(value);
  const expectedBytes = workspaceBase64DecodedByteLength(value);
  if (source == null || expectedBytes == null) {
    throw new Error(`Invalid base64 content: ${relPath}`);
  }

  const bytes = Buffer.from(source, "base64");
  if (
    bytes.byteLength !== expectedBytes ||
    bytes.toString("base64") !== source
  ) {
    throw new Error(`Invalid base64 content: ${relPath}`);
  }

  return bytes;
}

export function normalizeWorkspaceEntries(
  files: WorkspaceSyncEntry[],
  args: { dropRunnerManaged?: boolean } = {},
): NormalizedWorkspaceEntry[] {
  if (!Array.isArray(files)) {
    throw new Error("files must be an array.");
  }

  if (files.length > env.maxEntries) {
    throw new Error(`Workspace limit reached: max ${env.maxEntries} entries.`);
  }

  let fileCount = 0;
  let textBytes = 0;
  let binaryBytes = 0;
  const seenPaths = new Set<string>();

  const normalized = files
    .map<NormalizedWorkspaceEntry | null>((entry): NormalizedWorkspaceEntry | null => {
      const relPath = assertSafeWorkspacePath(entry?.path ?? "");

      if (
        args.dropRunnerManaged &&
        (isRunnerManagedFilePath(relPath) || isRunnerManagedDirPath(relPath) || isWorkspaceProtectedTrashPath(relPath))
      ) {
        return null;
      }

      if (seenPaths.has(relPath)) {
        throw new Error(`Duplicate path: ${relPath}`);
      }
      seenPaths.add(relPath);

      if (entryKind(entry) === "directory") {
        return {
          kind: "directory" as const,
          path: relPath,
        };
      }

      fileCount += 1;
      if (fileCount > env.maxFiles) {
        throw new Error(`Workspace limit reached: max ${env.maxFiles} files.`);
      }

      const capability = resolveWorkspaceFileCapability(relPath);
      if (!capability) {
        throw new Error(`Unsupported file type: ${relPath}`);
      }

      if (capability.storage === "binary") {
        if ((entry as any)?.encoding !== "base64") {
          throw new Error(
            `Binary workspace file must use base64 encoding: ${relPath}`,
          );
        }

        const bytes = decodeBase64Strict((entry as any)?.data, relPath);
        if (bytes.byteLength > env.maxBinaryFileBytes) {
          throw new Error(
            `Workspace binary file too large: ${relPath} exceeds ${(env.maxBinaryFileBytes / 1024 / 1024).toFixed(1)} MB.`,
          );
        }

        const declaredSize = (entry as any)?.sizeBytes;
        if (
          typeof declaredSize !== "number" ||
          !Number.isInteger(declaredSize) ||
          declaredSize < 0 ||
          declaredSize !== bytes.byteLength
        ) {
          throw new Error(`Binary size mismatch: ${relPath}`);
        }

        const declaredChecksum = (entry as any)?.checksum;
        if (typeof declaredChecksum === "string" && declaredChecksum.trim()) {
          const normalizedChecksum = declaredChecksum.trim().toLowerCase();
          if (!/^sha256:[a-f0-9]{64}$/.test(normalizedChecksum)) {
            throw new Error(`Invalid binary checksum: ${relPath}`);
          }
          const actualChecksum = `sha256:${crypto
            .createHash("sha256")
            .update(bytes)
            .digest("hex")}`;
          if (actualChecksum !== normalizedChecksum) {
            throw new Error(`Binary checksum mismatch: ${relPath}`);
          }
        }

        binaryBytes += bytes.byteLength;
        if (binaryBytes > env.maxBinaryTotalBytes) {
          throw new Error(
            `Workspace binary limit reached: max ${(env.maxBinaryTotalBytes / 1024 / 1024).toFixed(1)} MB.`,
          );
        }

        return {
          kind: "file" as const,
          storage: "binary" as const,
          path: relPath,
          bytes,
          mimeType: capability.mimeType,
          ...(typeof (entry as any)?.checksum === "string" &&
          (entry as any).checksum.trim()
            ? { checksum: (entry as any).checksum.trim() }
            : {}),
        };
      }

      if ((entry as any)?.encoding === "base64") {
        throw new Error(`Text workspace file cannot use base64 encoding: ${relPath}`);
      }

      const content = String((entry as any)?.content ?? "");
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > env.maxFileBytes) {
        throw new Error(
          `Workspace file too large: ${relPath} exceeds ${(env.maxFileBytes / 1024).toFixed(0)} KB.`,
        );
      }

      textBytes += bytes;
      if (textBytes > env.maxTotalBytes) {
        throw new Error(
          `Workspace text limit reached: max ${(env.maxTotalBytes / 1024 / 1024).toFixed(1)} MB.`,
        );
      }

      return {
        kind: "file" as const,
        storage: "text" as const,
        path: relPath,
        content,
        mimeType: capability.mimeType,
      };
    })
    .filter((entry): entry is NormalizedWorkspaceEntry => entry !== null);

  return sortWorkspaceEntries(normalized);
}

export type WorkspaceUsage = {
  bytes: number;
  entries: number;
};

async function getLegacyDirectoryUsage(
  dir: string,
  limits?: { maxBytes?: number; maxEntries?: number },
): Promise<WorkspaceUsage> {
  let bytes = 0;
  let entries = 0;
  let overLimit = false;

  async function walk(current: string): Promise<void> {
    if (overLimit) return;

    let dirEntries;
    try {
      dirEntries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      if (overLimit) return;

      const abs = path.join(current, entry.name);
      entries += 1;

      if (limits?.maxEntries != null && entries > limits.maxEntries) {
        overLimit = true;
        return;
      }

      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      const st = await fs.stat(abs).catch(() => null);
      bytes += st?.size ?? 0;

      if (limits?.maxBytes != null && bytes > limits.maxBytes) {
        overLimit = true;
        return;
      }
    }
  }

  await walk(dir);
  return { bytes, entries };
}

/** Dedicated shared-group executor accounting. No path lists or whole-tree
 * closures are retained. On Linux, each directory is opened no-follow and
 * descendants are resolved through its held descriptor, not a mutable ancestor.
 * Count hardlinks per name, consistent with the existing quota definition.
 * This is a bounded observation, not a filesystem snapshot or an OS quota. */
export async function getStrictDirectoryUsage(
  dir: string,
  limits?: { maxBytes?: number; maxEntries?: number },
): Promise<WorkspaceUsage> {
  let bytes = 0;
  let entries = 0;
  const exceeded = () => (limits?.maxEntries !== undefined && entries > limits.maxEntries) ||
    (limits?.maxBytes !== undefined && bytes > limits.maxBytes);
  const same = (a: {dev:number;ino:number}, b: {dev:number;ino:number}) =>
    a.dev === b.dev && a.ino === b.ino;
  const linux = process.platform === "linux";
  async function walk(current: string, depth: number): Promise<void> {
    if (exceeded()) return;
    if (depth >= 128) throw new Error("Runner workspace accounting depth exceeded.");
    const original = await fs.lstat(current);
    if (!original.isDirectory() || original.isSymbolicLink())
      throw new Error("Unsafe workspace accounting directory.");
    const handle = await fs.open(current, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!same(original, opened)) throw new Error("Workspace accounting directory changed.");
      const anchored = linux ? `/proc/self/fd/${handle.fd}` : current;
      const listing = await fs.opendir(anchored, {bufferSize: 64});
      try {
        while (!exceeded()) {
          const batch: string[] = [];
          for (let i=0; i<16 && !exceeded(); i++) {
            const child = await listing.read();
            if (!child) break;
            entries++;
            batch.push(path.join(anchored,child.name));
          }
          if (!batch.length || exceeded()) break;
          // All launched metadata work settles before closing the parent fd.
          const stats = await Promise.allSettled(batch.map(target=>fs.lstat(target)));
          for (let i=0;i<stats.length&&!exceeded();i++) {
            const result = stats[i];
            if (result.status === "rejected") throw result.reason;
            const stat = result.value;
            if (stat.isDirectory()) await walk(batch[i],depth+1);
            else if (stat.isFile()) bytes += stat.size;
          }
        }
      } finally { await listing.close(); }
      const end = await fs.lstat(current);
      if (!same(opened,end) || !end.isDirectory() || end.isSymbolicLink())
        throw new Error("Workspace accounting directory changed.");
    } finally { await handle.close(); }
  }
  try { await walk(path.resolve(dir),0); }
  catch { throw new Error("Runner workspace accounting incomplete."); }
  return {bytes,entries};
}

export async function getDirectoryUsage(
  dir: string,
  limits?: { maxBytes?: number; maxEntries?: number },
): Promise<WorkspaceUsage> {
  // Preserve the existing Learning/legacy filesystem contract. The dedicated
  // shared-group policy is explicitly opt-in and not enabled in Learning.
  return env.workspaceFilesystemPolicy === "shared-group-v1"
    ? (process.platform === "linux" ? getWorkerDirectoryUsage(dir,limits) : getStrictDirectoryUsage(dir,limits))
    : getLegacyDirectoryUsage(dir,limits);
}

export async function getDirectoryBytes(dir: string): Promise<number> {
  return (await getDirectoryUsage(dir)).bytes;
}

export type RunnerFilesystemCapacity = {
  freeBytes: number;
  totalBytes: number;
  minFreeBytes: number;
  minFreePercent: number;
  requiredFreeBytes: number;
  freePercent: number;
};

export async function getRunnerFilesystemCapacity(
  root: string,
): Promise<RunnerFilesystemCapacity | null> {
  await fs.mkdir(root, { recursive: true }).catch(() => {});

  const statfs = (fs as any).statfs as
    | ((p: string) => Promise<{
        bavail: number;
        blocks: number;
        bsize: number;
      }>)
    | undefined;

  if (typeof statfs !== "function") return null;

  const st = await statfs(root);
  const freeBytes = st.bavail * st.bsize;
  const totalBytes = st.blocks * st.bsize;
  const percentFloorBytes = Math.ceil(
    totalBytes * (env.minFreePercent / 100),
  );
  const requiredFreeBytes = Math.max(env.minFreeBytes, percentFloorBytes);

  return {
    freeBytes,
    totalBytes,
    minFreeBytes: env.minFreeBytes,
    minFreePercent: env.minFreePercent,
    requiredFreeBytes,
    freePercent: totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0,
  };
}

export async function assertRunnerFilesystemHasCapacity(root: string) {
  const capacity = await getRunnerFilesystemCapacity(root);
  if (!capacity) return;

  if (capacity.freeBytes < capacity.requiredFreeBytes) {
    throw new Error(
      `Runner host disk is low: ${(capacity.freeBytes / 1024 / 1024).toFixed(0)} MB free; ` +
        `requires at least ${(capacity.requiredFreeBytes / 1024 / 1024).toFixed(0)} MB (${env.minFreePercent}% floor).`,
    );
  }
}

type CapacityState = {tail:Promise<void>; reservedBytes:number; users:number};
const capacityStates = new Map<string,CapacityState>();

/** Process-local ledger. Count queued, executing AND held reservations,
 * including zero-byte callers. No asynchronous eviction of a live state. */
export async function reserveWorkspaceRootCapacity(
  root:string, additionalBytes:number,
):Promise<()=>void> {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes<0 ||
      additionalBytes>env.maxWorkspaceRootBytes)
    throw new Error("Invalid Runner workspace capacity reservation.");
  const key=path.resolve(root);
  let state=capacityStates.get(key);
  if (!state) {
    state={tail:Promise.resolve(),reservedBytes:0,users:0};
    capacityStates.set(key,state);
  }
  const held=state;
  held.users++;
  const done=()=>{
    held.users--;
    if (held.users===0 && held.reservedBytes===0 && capacityStates.get(key)===held)
      capacityStates.delete(key);
  };
  const prior=held.tail;
  let unlock!:()=>void;
  held.tail=new Promise<void>(resolve=>{unlock=resolve;});
  await prior;
  try {
    await fs.mkdir(key,{recursive:true});
    const requested=held.reservedBytes+additionalBytes;
    const remaining=env.maxWorkspaceRootBytes-requested;
    if (remaining<0) throw new Error("Runner workspace root cannot reserve additional storage.");
    const usage=await getDirectoryUsage(key,{maxBytes:remaining});
    if (usage.bytes>remaining)
      throw new Error("Runner workspace root cannot reserve additional storage.");
    const capacity=await getRunnerFilesystemCapacity(key);
    if (capacity&&capacity.freeBytes-requested<capacity.requiredFreeBytes)
      throw new Error("Runner host disk cannot reserve additional storage.");
    held.reservedBytes+=additionalBytes;
  } catch(error) { done(); throw error; }
  finally { unlock(); }
  let released=false;
  return ()=>{
    if (released) return;
    released=true;
    held.reservedBytes-=additionalBytes;
    done();
  };
}

/** Reserve capacity for a trusted, bounded copy before it is created.
 * The workspace-root scan already includes dependency layers, live workspaces,
 * and private pnpm stores, so this is one joint accounting boundary rather
 * than an independent cache quota. */
export async function assertWorkspaceRootCanGrowBy(
  root: string,
  additionalBytes: number,
) {
  if (env.workspaceFilesystemPolicy === "shared-group-v1") {
    const release=await reserveWorkspaceRootCapacity(root,additionalBytes);
    release(); return;
  }
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0 ||
      additionalBytes > env.maxWorkspaceRootBytes) {
    throw new Error("Invalid Runner workspace capacity reservation.");
  }
  await fs.mkdir(root, { recursive: true }).catch(() => {});
  const remaining = env.maxWorkspaceRootBytes - additionalBytes;
  const usage = await getDirectoryUsage(root, { maxBytes: remaining });
  if (usage.bytes > remaining) {
    throw new Error("Runner workspace root cannot reserve additional storage.");
  }
  const capacity = await getRunnerFilesystemCapacity(root);
  if (capacity && capacity.freeBytes - additionalBytes < capacity.requiredFreeBytes) {
    throw new Error("Runner host disk cannot reserve additional storage.");
  }
}

export async function assertWorkspaceRootHasCapacity(root: string) {
  if (env.workspaceFilesystemPolicy === "shared-group-v1") {
    const release=await reserveWorkspaceRootCapacity(root,0);
    release(); return;
  }
  await fs.mkdir(root, { recursive: true }).catch(() => {});

  const usage = await getDirectoryUsage(root, {
    maxBytes: env.maxWorkspaceRootBytes,
  });
  if (usage.bytes > env.maxWorkspaceRootBytes) {
    throw new Error(
      `Runner workspace root is over quota: ${(usage.bytes / 1024 / 1024).toFixed(1)} MB used.`,
    );
  }

  await assertRunnerFilesystemHasCapacity(root);
}

export async function assertWorkspaceUnderQuota(workspaceDir: string) {
  const usage = await getDirectoryUsage(workspaceDir, {
    maxBytes: env.maxWorkspaceBytes,
    maxEntries: env.maxRuntimeEntries,
  });

  if (usage.bytes > env.maxWorkspaceBytes) {
    throw new Error(
      `Workspace limit reached: max ${(env.maxWorkspaceBytes / 1024 / 1024).toFixed(1)} MB on disk.`,
    );
  }

  if (usage.entries > env.maxRuntimeEntries) {
    throw new Error(
      `Workspace entry limit reached: max ${env.maxRuntimeEntries} entries on disk.`,
    );
  }
}
