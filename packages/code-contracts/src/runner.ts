

import { z } from "zod";

export type CodeLanguage =
    | "python"
    | "java"
    | "javascript"
    | "c"
    | "cpp"
    | "sql"
    | "bash";

export type InteractiveLanguage = Exclude<CodeLanguage, "sql">;

export const interactiveLanguageSchema = z.enum([
    "python",
    "javascript",
    "java",
    "c",
    "cpp",
    "bash",
]);

export const fileEntrySchema = z.object({
    path: z.string().min(1),
    content: z.string(),
});

export type FileEntry = z.infer<typeof fileEntrySchema>;

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
            z.array(fileEntrySchema),
            z.record(z.string(), z.string()),
        ]),
        ...timeoutFields,
    }),

    z.object({
        kind: z.literal("shell"),
        mode: z.literal("interactive"),
        language: z.literal("bash"),
        files: z.union([
            z.array(fileEntrySchema),
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
    files: FileEntry[] | Record<string, string>;
    wallTimeoutMs?: number;
    idleTimeoutMs?: number;
}
    | {
    kind: "shell";
    mode: "interactive";
    language: "bash";
    files?: FileEntry[] | Record<string, string>;
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

export type RunSessionSummary = {
    id: string;
    state: RunSessionState;
    language: InteractiveLanguage;
    createdAt: string;
    updatedAt: string;
    exitCode?: number | null;
    compileExitCode?: number | null;
};

export type SessionStatusResult =
    | { ok: true; session: RunSessionSummary }
    | { ok: false; error: string };















