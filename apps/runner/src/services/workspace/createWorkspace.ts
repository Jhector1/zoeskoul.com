import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
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

async function chownRecursive(target: string, uid: number, gid: number) {
    await new Promise<void>((resolve, reject) => {
        const child = spawn("chown", ["-R", `${uid}:${gid}`, target], {
            stdio: "ignore",
        });

        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`chown failed with exit code ${code ?? "unknown"}`));
        });
    });
}

export async function createWorkspace(files: FileEntry[]) {
    const rootBase =
        process.env.RUNNER_WORKSPACE_ROOT || "/opt/zoeskoul/workspaces";

    await fs.mkdir(rootBase, { recursive: true });

    const root = path.join(rootBase, `zoeskoul-run-${crypto.randomUUID()}`);
    await fs.mkdir(root, { recursive: true });

    for (const file of files) {
        assertSafeRelPath(file.path);
        const abs = path.join(root, file.path);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, file.content ?? "", "utf8");
    }

    await chownRecursive(root, env.execUid, env.execGid);

    return root;
}