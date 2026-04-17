// apps/runner/src/workspace/createWorkspace.ts
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { FileEntry } from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";

function assertSafeRelPath(p: string) {
    const normalized = String(p ?? "").replace(/\\/g, "/").trim();
    if (!normalized) throw new Error("Empty path.");
    if (normalized.startsWith("/")) throw new Error(`Unsafe path: ${p}`);
    if (normalized.includes("\0")) throw new Error(`Unsafe path: ${p}`);

    const parts = normalized.split("/");
    for (const part of parts) {
        if (!part || part === "." || part === "..") {
            throw new Error(`Unsafe path: ${p}`);
        }
    }
}

async function ensureWritableDir(dir: string) {
    await fs.mkdir(dir, { recursive: true, mode: 0o777 });
    await fs.chmod(dir, 0o777).catch(() => {});
}

export async function createWorkspace(files: FileEntry[]) {
    const rootBase = env.workspaceRoot;

    await ensureWritableDir(rootBase);

    const root = path.join(rootBase, `zoeskoul-run-${crypto.randomUUID()}`);
    await ensureWritableDir(root);

    for (const file of files) {
        assertSafeRelPath(file.path);

        const abs = path.join(root, file.path);
        const parent = path.dirname(abs);

        await ensureWritableDir(parent);
        await fs.writeFile(abs, file.content ?? "", "utf8");
        await fs.chmod(abs, 0o666).catch(() => {});
    }

    return root;
}