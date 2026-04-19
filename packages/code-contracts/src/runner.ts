import { z } from "zod";

export const WORKSPACE_LANGUAGES = [
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
    "sql",
    "bash",
    "web",
] as const;

export type WorkspaceLanguage = (typeof WORKSPACE_LANGUAGES)[number];

export const RUNNER_LANGUAGES = [
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
    "sql",
] as const;

export type RunnerLanguage = (typeof RUNNER_LANGUAGES)[number];

export const RUNNER_CODE_LANGUAGES = [
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
] as const;

export type RunnerCodeLanguage = (typeof RUNNER_CODE_LANGUAGES)[number];

export const INTERACTIVE_LANGUAGES = [
    "python",
    "javascript",
    "java",
    "c",
    "cpp",
] as const;

export type InteractiveLanguage = (typeof INTERACTIVE_LANGUAGES)[number];

export const SHELL_LANGUAGES = ["bash"] as const;
export type ShellLanguage = (typeof SHELL_LANGUAGES)[number];

export const WEB_LANGUAGES = ["web"] as const;
export type WebLanguage = (typeof WEB_LANGUAGES)[number];

export const SQL_LANGUAGES = ["sql"] as const;
export type SqlLanguage = (typeof SQL_LANGUAGES)[number];

/**
 * Workspace languages that use a normal file-based starter workspace.
 * This includes bash, because it behaves like a single-file script workspace.
 */
export type FileWorkspaceLanguage = Exclude<WorkspaceLanguage, "sql" | "web">;

export const workspaceLanguageSchema = z.enum(WORKSPACE_LANGUAGES);
export const runnerLanguageSchema = z.enum(RUNNER_LANGUAGES);
export const interactiveLanguageSchema = z.enum(INTERACTIVE_LANGUAGES);

export function isWorkspaceLanguage(value: unknown): value is WorkspaceLanguage {
    return typeof value === "string" && (WORKSPACE_LANGUAGES as readonly string[]).includes(value);
}

export function isRunnerLanguage(value: unknown): value is RunnerLanguage {
    return typeof value === "string" && (RUNNER_LANGUAGES as readonly string[]).includes(value);
}

export function isRunnerCodeLanguage(value: unknown): value is RunnerCodeLanguage {
    return typeof value === "string" && (RUNNER_CODE_LANGUAGES as readonly string[]).includes(value);
}

export function isInteractiveLanguage(value: unknown): value is InteractiveLanguage {
    return typeof value === "string" && (INTERACTIVE_LANGUAGES as readonly string[]).includes(value);
}

export function isShellLanguage(value: unknown): value is ShellLanguage {
    return value === "bash";
}

export function isWebLanguage(value: unknown): value is WebLanguage {
    return value === "web";
}

export function isSqlLanguage(value: unknown): value is SqlLanguage {
    return value === "sql";
}

/**
 * Backward-compat aliases during migration.
 * Remove later once the codebase fully uses the clearer names above.
 */
export type CodeLanguage = WorkspaceLanguage;
export type TerminalRunnerLanguage = RunnerLanguage;
export type NonSqlWorkspaceLanguage = FileWorkspaceLanguage;

export const fileEntrySchema = z.object({
    kind: z.literal("file").optional(),
    path: z.string().min(1),
    content: z.string(),
});

export const directoryEntrySchema = z.object({
    kind: z.literal("directory"),
    path: z.string().min(1),
});

export const workspaceSyncEntrySchema = z.union([
    fileEntrySchema,
    directoryEntrySchema,
]);

export type FileEntry = z.infer<typeof fileEntrySchema>;
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;
export type WorkspaceSyncEntry = z.infer<typeof workspaceSyncEntrySchema>;

const timeoutFields = {
    wallTimeoutMs: z.number().int().positive().max(60_000).optional(),
    idleTimeoutMs: z.number().int().positive().max(60_000).optional(),
};

export const interactiveRunReqSchema = z.union([
    z.object({
        kind: z.literal("code"),
        mode: z.literal("interactive"),
        language: interactiveLanguageSchema,
        code: z.string(),
        ...timeoutFields,
    }),

    z.object({
        kind: z.literal("code"),
        mode: z.literal("interactive"),
        language: interactiveLanguageSchema,
        entry: z.string().min(1),
        files: z.union([
            z.array(workspaceSyncEntrySchema),
            z.record(z.string(), z.string()),
        ]),
        ...timeoutFields,
    }),

    z.object({
        kind: z.literal("shell"),
        mode: z.literal("interactive"),
        language: z.literal("bash"),
        files: z.union([
            z.array(workspaceSyncEntrySchema),
            z.record(z.string(), z.string()),
        ]).optional(),
        projectId: z.string().optional(),
        cwd: z.string().min(1).optional(),
        ...timeoutFields,
    }),
]);

export type InteractiveRunReq =
    | {
    kind: "code";
    mode: "interactive";
    language: InteractiveLanguage;
    code: string;
    wallTimeoutMs?: number;
    idleTimeoutMs?: number;
}
    | {
    kind: "code";
    mode: "interactive";
    language: InteractiveLanguage;
    entry: string;
    files: WorkspaceSyncEntry[] | Record<string, string>;
    wallTimeoutMs?: number;
    idleTimeoutMs?: number;
}
    | {
    kind: "shell";
    mode: "interactive";
    language: "bash";
    files?: WorkspaceSyncEntry[] | Record<string, string>;
    projectId?: string;
    cwd?: string;
    wallTimeoutMs?: number;
    idleTimeoutMs?: number;
};

export type RunSessionState =
    | "queued"
    | "preparing"
    | "compiling"
    | "running"
    | "waiting_for_input"
    | "completed"
    | "failed"
    | "canceled"
    | "timed_out";

export type StartSessionResult =
    | {
    ok: true;
    sessionId: string;
    state: RunSessionState;
}
    | {
    ok: false;
    error: string;
};

export type RunEvent =
    | { type: "status"; seq: number; state: RunSessionState; ts: string }
    | { type: "stdout"; seq: number; chunk: string; ts: string }
    | { type: "stderr"; seq: number; chunk: string; ts: string }
    | { type: "input_request"; seq: number; ts: string }
    | { type: "compile_error"; seq: number; stdout: string; stderr: string; ts: string }
    | { type: "exit"; seq: number; code: number; ts: string }
    | { type: "error"; seq: number; message: string; ts: string };

export type RunEventInput =
    | { type: "status"; state: RunSessionState }
    | { type: "stdout"; chunk: string }
    | { type: "stderr"; chunk: string }
    | { type: "input_request" }
    | { type: "compile_error"; stdout: string; stderr: string }
    | { type: "exit"; code: number }
    | { type: "error"; message: string };

export type SessionInputReq = {
    input: string;
};

export type RunSessionSummary =
    | {
    id: string;
    kind: "code";
    state: RunSessionState;
    language: InteractiveLanguage;
    createdAt: string;
    updatedAt: string;
    exitCode?: number | null;
    compileExitCode?: number | null;
}
    | {
    id: string;
    kind: "shell";
    state: RunSessionState;
    language: ShellLanguage;
    createdAt: string;
    updatedAt: string;
    exitCode?: number | null;
    compileExitCode?: number | null;
};

export type SessionStatusResult =
    | { ok: true; session: RunSessionSummary }
    | { ok: false; error: string };