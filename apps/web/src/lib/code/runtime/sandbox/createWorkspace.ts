import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileEntry } from "../../types/common";

function assertSafeRelPath(p: string) {
    if (!p || p.startsWith("/") || p.includes("..")) {
        throw new Error(`Unsafe path: ${p}`);
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