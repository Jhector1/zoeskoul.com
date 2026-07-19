import JSZip from "jszip";
import {
    isBinaryRunCodeFile,
    isTextRunCodeFile,
    normalizeRunCodeFiles,
    type RunCodeFile,
    type RunCodeFiles,
    type RunCodeFn,
    type RunCodeLimits,
} from "./runner.js";
import {buildJudge0Headers} from "./serviceAuthHeaders.js";

type FileEntry = RunCodeFile;

type Judge0SubmitResult =
    | {
    ok: true;
    token: string;
}
    | {
    ok: false;
    error: string;
};

type Judge0PollResult = {
    ok: boolean;
    done: boolean;
    token?: string;
    statusId?: number;
    status: string;
    stdout?: string | null;
    stderr?: string | null;
    compile_output?: string | null;
    message?: string | null;
    time?: string | null;
    memory?: number | null;
    error?: string;
};

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_POLLS = 120;

const DEFAULT_CODE_LIMITS = {
    cpu_time_limit: 2,
    cpu_extra_time: 0.5,
    wall_time_limit: 8,
    memory_limit: 256000,
    stack_limit: 64000,
    max_processes_and_or_threads: 30,
    enable_network: false,
    number_of_runs: 1,
};

const FALLBACK_LANG_IDS: Record<string, number> = {
    python: 71,
    java: 62,
    javascript: 63,
    c: 50,
    cpp: 54,
};

function b64(value: string) {
    return Buffer.from(String(value ?? ""), "utf8").toString("base64");
}

function fromB64(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value !== "string") return String(value);

    try {
        return Buffer.from(value, "base64").toString("utf8");
    } catch {
        return value;
    }
}

function envInt(name: string) {
    const raw = process.env[name];
    if (!raw) return null;

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

function normalizeJudge0BaseUrl(baseUrl?: string | null) {
    const raw = String(baseUrl ?? process.env.JUDGE0_URL ?? "").trim();
    if (!raw) return null;
    return raw.replace(/\/$/, "");
}

function normalizeLimits(input?: RunCodeLimits) {
    const source = input ?? {};

    return {
        cpu_time_limit: clampNumber(
            Number(source.cpu_time_limit ?? DEFAULT_CODE_LIMITS.cpu_time_limit),
            1,
            10,
        ),
        cpu_extra_time: clampNumber(
            Number(source.cpu_extra_time ?? DEFAULT_CODE_LIMITS.cpu_extra_time),
            0,
            5,
        ),
        wall_time_limit: clampNumber(
            Number(source.wall_time_limit ?? DEFAULT_CODE_LIMITS.wall_time_limit),
            2,
            20,
        ),
        memory_limit: clampNumber(
            Number(source.memory_limit ?? DEFAULT_CODE_LIMITS.memory_limit),
            64000,
            512000,
        ),
        stack_limit: clampNumber(
            Number(source.stack_limit ?? DEFAULT_CODE_LIMITS.stack_limit),
            16000,
            256000,
        ),
        max_processes_and_or_threads: clampNumber(
            Number(
                source.max_processes_and_or_threads ??
                DEFAULT_CODE_LIMITS.max_processes_and_or_threads,
            ),
            1,
            120,
        ),
        enable_network: false,
        number_of_runs: clampNumber(
            Number(source.number_of_runs ?? DEFAULT_CODE_LIMITS.number_of_runs),
            1,
            3,
        ),
    };
}

function getSingleFileLanguageId(language: string) {
    const normalized = String(language ?? "").toLowerCase();

    const python = envInt("JUDGE0_LANG_PYTHON");
    const java = envInt("JUDGE0_LANG_JAVA");
    const javascript = envInt("JUDGE0_LANG_JAVASCRIPT");
    const c = envInt("JUDGE0_LANG_C");
    const cpp = envInt("JUDGE0_LANG_CPP");

    if (normalized === "python" && python) return python;
    if (normalized === "java" && java) return java;
    if (normalized === "javascript" && javascript) return javascript;
    if (normalized === "c" && c) return c;
    if (normalized === "cpp" && cpp) return cpp;

    return FALLBACK_LANG_IDS[normalized] ?? null;
}

function assertSafeRelPath(filePath: string) {
    const raw = String(filePath ?? "").trim();

    if (!raw) {
        throw new Error("Unsafe empty file path.");
    }

    if (
        raw.startsWith("/") ||
        raw.startsWith("\\") ||
        raw.includes("\\") ||
        /^[a-zA-Z]:[\\/]/.test(raw)
    ) {
        throw new Error(`Unsafe path: ${raw}`);
    }

    const parts = raw.split("/");

    if (
        parts.some(
            (part) =>
                !part ||
                part === "." ||
                part === ".." ||
                part.includes("\0"),
        )
    ) {
        throw new Error(`Unsafe path: ${raw}`);
    }

    return parts.join("/");
}

function normalizeFiles(files: RunCodeFiles | undefined): FileEntry[] {
    return normalizeRunCodeFiles(files);
}

function syntheticEntryFor(language: string) {
    switch (String(language ?? "").toLowerCase()) {
        case "python":
            return "__zoeskoul_main__.py";
        case "javascript":
            return "__zoeskoul_main__.js";
        case "java":
            return "Main.java";
        case "c":
            return "main.c";
        case "cpp":
            return "main.cpp";
        default:
            return "__zoeskoul_main__.txt";
    }
}

function pickJavaMainClass(entryPath: string, files: FileEntry[]) {
    const entryFile = files.find((file) => file.path === entryPath);
    const source =
        entryFile && isTextRunCodeFile(entryFile) ? entryFile.content : "";

    const pkg = /package\s+([a-zA-Z0-9_.]+)\s*;/.exec(source)?.[1];
    const cls =
        /public\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z0-9_]+)/.exec(
            source,
        )?.[1] ?? /class\s+([A-Za-z0-9_]+)/.exec(source)?.[1];

    if (!cls) return "Main";
    return pkg ? `${pkg}.${cls}` : cls;
}

function scriptsFor(language: string, entry: string, files: FileEntry[]) {
    const normalized = String(language ?? "").toLowerCase();
    const mainClass = normalized === "java" ? pickJavaMainClass(entry, files) : "";

    const run = (() => {
        switch (normalized) {
            case "python":
                return `#!/usr/bin/env bash
set -euo pipefail
ENTRY="${entry}"
export PYTHONPATH="$(pwd):$(pwd)/src:\${PYTHONPATH:-}"
python3 "$ENTRY"
`;
            case "javascript":
                return `#!/usr/bin/env bash
set -euo pipefail
ENTRY="${entry}"
node "$ENTRY"
`;
            case "java":
                return `#!/usr/bin/env bash
set -euo pipefail
java -cp build "${mainClass}"
`;
            case "c":
            case "cpp":
                return `#!/usr/bin/env bash
set -euo pipefail
./build/app
`;
            default:
                throw new Error(`Unsupported project language: ${language}`);
        }
    })();

    const compile = (() => {
        switch (normalized) {
            case "java":
                return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p build
FILES=$(find . -name "*.java" -not -path "./build/*")
javac -d build $FILES
`;
            case "c":
                return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p build
FILES=$(find . -name "*.c" -not -path "./build/*")
gcc -O2 -std=c11 -I. -o build/app $FILES
`;
            case "cpp":
                return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p build
FILES=$(find . -name "*.cpp" -not -path "./build/*")
g++ -O2 -std=c++17 -I. -o build/app $FILES
`;
            case "python":
            case "javascript":
                return null;
            default:
                throw new Error(`Unsupported project language: ${language}`);
        }
    })();

    return { compile, run };
}

async function zipProject(language: string, entry: string, files: FileEntry[]) {
    const safeEntry = assertSafeRelPath(entry);
    const zip = new JSZip();

    const normalizedFiles = files.map((file): FileEntry => {
        const path = assertSafeRelPath(file.path);
        if (isBinaryRunCodeFile(file)) {
            return { ...file, path };
        }
        return {
            ...file,
            path,
            content: String(file.content ?? ""),
        };
    });

    for (const file of normalizedFiles) {
        if (isBinaryRunCodeFile(file)) {
            zip.file(file.path, file.data, { base64: true, binary: true });
        } else {
            zip.file(file.path, file.content);
        }
    }

    const { compile, run } = scriptsFor(language, safeEntry, normalizedFiles);

    if (compile) {
        zip.file("compile", compile);
        zip.file("compile.sh", compile);
    }

    zip.file("run", run);
    zip.file("run.sh", run);

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    return buffer.toString("base64");
}

function makeProjectFiles(args: {
    language: string;
    code: string;
    entry?: string;
    files?: RunCodeFiles;
}) {
    const files = normalizeFiles(args.files);
    const entry = args.entry?.trim() || syntheticEntryFor(args.language);

    const merged = new Map<string, FileEntry>();

    for (const file of files) {
        merged.set(file.path, file);
    }

    // Important:
    // The code argument is the canonical submitted/solution code.
    // For project runs, force the entry file to contain that code so web and
    // golden do not accidentally grade a stale workspace file.
    merged.set(entry, {
        path: entry,
        content: String(args.code ?? ""),
    });

    return {
        entry,
        files: [...merged.values()],
    };
}

async function buildJudge0SubmissionBody(args: {
    language: string;
    code: string;
    entry?: string;
    stdin?: string;
    files?: RunCodeFiles;
    limits?: RunCodeLimits;
}) {
    const language = String(args.language ?? "").toLowerCase();
    const stdin = b64(args.stdin ?? "");
    const limits = normalizeLimits(args.limits);
    const files = normalizeFiles(args.files);

    // Force Python through Judge0 multi-file mode, even for single-file code.
    // This makes package golden and web grading use the same Python executable
    // used by the bound Tools workspace, avoiding Python 3.7 vs 3.8+ drift.
    const useProjectMode =
        language === "python" || Boolean(args.entry) || files.length > 0;

    if (useProjectMode) {
        const project = makeProjectFiles({
            language,
            code: args.code,
            entry: args.entry,
            files: args.files,
        });

        const additional_files = await zipProject(
            language,
            project.entry,
            project.files,
        );

        return {
            language_id: 89,
            additional_files,
            stdin,
            ...limits,
        };
    }

    const language_id = getSingleFileLanguageId(language);

    if (!language_id) {
        throw new Error(`Unsupported language for Judge0: ${args.language}`);
    }

    return {
        language_id,
        source_code: b64(args.code),
        stdin,
        ...limits,
    };
}

function makeError(status: number, text: string, fallback: string) {
    try {
        const data = JSON.parse(text);
        return data?.error ?? data?.message ?? `${fallback} (${status})`;
    } catch {
        return `${fallback} (${status}): ${text.slice(0, 300)}`;
    }
}

async function createJudge0Submission(args: {
    baseUrl: string;
    body: unknown;
}): Promise<Judge0SubmitResult> {
    const response = await fetch(
        `${args.baseUrl}/submissions?base64_encoded=true`,
        {
            method: "POST",
            headers: buildJudge0Headers({ json: true }),
            body: JSON.stringify(args.body),
        },
    );

    const text = await response.text();
    let data: any;

    try {
        data = JSON.parse(text);
    } catch {
        return {
            ok: false,
            error: `Non-JSON response (${response.status}): ${text.slice(0, 300)}`,
        };
    }

    if (!response.ok || !data?.token) {
        return {
            ok: false,
            error:
                data?.error ??
                data?.message ??
                `Judge0 submission failed (${response.status})`,
        };
    }

    return {
        ok: true,
        token: String(data.token),
    };
}

async function pollJudge0Submission(args: {
    baseUrl: string;
    token: string;
}): Promise<Judge0PollResult> {
    const safeToken = encodeURIComponent(String(args.token ?? "").trim());

    const response = await fetch(
        `${args.baseUrl}/submissions/${safeToken}?base64_encoded=true`,
        {
            method: "GET",
            headers: buildJudge0Headers(),
        },
    );

    const text = await response.text();

    if (!response.ok) {
        return {
            ok: false,
            done: true,
            status: "Error",
            error: makeError(response.status, text, "Judge0 poll failed"),
        };
    }

    let data: any;

    try {
        data = JSON.parse(text);
    } catch {
        return {
            ok: false,
            done: true,
            status: "Error",
            error: `Non-JSON response (${response.status}): ${text.slice(0, 300)}`,
        };
    }

    const statusId = Number(data?.status?.id ?? 0);
    const accepted = statusId === 3;
    const done = ![1, 2].includes(statusId);

    return {
        ok: accepted,
        done,
        token: data?.token ? String(data.token) : undefined,
        statusId,
        status:
            data?.status?.description ??
            (accepted ? "Accepted" : "Not Accepted"),
        stdout: fromB64(data?.stdout),
        stderr: fromB64(data?.stderr),
        compile_output: fromB64(data?.compile_output),
        message: fromB64(data?.message),
        time: data?.time ?? null,
        memory: data?.memory ?? null,
        error: data?.error ?? undefined,
    };
}

export function createJudge0CodeRunner(args: {
    baseUrl: string;
    pollIntervalMs?: number;
    maxPolls?: number;
}): RunCodeFn {
    const baseUrl = normalizeJudge0BaseUrl(args.baseUrl);

    if (!baseUrl) {
        return async () => ({
            ok: false,
            status: "Error",
            error: "Missing Judge0 base URL.",
        });
    }

    return async (runArgs) => {
        try {
            const body = await buildJudge0SubmissionBody(runArgs);
            const submitted = await createJudge0Submission({ baseUrl, body });

            if (!submitted.ok) {
                return {
                    ok: false,
                    status: "Error",
                    error: submitted.error,
                };
            }

            const pollIntervalMs =
                args.pollIntervalMs ??
                envInt("CODE_RUN_POLL_INTERVAL_MS") ??
                DEFAULT_POLL_INTERVAL_MS;

            const maxPolls =
                args.maxPolls ??
                envInt("CODE_RUN_MAX_POLLS") ??
                DEFAULT_MAX_POLLS;

            for (let index = 0; index < maxPolls; index += 1) {
                const polled = await pollJudge0Submission({
                    baseUrl,
                    token: submitted.token,
                });

                if (polled.done) {
                    return polled;
                }

                await sleep(pollIntervalMs);
            }

            return {
                ok: false,
                status: "Timeout",
                error: "Execution timed out while waiting for Judge0.",
                timedOut: true,
            };
        } catch (error) {
            return {
                ok: false,
                status: "Error",
                error:
                    error instanceof Error
                        ? error.message
                        : "Judge0 runner failed.",
            };
        }
    };
}

export function createJudge0CodeRunnerFromEnv(args?: {
    pollIntervalMs?: number;
    maxPolls?: number;
}): RunCodeFn | null {
    const baseUrl = normalizeJudge0BaseUrl();

    if (!baseUrl) {
        return null;
    }

    return createJudge0CodeRunner({
        baseUrl,
        pollIntervalMs: args?.pollIntervalMs,
        maxPolls: args?.maxPolls,
    });
}