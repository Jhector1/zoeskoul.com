export type RunCodeLimits = {
    timeoutMs?: number;

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
