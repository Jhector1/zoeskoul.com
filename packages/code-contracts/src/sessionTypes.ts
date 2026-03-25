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
}
    | {
    kind: "code";
    mode: "interactive";
    language: InteractiveLanguage;
    entry: string;
    files: FileEntry[] | Record<string, string>;
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