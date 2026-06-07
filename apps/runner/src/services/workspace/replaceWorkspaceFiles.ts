import fs from "node:fs/promises";
import path from "node:path";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";

const MAX_ENTRIES = 400;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const RUNNER_MANAGED_FILES = new Set([".bash_history"]);
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
]);



type CurrentEntry = {
    kind: "file" | "directory";
    path: string;
};

function isAllowedFile(relPath: string) {
    const base = path.basename(relPath);
    if (ALLOWED_BASENAMES.has(base)) return true;

    const ext = path.extname(base).toLowerCase();
    return ALLOWED_EXTENSIONS.has(ext);
}

function isSafeRelativePath(relPath: string) {
    const normalized = String(relPath ?? "").replace(/\\/g, "/").trim();
    if (!normalized) return false;
    if (normalized.startsWith("/")) return false;
    if (normalized.includes("\0")) return false;

    const parts = normalized.split("/");
    return parts.every((part) => !!part && part !== "." && part !== "..");
}

function entryKind(entry: WorkspaceSyncEntry) {
    return entry.kind === "directory" ? "directory" : "file";
}

function sortEntries(entries: WorkspaceSyncEntry[]) {
    return [...entries].sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path);
        if (pathCmp !== 0) return pathCmp;

        const ak = entryKind(a);
        const bk = entryKind(b);
        if (ak === bk) return 0;
        return ak === "directory" ? -1 : 1;
    });
}

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
    if (!Array.isArray(files)) {
        throw new Error("files must be an array.");
    }

    if (files.length > MAX_ENTRIES) {
        throw new Error(`Workspace limit reached: max ${MAX_ENTRIES} entries.`);
    }

    let totalBytes = 0;
    const seenPaths = new Set<string>();

    const normalized = sortEntries(
        files.map((entry) => {
            const relPath = String(entry?.path ?? "").replace(/\\/g, "/").trim();

            if (!isSafeRelativePath(relPath)) {
                throw new Error(`Unsafe path: ${relPath}`);
            }

            if (seenPaths.has(relPath)) {
                throw new Error(`Duplicate path: ${relPath}`);
            }
            seenPaths.add(relPath);

            if (entry.kind === "directory") {
                return {
                    kind: "directory" as const,
                    path: relPath,
                };
            }

            const content = String((entry as any)?.content ?? "");

            if (!isAllowedFile(relPath)) {
                throw new Error(`Unsupported file type: ${relPath}`);
            }

            totalBytes += Buffer.byteLength(content, "utf8");
            if (totalBytes > MAX_TOTAL_BYTES) {
                throw new Error(
                    `Workspace limit reached: max ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB total content.`,
                );
            }

            return {
                kind: "file" as const,
                path: relPath,
                content,
            };
        }),
    );

    await fs.mkdir(workspaceDir, { recursive: true });

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

        await fs.mkdir(abs, { recursive: true });
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
        currentFiles.add(relPath);
    }

    // 3) Delete files no longer desired.
    for (const relPath of [...currentFiles]) {
        if (desiredFiles.has(relPath)) continue;

        // Keep terminal history even when the editor replaces the workspace.
        if (RUNNER_MANAGED_FILES.has(relPath)) continue;

        const abs = path.join(workspaceDir, relPath);
        await fs.rm(abs, { force: true });
        currentFiles.delete(relPath);
    }

    // 4) Delete directories no longer desired, deepest-first.
    const keepDirs = new Set<string>(desiredDirs);

    const dirsToDelete = [...currentDirs]
        .filter((relPath) => !keepDirs.has(relPath))
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
    await fs.chmod(historyPath, 0o600).catch(() => {});
    return { fileCount: normalized.length };
}