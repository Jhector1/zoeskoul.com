import fs from "node:fs/promises";
import path from "node:path";

export type SnapshotWorkspaceFile = {
    path: string;
    content: string;
};

const MAX_FILES = 150;
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

async function walkFiles(root: string, dir: string, out: string[]) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        const rel = path.relative(root, abs).replace(/\\/g, "/");

        if (!isSafeRelativePath(rel)) continue;

        if (entry.isDirectory()) {
            await walkFiles(root, abs, out);
            continue;
        }

        if (!entry.isFile()) continue;
        if (!isAllowedFile(rel)) continue;

        out.push(rel);

        if (out.length > MAX_FILES) {
            throw new Error(`Workspace limit reached: max ${MAX_FILES} files.`);
        }
    }
}

export async function snapshotWorkspaceFiles(workspaceDir: string) {
    const relPaths: string[] = [];
    await walkFiles(workspaceDir, workspaceDir, relPaths);
    relPaths.sort((a, b) => a.localeCompare(b));

    let totalBytes = 0;
    const files: SnapshotWorkspaceFile[] = [];

    for (const relPath of relPaths) {
        const abs = path.join(workspaceDir, relPath);
        const content = await fs.readFile(abs, "utf8");
        const bytes = Buffer.byteLength(content, "utf8");

        totalBytes += bytes;
        if (totalBytes > MAX_TOTAL_BYTES) {
            throw new Error(
                `Workspace limit reached: max ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB total content.`,
            );
        }

        files.push({
            path: relPath,
            content,
        });
    }

    return files;
}