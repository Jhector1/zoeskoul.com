import crypto from "node:crypto";
import fs from "node:fs/promises";
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
import {
  isRunnerManagedDirPath,
  isRunnerManagedFilePath,
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
        (isRunnerManagedFilePath(relPath) || isRunnerManagedDirPath(relPath))
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

export async function getDirectoryBytes(dir: string): Promise<number> {
  let total = 0;

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const st = await fs.stat(abs).catch(() => null);
      total += st?.size ?? 0;
    }
  }

  await walk(dir);
  return total;
}

export async function assertWorkspaceRootHasCapacity(root: string) {
  await fs.mkdir(root, { recursive: true }).catch(() => {});

  const usedBytes = await getDirectoryBytes(root);
  if (usedBytes > env.maxWorkspaceRootBytes) {
    throw new Error(
      `Runner workspace root is over quota: ${(usedBytes / 1024 / 1024).toFixed(1)} MB used.`,
    );
  }

  const statfs = (fs as any).statfs as
    | ((p: string) => Promise<{ bavail: number; bsize: number }>)
    | undefined;
  if (typeof statfs === "function") {
    const st = await statfs(root);
    const freeBytes = st.bavail * st.bsize;
    if (freeBytes < env.minFreeBytes) {
      throw new Error(
        `Runner host disk is low: ${(freeBytes / 1024 / 1024).toFixed(0)} MB free.`,
      );
    }
  }
}

export async function assertWorkspaceUnderQuota(workspaceDir: string) {
  const usedBytes = await getDirectoryBytes(workspaceDir);
  if (usedBytes > env.maxWorkspaceBytes) {
    throw new Error(
      `Workspace limit reached: max ${(env.maxWorkspaceBytes / 1024 / 1024).toFixed(1)} MB on disk.`,
    );
  }
}
