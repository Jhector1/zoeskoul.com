import fs from "node:fs/promises";
import path from "node:path";

export type ReplaceWorkspaceEntry =
    | { kind?: "file"; path: string; content: string }
    | { kind: "directory"; path: string };

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

function entryKind(entry: ReplaceWorkspaceEntry) {
    return entry.kind === "directory" ? "directory" : "file";
}

function sortEntries(entries: ReplaceWorkspaceEntry[]) {
    return [...entries].sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path);
        if (pathCmp !== 0) return pathCmp;

        const ak = entryKind(a);
        const bk = entryKind(b);
        if (ak === bk) return 0;
        return ak === "directory" ? -1 : 1;
    });
}

export async function replaceWorkspaceFiles(
    workspaceDir: string,
    files: ReplaceWorkspaceEntry[],
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

    await rmContents(workspaceDir);

    for (const entry of normalized) {
        const abs = path.join(workspaceDir, entry.path);

        if (entry.kind === "directory") {
            await fs.mkdir(abs, { recursive: true });
            continue;
        }

        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, entry.content, "utf8");
    }

    return { fileCount: normalized.length };
}