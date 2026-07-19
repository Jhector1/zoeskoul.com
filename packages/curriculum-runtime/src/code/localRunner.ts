import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
    isBinaryRunCodeFile,
    normalizeRunCodeFiles,
    type RunCodeFn,
} from "./runner.js";

function resolveCommand(language: string):
    | { command: string; args: string[] }
    | null {
    switch (language) {
        case "python":
            return { command: "python3", args: ["-c"] };
        case "javascript":
            return { command: "node", args: ["-e"] };
        default:
            return null;
    }
}

export const runLocalCode: RunCodeFn = async (args) => {
    const resolved = resolveCommand(args.language);

    if (!resolved) {
        return {
            ok: false,
            error: `No local compiler-side runner is implemented for language "${args.language}".`,
        };
    }

    const timeoutMs = Math.max(250, Number(args.limits?.timeoutMs ?? 4000));
    const tempDir = args.files ? await fs.mkdtemp(path.join(os.tmpdir(), "curr-code-")) : null;

    if (tempDir && args.files) {
        const entries = normalizeRunCodeFiles(args.files);

        for (const entry of entries) {
            const filePath = path.join(tempDir, entry.path);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            if (isBinaryRunCodeFile(entry)) {
                await fs.writeFile(filePath, Buffer.from(entry.data, "base64"));
            } else {
                await fs.writeFile(filePath, entry.content, "utf8");
            }
        }
    }

    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timedOut = false;

        const child = spawn(resolved.command, [...resolved.args, args.code], {
            stdio: "pipe",
            cwd: tempDir ?? undefined,
        });

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, timeoutMs);

        child.stdout.on("data", (chunk: Buffer | string) => {
            stdout += String(chunk);
        });

        child.stderr.on("data", (chunk: Buffer | string) => {
            stderr += String(chunk);
        });

        child.on("error", (error: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const finalize = {
                ok: false,
                stdout,
                stderr,
                exitCode: null,
                error: error.message,
                timedOut,
            };
            void (async () => {
                if (tempDir) {
                    await fs.rm(tempDir, { recursive: true, force: true });
                }
                resolve(finalize);
            })();
        });

        child.on("close", (code: number | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const finalize = {
                ok: !timedOut && code === 0,
                stdout,
                stderr,
                exitCode: code,
                timedOut,
                ...(timedOut ? { error: "Execution timed out." } : {}),
            };
            void (async () => {
                if (tempDir) {
                    await fs.rm(tempDir, { recursive: true, force: true });
                }
                resolve(finalize);
            })();
        });

        child.stdin.write(String(args.stdin ?? ""));
        child.stdin.end();
    });
};
