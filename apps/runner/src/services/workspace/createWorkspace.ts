import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { FileEntry } from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";

export type WorkspaceSyncEntry =
    | (FileEntry & { kind?: "file" })
    | { kind: "directory"; path: string };

const DIR_MODE = 0o770;
const FILE_MODE = 0o660;
const HISTORY_MODE = 0o600;

function normalizePath(input: string) {
    return String(input ?? "").replace(/\\/g, "/").trim();
}

function assertSafeRelPath(p: string) {
    const normalized = normalizePath(p);
    if (!normalized) throw new Error("Empty path.");
    if (normalized.startsWith("/")) throw new Error(`Unsafe path: ${p}`);
    if (normalized.includes("\0")) throw new Error(`Unsafe path: ${p}`);

    const parts = normalized.split("/");
    for (const part of parts) {
        if (!part || part === "." || part === "..") {
            throw new Error(`Unsafe path: ${p}`);
        }
    }

    return normalized;
}

async function ensureWorkspaceRoot(dir: string) {
    await fs.mkdir(dir, { recursive: true, mode: 0o770 });
    await fs.chmod(dir, 0o770).catch(() => {});
}

async function ensureWorkspaceDir(dir: string) {
    await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
    await fs.chmod(dir, DIR_MODE).catch(() => {});
}

async function writeWorkspaceFile(abs: string, content: string) {
    await ensureWorkspaceDir(path.dirname(abs));
    await fs.writeFile(abs, content, "utf8");
    await fs.chmod(abs, FILE_MODE).catch(() => {});
}

async function ensureBashHistory(workspaceDir: string) {
    const historyPath = path.join(workspaceDir, ".bash_history");

    const handle = await fs.open(historyPath, "a");
    await handle.close();

    await fs.chmod(historyPath, HISTORY_MODE).catch(() => {});
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

export async function createWorkspace(files: WorkspaceSyncEntry[]) {
    const rootBase = env.workspaceRoot;

    await ensureWorkspaceRoot(rootBase);

    const root = path.join(rootBase, `zoeskoul-run-${crypto.randomUUID()}`);
    await ensureWorkspaceDir(root);

    const seenPaths = new Set<string>();

    const normalized = sortEntries(
        (files ?? []).map((entry) => {
            const safePath = assertSafeRelPath(entry.path);

            if (seenPaths.has(safePath)) {
                throw new Error(`Duplicate path: ${safePath}`);
            }

            seenPaths.add(safePath);

            if (entry.kind === "directory") {
                return {
                    kind: "directory" as const,
                    path: safePath,
                };
            }

            return {
                kind: "file" as const,
                path: safePath,
                content: String(entry.content ?? ""),
            };
        }),
    );

    for (const entry of normalized) {
        const abs = path.join(root, entry.path);

        if (entry.kind === "directory") {
            await ensureWorkspaceDir(abs);
            continue;
        }

        await writeWorkspaceFile(abs, entry.content);
    }

    await ensureBashHistory(root);

    return root;
}