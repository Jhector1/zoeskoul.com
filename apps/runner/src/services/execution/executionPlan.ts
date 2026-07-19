import type { FileEntry, InteractiveLanguage } from "@zoeskoul/code-contracts";

export type ExecutionPlan = {
    prepareDirs?: string[];
    compileCmd?: string[];
    runCmd: string[];
};

type ExecutionPlanOptions = {
    shell?: boolean;
    cwd?: string;
};

type ExecutionLanguage = InteractiveLanguage | "bash";

const SAFE_REL_PATH = /^[A-Za-z0-9._/-]+$/;

function normalizeRelPath(p: string) {
    return String(p ?? "").replace(/\\/g, "/").trim();
}

function assertStrictRelPath(p: string) {
    const normalized = normalizeRelPath(p);

    if (!normalized) throw new Error("Empty path.");
    if (normalized.startsWith("/")) throw new Error(`Unsafe path: ${p}`);
    if (normalized.includes("\0")) throw new Error(`Unsafe path: ${p}`);
    if (!SAFE_REL_PATH.test(normalized)) {
        throw new Error(`Disallowed path chars: ${p}`);
    }

    for (const part of normalized.split("/")) {
        if (!part || part === "." || part === "..") {
            throw new Error(`Unsafe path: ${p}`);
        }
    }

    return normalized;
}

function normalizeWorkspaceCwd(cwd: string | undefined) {
    const normalized = normalizeRelPath(cwd ?? "");
    if (!normalized) return "/workspace";
    if (normalized === "/workspace") return "/workspace";
    if (!normalized.startsWith("/workspace/")) {
        throw new Error(`Unsafe cwd: ${cwd}`);
    }

    const rel = normalized.slice("/workspace/".length);
    return `/workspace/${assertStrictRelPath(rel)}`;
}

function prepareDirsForWorkspaceCwd(cwd: string | undefined) {
    const normalized = normalizeWorkspaceCwd(cwd);
    if (normalized === "/workspace") return undefined;
    return [normalized.slice("/workspace/".length)];
}

function getJavaMainClass(files: FileEntry[], entryFile: string): string {
    const entry = assertStrictRelPath(entryFile);
    const simpleName = entry.split("/").pop()?.replace(/\.java$/, "") || "Main";

    const entryFileNode = files.find((file) => normalizeRelPath(file.path) === entry);
    const source =
        entryFileNode && (entryFileNode as any).encoding !== "base64"
            ? String((entryFileNode as any).content ?? "")
            : "";

    const pkgMatch = source.match(
        /^\s*package\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;/m,
    );

    return pkgMatch?.[1] ? `${pkgMatch[1]}.${simpleName}` : simpleName;
}

function filesByExt(files: FileEntry[], exts: string[]) {
    return files
        .map((f) => assertStrictRelPath(f.path))
        .filter((p) => exts.some((ext) => p.endsWith(ext)));
}

function includeDirs(files: FileEntry[], exts: string[]) {
    const dirs = new Set<string>();

    for (const p of filesByExt(files, exts)) {
        const idx = p.lastIndexOf("/");
        if (idx > 0) {
            dirs.add(p.slice(0, idx));
        }
    }

    return [...dirs].sort().flatMap((dir) => ["-I", dir]);
}

export function getExecutionPlan(
    language: ExecutionLanguage,
    entryFile?: string,
    files: FileEntry[] = [],
    options: ExecutionPlanOptions = {},
): ExecutionPlan {
    const shell = options.shell === true;
    const entry = entryFile ? assertStrictRelPath(entryFile) : undefined;

    switch (language) {
        case "python":
            if (!entry) throw new Error("Missing Python entry file.");
            return {
                runCmd: ["python3", "-u", entry],
            };

        case "javascript":
            if (!entry) throw new Error("Missing JavaScript entry file.");
            return {
                runCmd: ["node", entry],
            };

        case "bash":
            if (shell) {
                /**
                 * The browser synchronizes editor files after the PTY session
                 * exists. Hidden lesson setup therefore runs from the terminal
                 * bootstrap only after that synchronization finishes; running it
                 * here would race with workspace replacement and lose Git state.
                 */
                const interactiveShell = [
                    'cd "${START_CWD:-/workspace}"',
                    "export PS1='[zoeskoul]\\w$ '",
                    "umask 000",
                    "exec /bin/bash --noprofile --norc -i",
                ].join("\n");

                return {
                    prepareDirs: prepareDirsForWorkspaceCwd(options.cwd),
                    runCmd: [
                        "/bin/bash",
                        "--noprofile",
                        "--norc",
                        "-c",
                        interactiveShell,
                    ],
                };
            }

            if (!entry) throw new Error("Missing Bash entry file.");
            return {
                runCmd: [
                    "/bin/bash",
                    "--noprofile",
                    "--norc",
                    "-c",
                    'export PS1="[zoeskoul]\\w$ "; umask 000; exec /bin/bash --noprofile --norc "$1"',
                    "zoeskoul-bash",
                    entry,
                ],
            };

        case "c": {
            const srcs = filesByExt(files, [".c"]);
            if (!srcs.length) throw new Error("No C source files found.");

            return {
                prepareDirs: ["build"],
                compileCmd: [
                    "gcc",
                    "-O2",
                    "-std=c11",
                    ...includeDirs(files, [".h"]),
                    "-o",
                    "build/app",
                    ...srcs,
                ],
                runCmd: ["./build/app"],
            };
        }

        case "cpp": {
            const srcs = filesByExt(files, [".cpp", ".cc", ".cxx"]);
            if (!srcs.length) throw new Error("No C++ source files found.");

            return {
                prepareDirs: ["build"],
                compileCmd: [
                    "g++",
                    "-O2",
                    "-std=c++17",
                    ...includeDirs(files, [".h", ".hpp", ".hh"]),
                    "-o",
                    "build/app",
                    ...srcs,
                ],
                runCmd: ["./build/app"],
            };
        }

        case "java": {
            const srcs = filesByExt(files, [".java"]);
            if (!srcs.length) throw new Error("No Java source files found.");
            if (!entry) throw new Error("Missing Java entry file.");

            return {
                prepareDirs: ["build"],
                compileCmd: ["javac", "-d", "build", ...srcs],
                runCmd: ["java", "-cp", "build", getJavaMainClass(files, entry)],
            };
        }
    }
}
