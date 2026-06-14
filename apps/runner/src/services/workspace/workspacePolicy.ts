import fs from "node:fs/promises";
import path from "node:path";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import {
  isRunnerManagedDirPath,
  isRunnerManagedFilePath,
} from "./runnerManagedWorkspace.js";

export type NormalizedWorkspaceEntry =
  | { kind: "directory"; path: string }
  | { kind: "file"; path: string; content: string };

const ALLOWED_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".ts",
  ".java",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hh",
  ".hpp",
  ".sh",
  ".txt",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".csv",
  ".sql",
]);

const ALLOWED_BASENAMES = new Set([
  "Makefile",
  "README",
  "README.md",
  "readme.md",
  ".keep",
]);

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
  const base = path.basename(relPath);
  if (ALLOWED_BASENAMES.has(base)) return true;

  const ext = path.extname(base).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

export function normalizeWorkspacePath(input: string) {
  return String(input ?? "")
    .replace(/\\/g, "/")
    .trim();
}

export function isSafeRelativePath(relPath: string) {
  const normalized = normalizeWorkspacePath(relPath);
  if (!normalized) return false;
  if (normalized.startsWith("/")) return false;
  if (normalized.includes("\0")) return false;

  const parts = normalized.split("/");
  return parts.every((part) => !!part && part !== "." && part !== "..");
}

export function assertSafeWorkspacePath(input: string) {
  const normalized = normalizeWorkspacePath(input);
  if (!isSafeRelativePath(normalized)) {
    throw new Error(`Unsafe path: ${String(input ?? "")}`);
  }
  return normalized;
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
  let totalBytes = 0;
  const seenPaths = new Set<string>();

  const normalized = files
    .map((entry) => {
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

      if (!isAllowedWorkspaceFile(relPath)) {
        throw new Error(`Unsupported file type: ${relPath}`);
      }

      const content = String((entry as any)?.content ?? "");
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > env.maxFileBytes) {
        throw new Error(
          `Workspace file too large: ${relPath} exceeds ${(env.maxFileBytes / 1024).toFixed(0)} KB.`,
        );
      }

      totalBytes += bytes;
      if (totalBytes > env.maxTotalBytes) {
        throw new Error(
          `Workspace limit reached: max ${(env.maxTotalBytes / 1024 / 1024).toFixed(1)} MB total content.`,
        );
      }

      return {
        kind: "file" as const,
        path: relPath,
        content,
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
  if (usedBytes > env.maxTotalBytes) {
    throw new Error(
      `Workspace limit reached: max ${(env.maxTotalBytes / 1024 / 1024).toFixed(1)} MB on disk.`,
    );
  }
}
