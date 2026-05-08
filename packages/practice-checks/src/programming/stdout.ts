import type { ProgrammingStdoutMatchMode } from "./types";

export function normalizeStdout(value: string): string {
    return String(value ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .trimEnd();
}

export function stdoutMatches(args: {
    got: string;
    want: string;
    mode?: ProgrammingStdoutMatchMode;
}): boolean {
    const mode = args.mode ?? "exact";
    const got = normalizeStdout(args.got);
    const want = normalizeStdout(args.want);
    return mode === "includes" ? got.includes(want.trim()) : got === want;
}
