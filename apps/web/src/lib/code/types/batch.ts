import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import type { FileEntry, RunLimits, SqlRunLimits, SqlScalar } from "./common";

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

export type SqlRunReq = {
    kind: "sql";
    mode?: "batch";
    language: "sql";
    dialect: SqlDialect;
    code: string;
    schemaSql?: string;
    seedSql?: string;
    setupSql?: string;
    datasetId?: string;
    limits?: SqlRunLimits;
};

export type BatchRunReq = BatchCodeRunReq | SqlRunReq;

export type SqlColumn = {
    name: string;
    type?: string | null;
};

export type CodeRunResult = {
    kind?: "code";
    ok: boolean;
    status: string;
    stdout?: string | null;
    stderr?: string | null;
    compile_output?: string | null;
    message?: string | null;
    time?: string | null;
    memory?: number | null;
    error?: string;
};

export type SqlRunResult = {
    kind: "sql";
    ok: boolean;
    status: "Accepted" | "Error" | "Timeout" | "Canceled";
    dialect: SqlDialect;
    columns?: SqlColumn[];
    rows?: SqlScalar[][];
    rowCount?: number;
    affectedRows?: number;
    notices?: string[];
    stdout?: string | null;
    stderr?: string | null;
    compile_output?: string | null;
    message?: string | null;
    time?: string | null;
    memory?: number | null;
    error?: string;
};

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