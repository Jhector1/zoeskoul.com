import fs from "node:fs/promises";
import path from "node:path";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import {
  isRunnerManagedFilePath,
  isWorkspaceSnapshotHiddenDirPath,
} from "./runnerManagedWorkspace.js";
import {
  assertWorkspaceUnderQuota,
  IGNORED_SNAPSHOT_DIRS,
  isAllowedWorkspaceFile,
  isSafeRelativePath,
} from "./workspacePolicy.js";

async function walkEntries(
  root: string,
  dir: string,
  dirs: string[],
  files: string[],
) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");

    if (!isSafeRelativePath(rel)) continue;

    if (entry.isDirectory()) {
      if (
        IGNORED_SNAPSHOT_DIRS.has(entry.name) ||
        isWorkspaceSnapshotHiddenDirPath(rel)
      )
        continue;

      dirs.push(rel);

      if (dirs.length + files.length > env.maxEntries) {
        throw new Error(
          `Workspace limit reached: max ${env.maxEntries} entries.`,
        );
      }

      await walkEntries(root, abs, dirs, files);
      continue;
    }
    if (isRunnerManagedFilePath(rel)) continue;

    if (!entry.isFile()) continue;
    if (!isAllowedWorkspaceFile(rel)) continue;

    files.push(rel);

    if (dirs.length + files.length > env.maxEntries) {
      throw new Error(
        `Workspace limit reached: max ${env.maxEntries} entries.`,
      );
    }
  }
}

export async function snapshotWorkspaceFiles(workspaceDir: string) {
  await assertWorkspaceUnderQuota(workspaceDir);

  const relDirs: string[] = [];
  const relFiles: string[] = [];

  await walkEntries(workspaceDir, workspaceDir, relDirs, relFiles);

  relDirs.sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
  relFiles.sort((a, b) => a.localeCompare(b));

  let totalBytes = 0;
  const entries: WorkspaceSyncEntry[] = [];

  for (const relDir of relDirs) {
    entries.push({
      kind: "directory",
      path: relDir,
    });
  }

  for (const relPath of relFiles) {
    const abs = path.join(workspaceDir, relPath);
    const content = await fs.readFile(abs, "utf8");
    const bytes = Buffer.byteLength(content, "utf8");

    if (bytes > env.maxFileBytes) {
      continue;
    }

    totalBytes += bytes;
    if (totalBytes > env.maxTotalBytes) {
      throw new Error(
        `Workspace limit reached: max ${(env.maxTotalBytes / 1024 / 1024).toFixed(1)} MB total content.`,
      );
    }

    entries.push({
      kind: "file",
      path: relPath,
      content,
    });
  }

  return entries;
}
