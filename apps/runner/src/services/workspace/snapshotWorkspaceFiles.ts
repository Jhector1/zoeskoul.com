import fs from "node:fs/promises";
import path from "node:path";

export type SnapshotWorkspaceEntry =
    | { kind: "directory"; path: string }
    | { kind: "file"; path: string; content: string };

const MAX_ENTRIES = 400;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

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

const IGNORED_DIRS = new Set([
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    "target",
    "__pycache__",
]);

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
            if (IGNORED_DIRS.has(entry.name)) continue;

            dirs.push(rel);

            if (dirs.length + files.length > MAX_ENTRIES) {
                throw new Error(`Workspace limit reached: max ${MAX_ENTRIES} entries.`);
            }

            await walkEntries(root, abs, dirs, files);
            continue;
        }

        if (!entry.isFile()) continue;
        if (!isAllowedFile(rel)) continue;

        files.push(rel);

        if (dirs.length + files.length > MAX_ENTRIES) {
            throw new Error(`Workspace limit reached: max ${MAX_ENTRIES} entries.`);
        }
    }
}

export async function snapshotWorkspaceFiles(workspaceDir: string) {
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
    const entries: SnapshotWorkspaceEntry[] = [];

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

        totalBytes += bytes;
        if (totalBytes > MAX_TOTAL_BYTES) {
            throw new Error(
                `Workspace limit reached: max ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB total content.`,
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