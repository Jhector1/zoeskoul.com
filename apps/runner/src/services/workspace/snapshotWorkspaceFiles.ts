import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";
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

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

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

    if (files.length > env.maxFiles) {
      throw new Error(`Workspace limit reached: max ${env.maxFiles} files.`);
    }

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

  let textBytes = 0;
  let binaryBytes = 0;
  const entries: WorkspaceSyncEntry[] = [];

  for (const relDir of relDirs) {
    entries.push({
      kind: "directory",
      path: relDir,
    });
  }

  for (const relPath of relFiles) {
    const abs = path.join(workspaceDir, relPath);
    const capability = resolveWorkspaceFileCapability(relPath);
    if (!capability) continue;

    const raw = await fs.readFile(abs);

    if (capability.storage === "binary") {
      if (raw.byteLength > env.maxBinaryFileBytes) {
        throw new Error(
          `Workspace binary file too large: ${relPath} exceeds ${(env.maxBinaryFileBytes / 1024 / 1024).toFixed(1)} MB.`,
        );
      }

      binaryBytes += raw.byteLength;
      if (binaryBytes > env.maxBinaryTotalBytes) {
        throw new Error(
          `Workspace binary limit reached: max ${(env.maxBinaryTotalBytes / 1024 / 1024).toFixed(1)} MB.`,
        );
      }

      entries.push({
        kind: "file",
        path: relPath,
        encoding: "base64",
        data: raw.toString("base64"),
        mimeType: capability.mimeType,
        sizeBytes: raw.byteLength,
        checksum: `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`,
      });
      continue;
    }

    let content: string;
    try {
      content = UTF8_DECODER.decode(raw);
    } catch {
      throw new Error(
        `Workspace text file is not valid UTF-8: ${relPath}. Rename it to a supported binary type or restore valid text.`,
      );
    }
    const bytes = raw.byteLength;

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

    entries.push({
      kind: "file",
      path: relPath,
      content,
    });
  }

  return entries;
}
