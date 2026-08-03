const RUNNER_INFRASTRUCTURE_ERROR_PATTERNS = [
    /\bfetch failed\b/i,
    /\bECONNREFUSED\b/i,
    /\bECONNRESET\b/i,
    /\bENOTFOUND\b/i,
    /\bETIMEDOUT\b/i,
    /\bsocket hang up\b/i,
    /missing JUDGE0_URL/i,
    /missing Judge0 base URL/i,
    /Judge0 submission failed/i,
    /Judge0 poll failed/i,
    /non-JSON response/i,
    /execution timed out while waiting for Judge0/i,
    /runner fetch failed/i,
    /service unavailable/i,
    /bad gateway/i,
    /gateway timeout/i,
    /authentication not found/i,
    /\bunauthorized\b/i,
    /\bforbidden\b/i,
    /\binvalid token\b/i,
    /\binternal error\b/i,
] as const;

function runnerFailureText(value: unknown): string {
    if (value instanceof Error) {
        return value.message;
    }

    if (!value || typeof value !== "object") {
        return String(value ?? "");
    }

    const record = value as Record<string, unknown>;
    return [record.error, record.message, record.status]
        .filter((entry): entry is string => typeof entry === "string")
        .join("\n");
}

/**
 * Distinguishes runner infrastructure/configuration failures from learner-code
 * failures. stderr and compile_output are intentionally excluded so learner
 * programs cannot turn their own failure text into an infrastructure result.
 */
export function isRunnerInfrastructureFailure(value: unknown): boolean {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const cause = record.cause;

        if (
            cause &&
            cause !== value &&
            isRunnerInfrastructureFailure(cause)
        ) {
            return true;
        }
    }

    const text = runnerFailureText(value);
    return RUNNER_INFRASTRUCTURE_ERROR_PATTERNS.some((pattern) =>
        pattern.test(text),
    );
}

export type RunCodeLimits = {
    timeoutMs?: number;
    /** C-only compile policy. Custom metadata is consumed before Judge0 submission. */
    cCompilerMode?: "learner" | "strict" | "sanitized";

    cpu_time_limit?: number;
    cpu_extra_time?: number;
    wall_time_limit?: number;
    memory_limit?: number;
    stack_limit?: number;
    max_processes_and_or_threads?: number;
    enable_network?: boolean;
    number_of_runs?: number;
} & Record<string, unknown>;

export type RunCodeTextFile = {
    path: string;
    content: string;
    encoding?: "utf8";
    readOnly?: boolean;
};

export type RunCodeBinaryFile = {
    path: string;
    encoding: "base64";
    data: string;
    mimeType: string;
    sizeBytes: number;
    checksum?: string;
    readOnly?: boolean;
};

export type RunCodeFile = RunCodeTextFile | RunCodeBinaryFile;
export type RunCodeFiles = RunCodeFile[] | Record<string, string>;

export function isBinaryRunCodeFile(
    file: RunCodeFile | null | undefined,
): file is RunCodeBinaryFile {
    return file?.encoding === "base64";
}

export function isTextRunCodeFile(
    file: RunCodeFile | null | undefined,
): file is RunCodeTextFile {
    return !!file && file.encoding !== "base64";
}

export function normalizeRunCodeFiles(
    files: RunCodeFiles | undefined,
): RunCodeFile[] {
    if (!files) return [];

    if (Array.isArray(files)) {
        return files
            .map((file): RunCodeFile | null => {
                const path =
                    typeof file?.path === "string" ? file.path.trim() : "";
                if (!path) return null;

                const readOnly =
                    typeof file.readOnly === "boolean"
                        ? { readOnly: file.readOnly }
                        : {};

                if (isBinaryRunCodeFile(file)) {
                    return {
                        path,
                        encoding: "base64",
                        data: String(file.data ?? ""),
                        mimeType: String(
                            file.mimeType ?? "application/octet-stream",
                        ),
                        sizeBytes:
                            typeof file.sizeBytes === "number" &&
                            Number.isFinite(file.sizeBytes)
                                ? Math.max(0, Math.trunc(file.sizeBytes))
                                : 0,
                        ...(typeof file.checksum === "string" &&
                        file.checksum.trim()
                            ? { checksum: file.checksum.trim() }
                            : {}),
                        ...readOnly,
                    };
                }

                return {
                    path,
                    content: String(file.content ?? ""),
                    ...readOnly,
                };
            })
            .filter((file): file is RunCodeFile => file !== null);
    }

    return Object.entries(files).map(([path, content]) => ({
        path,
        content: String(content ?? ""),
    }));
}

export type RunCodeFn = (args: {
    language: string;
    code: string;
    entry?: string;
    stdin?: string;
    files?: RunCodeFiles;
    limits?: RunCodeLimits;
}) => Promise<{
    ok: boolean;
    stdout?: string | null;
    stderr?: string | null;
    compile_output?: string | null;
    message?: string | null;
    status?: string;
    exitCode?: number | null;
    error?: string;
    timedOut?: boolean;
}>;

let currentCodeRunner: RunCodeFn | null = null;

export function setCodeRunner(fn: RunCodeFn) {
    currentCodeRunner = fn;
}

export function clearCodeRunner() {
    currentCodeRunner = null;
}

export function getCodeRunner(): RunCodeFn | null {
    return currentCodeRunner;
}
