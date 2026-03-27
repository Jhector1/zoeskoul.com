import type { CodeLanguage } from "@/lib/practice/types";
import type { FileEntry, RunLimits } from "./common";
import type {
    SqlRunReq,
    SqlRunResult,
    CodeRunResult,
} from "@/lib/code/types";

export type BatchCodeRunReq =
    | {
    kind: "code";
    mode?: "batch";
    language: Exclude<CodeLanguage, "sql">;
    code: string;
    stdin?: string;
    limits?: RunLimits;
}
    | {
    kind: "code";
    mode?: "batch";
    language: Exclude<CodeLanguage, "sql">;
    entry: string;
    files: FileEntry[] | Record<string, string>;
    stdin?: string;
    limits?: RunLimits;
};

export type BatchRunReq = BatchCodeRunReq | SqlRunReq;

export type BatchRunResult = CodeRunResult | SqlRunResult;

export type BatchRunPollResult = CodeRunResult & {
    done: boolean;
    token?: string;
    statusId?: number;
};

export type BatchRunSubmitResult =
    | { ok: true; mode: "queued"; token: string }
    | { ok: true; mode: "immediate"; result: BatchRunResult }
    | { ok: false; error: string };