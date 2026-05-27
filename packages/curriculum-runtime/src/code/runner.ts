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

export type RunCodeFn = (args: {
    language: string;
    code: string;
    entry?: string;
    stdin?: string;
    files?:
        | Array<{
        path: string;
        content: string;
        readOnly?: boolean;
    }>
        | Record<string, string>;
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