export type InteractiveLanguage =
    | "python"
    | "javascript"
    | "c"
    | "cpp"
    | "java";

export type FileEntry = {
    path: string;
    content: string;
};

export type InteractiveRunReq =
    | {
    kind: "code";
    mode: "interactive";
    language: InteractiveLanguage;
    code: string;

    wallTimeoutMs?: number;
    idleTimeoutMs?: number;
    entry?:string;
}
    | {
    kind: "code";
    mode: "interactive";
    language: InteractiveLanguage;
    entry: string;
    files: FileEntry[] | Record<string, string>;
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
    | { type: "status"; seq: number; ts: string; state: RunSessionState }
    | { type: "stdout"; seq: number; ts: string; chunk: string }
    | { type: "stderr"; seq: number; ts: string; chunk: string }
    | { type: "input_request"; seq: number; ts: string }
    | { type: "exit"; seq: number; ts: string; code: number }
    | { type: "error"; seq: number; ts: string; message: string };



type DistributiveOmit<T, K extends PropertyKey> =
    T extends unknown ? Omit<T, K> : never;


export type RunEventInput =
    | { type: "status"; state: RunSessionState }
    | { type: "stdout"; chunk: string }
    | { type: "stderr"; chunk: string }
    | { type: "input_request" }
    | { type: "exit"; code: number }
    | { type: "error"; message: string };

// export type RunEventInput = DistributiveOmit<RunEvent, "seq" | "ts">;


// import type { InteractiveLanguage, FileEntry, InteractiveRunLimits } from "./common";
//
// export type InteractiveRunReq =
//     | {
//     kind: "code";
//     mode: "interactive";
//     language: InteractiveLanguage;
//     code: string;
//     limits?: InteractiveRunLimits;
// }
//     | {
//     kind: "code";
//     mode: "interactive";
//     language: InteractiveLanguage;
//     entry: string;
//     files: FileEntry[] | Record<string, string>;
//     limits?: InteractiveRunLimits;
// };

// export type RunSessionState =
//     | "queued"
//     | "preparing"
//     | "compiling"
//     | "running"
//     | "waiting_for_input"
//     | "completed"
//     | "failed"
//     | "canceled"
//     | "timed_out";

export type RunSessionSummary = {
    id: string;
    state: RunSessionState;
    language: InteractiveLanguage;
    createdAt: string;
    updatedAt: string;
    exitCode?: number | null;
    compileExitCode?: number | null;
};

// export type StartSessionResult =
//     | { ok: true; sessionId: string; state: RunSessionState }
//     | { ok: false; error: string };

export type SessionInputReq = {
    input: string;
};

export type SessionStatusResult =
    | { ok: true; session: RunSessionSummary }
    | { ok: false; error: string };
//
// export type RunEvent =
//     | { type: "status"; seq: number; state: RunSessionState; ts: string }
//     | { type: "stdout"; seq: number; chunk: string; ts: string }
//     | { type: "stderr"; seq: number; chunk: string; ts: string }
//     | { type: "input_request"; seq: number; ts: string }
//     | { type: "compile_error"; seq: number; stdout: string; stderr: string; ts: string }
//     | { type: "exit"; seq: number; code: number; ts: string }
//     | { type: "error"; seq: number; message: string; ts: string };