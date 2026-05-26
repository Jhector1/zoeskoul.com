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
    limits?: { timeoutMs?: number } & Record<string, unknown>;
}) => Promise<{
    ok: boolean;
    stdout?: string;
    stderr?: string;
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
