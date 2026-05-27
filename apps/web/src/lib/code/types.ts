import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import type { InteractiveLanguage } from "@/lib/code/types/common";

export type SqlScalar = string | number | boolean | null;

export type SqlColumn = {
    name: string;
    type?: string | null;
};

export type FileEntry = {
    path: string;
    content: string;
};
export type WorkspaceSyncEntry =
    | {
    kind?: "file";
    path: string;
    content: string;
}
    | {
    kind: "directory";
    path: string;
};
export type RunLimits = {
    cpu_time_limit?: number;
    cpu_extra_time?: number;
    wall_time_limit?: number;
    memory_limit?: number;
    stack_limit?: number;
    max_processes_and_or_threads?: number;
    enable_network?: boolean;
    number_of_runs?: number;
};

export type SqlRunLimits = {
    statementTimeoutMs?: number;
    maxRows?: number;
    maxBytes?: number;
};

export type CodeRunReq =
    | {
    kind?: "code";
    language: InteractiveLanguage;
    code: string;
    stdin?: string;
    limits?: RunLimits;
    captureWorkspace?: boolean;
}
    | {
    kind?: "code";
    language: InteractiveLanguage;
    code?: string;
    entry: string;
    files:
        | Array<{ path: string; content: string }>
        | Record<string, string>;
    stdin?: string;
    limits?: RunLimits;
    captureWorkspace?: boolean;
};

export type SqlRunReq = {
    kind: "sql";
    language: "sql";
    dialect: SqlDialect;
    code: string;
    resultShape?: "table";

    /**
     * Optional post-check SQL for mutation exercises.
     * The runner executes `code` first, then executes `checkSql`
     * in the same database and returns the `checkSql` table.
     */
    checkSql?: string;

    /**
     * Canonical SQL setup fields.
     */
    schemaSql?: string;
    seedSql?: string;

    /**
     * Legacy alias kept during migration.
     */
    setupSql?: string;

    datasetId?: string;
    limits?: SqlRunLimits;
};

export type RunReq = CodeRunReq | SqlRunReq;

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
    workspaceFiles?: WorkspaceSyncEntry[];
};

export type SqlRunSuccess = {
    kind: "sql";
    ok: true;
    status: "Accepted";
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

export type SqlRunFailure = {
    kind: "sql";
    ok: false;
    status: "Error" | "Timeout" | "Canceled";
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

export type SqlRunResult = SqlRunSuccess | SqlRunFailure;

export type RunResult = CodeRunResult | SqlRunResult;

export type RunPollResult = CodeRunResult & {
    done: boolean;
    token?: string;
    statusId?: number;
};

export type RunSubmitResult =
    | {
    ok: true;
    mode: "queued";
    token: string;
}
    | {
    ok: true;
    mode: "immediate";
    result: RunResult;
}
    | {
    ok: false;
    error: string;
};

export function isSqlRunReq(req: RunReq): req is SqlRunReq {
    return req.language === "sql" || (req as any)?.kind === "sql";
}

export function isSqlRunResult(result: unknown | null | undefined): result is SqlRunResult {
    return Boolean(result) && (result as any).kind === "sql";
}
