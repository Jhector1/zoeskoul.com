import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileEntry } from "@zoeskoul/code-contracts";

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

export async function createWorkspace(files: FileEntry[]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zoeskoul-run-"));

    for (const file of files) {
        assertSafeRelPath(file.path);
        const abs = path.join(root, file.path);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, file.content ?? "", "utf8");
    }

    return root;
}