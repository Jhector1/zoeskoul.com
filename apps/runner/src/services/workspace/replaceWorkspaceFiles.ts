import fs from "node:fs/promises";
import path from "node:path";

export type ReplaceWorkspaceFile = {
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

async function rmContents(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    await Promise.all(
        entries.map(async (entry) => {
            const abs = path.join(dir, entry.name);
            await fs.rm(abs, { recursive: true, force: true });
        }),
    );
}

export async function replaceWorkspaceFiles(
    workspaceDir: string,
    files: ReplaceWorkspaceFile[],
) {
    if (!Array.isArray(files)) {
        throw new Error("files must be an array.");
    }

    if (files.length > MAX_FILES) {
        throw new Error(`Workspace limit reached: max ${MAX_FILES} files.`);
    }

    let totalBytes = 0;
    const seenPaths = new Set<string>();

    const normalized = files
        .map((file) => {
            const relPath = String(file?.path ?? "").replace(/\\/g, "/").trim();
            const content = String(file?.content ?? "");

            if (!isSafeRelativePath(relPath)) {
                throw new Error(`Unsafe file path: ${relPath}`);
            }

            if (!isAllowedFile(relPath)) {
                throw new Error(`Unsupported file type: ${relPath}`);
            }

            if (seenPaths.has(relPath)) {
                throw new Error(`Duplicate file path: ${relPath}`);
            }
            seenPaths.add(relPath);

            totalBytes += Buffer.byteLength(content, "utf8");
            if (totalBytes > MAX_TOTAL_BYTES) {
                throw new Error(
                    `Workspace limit reached: max ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB total content.`,
                );
            }

            return { path: relPath, content };
        })
        .sort((a, b) => a.path.localeCompare(b.path));

    await fs.mkdir(workspaceDir, { recursive: true });

    const workspaceParent = path.dirname(workspaceDir);
    const workspaceBase = path.basename(workspaceDir);
    const stageDir = await fs.mkdtemp(
        path.join(workspaceParent, `${workspaceBase}.stage-`),
    );

    try {
        for (const file of normalized) {
            const abs = path.join(stageDir, file.path);
            const parent = path.dirname(abs);

            await fs.mkdir(parent, { recursive: true });
            await fs.writeFile(abs, file.content, "utf8");
        }

        await rmContents(workspaceDir);

        const stageEntries = await fs.readdir(stageDir, { withFileTypes: true });
        for (const entry of stageEntries) {
            const from = path.join(stageDir, entry.name);
            const to = path.join(workspaceDir, entry.name);
            await fs.rename(from, to);
        }

        return { fileCount: normalized.length };
    } finally {
        await fs.rm(stageDir, { recursive: true, force: true });
    }
}