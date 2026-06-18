import fs from "node:fs/promises";
import path from "node:path";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import {
  isRunnerManagedDirPath,
  isRunnerManagedFilePath,
  RUNNER_MANAGED_DIRS,
} from "./runnerManagedWorkspace.js";
import {
  isSafeRelativePath,
  normalizeWorkspaceEntries,
} from "./workspacePolicy.js";
import { ensureWorkspaceWritableForShellUser } from "./workspacePermissions.js";

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

export async function replaceWorkspaceFiles(
  workspaceDir: string,
  files: WorkspaceSyncEntry[],
) {
  const normalized = normalizeWorkspaceEntries(files, {
    dropRunnerManaged: true,
  });

  await fs.mkdir(workspaceDir, { recursive: true, mode: 0o777 });
  await fs.chmod(workspaceDir, 0o777).catch(() => {});
  await ensureWorkspaceWritableForShellUser(workspaceDir);

  const currentEntries: CurrentEntry[] = [];
  await walkCurrentEntries(workspaceDir, workspaceDir, currentEntries);

  const currentFiles = new Set(
    currentEntries.filter((e) => e.kind === "file").map((e) => e.path),
  );
  const currentDirs = new Set(
    currentEntries.filter((e) => e.kind === "directory").map((e) => e.path),
  );

  const desiredFiles = new Map<string, string>();
  const desiredDirs = new Set<string>();

  for (const entry of normalized) {
    if (entry.kind === "directory") {
      desiredDirs.add(entry.path);
      for (const parent of parentDirsOf(entry.path)) desiredDirs.add(parent);
      continue;
    }

    desiredFiles.set(entry.path, entry.content);
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
  for (const [relPath, content] of desiredFiles) {
    const abs = path.join(workspaceDir, relPath);

    if (currentDirs.has(relPath)) {
      await fs.rm(abs, { recursive: true, force: true });
      currentDirs.delete(relPath);
    }

    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    await fs.chmod(abs, 0o666).catch(() => {});
    currentFiles.add(relPath);
  }

  // 3) Delete files no longer desired.
  for (const relPath of [...currentFiles]) {
    if (desiredFiles.has(relPath)) continue;

    // Keep terminal/runtime metadata even when the editor replaces the workspace.
    if (isRunnerManagedFilePath(relPath)) continue;

    const abs = path.join(workspaceDir, relPath);
    await fs.rm(abs, { force: true });
    currentFiles.delete(relPath);
  }

  // 4) Delete directories no longer desired, deepest-first.
  const keepDirs = new Set<string>(desiredDirs);

  const dirsToDelete = [...currentDirs]
    .filter((relPath) => !keepDirs.has(relPath))
    .filter((relPath) => !isRunnerManagedDirPath(relPath))
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
  const handle = await fs.open(historyPath, "a");
  await handle.close();
  await fs.chmod(historyPath, 0o666).catch(() => {});

  for (const dir of RUNNER_MANAGED_DIRS) {
    const abs = path.join(workspaceDir, dir);
    await fs.mkdir(abs, { recursive: true, mode: 0o777 });
    await fs.chmod(abs, 0o777).catch(() => {});
  }

  await ensureWorkspaceWritableForShellUser(workspaceDir);

  return {
    fileCount: normalized.filter((entry) => entry.kind === "file").length,
  };
}
