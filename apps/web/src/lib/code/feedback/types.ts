export type CodeFeedbackKind =
    | "syntax"
    | "compile"
    | "runtime"
    | "logic"
    | "format"
    | "input";

export type CodeFeedbackTone = "danger" | "warning" | "info";

export type CodeFeedback = {
    area: "code";
    source?: "run" | "check";
    kind: CodeFeedbackKind;
    tone: CodeFeedbackTone;
    title: string;
    message: string;
    line?: number | null;
    column?: number | null;
    raw?: string | null;
};