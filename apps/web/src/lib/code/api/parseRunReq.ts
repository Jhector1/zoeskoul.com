import "server-only";

import type { RunLimits, RunReq, SqlRunLimits } from "@/lib/code/types";
import type { SqlDialect } from "@/lib/practice/types";
import type { InteractiveLanguage } from "@zoeskoul/code-contracts";

const CODE_LANGS = new Set<InteractiveLanguage>([
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
]);

const SQL_DIALECTS = new Set<SqlDialect>([
    "postgres",
    "mysql",
    "sqlite",
    "mssql",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, field: string, maxLen: number) {
    if (typeof v !== "string") throw new Error(`${field} must be a string.`);
    if (v.length > maxLen) throw new Error(`${field} is too large.`);
    return v;
}

function asOptionalString(v: unknown, field: string, maxLen: number) {
    if (v == null) return undefined;
    return asString(v, field, maxLen);
}

function asOptionalSqlResultShape(v: unknown) {
    const raw = asOptionalString(v, "resultShape", 32);
    if (raw == null || raw.trim() === "") return undefined;
    if (raw.trim() !== "table") {
        throw new Error('SQL resultShape must be "table".');
    }
    return "table" as const;
}

function asBoolean(v: unknown, field: string) {
    if (typeof v !== "boolean") throw new Error(`${field} must be a boolean.`);
    return v;
}

function asFiniteNumber(v: unknown, field: string) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new Error(`${field} must be a finite number.`);
    }
    return v;
}

function asNumberInRange(
    v: unknown,
    field: string,
    min: number,
    max: number,
    opts?: { integer?: boolean },
) {
    const n = asFiniteNumber(v, field);

    if (opts?.integer && !Number.isInteger(n)) {
        throw new Error(`${field} must be an integer.`);
    }

    if (n < min || n > max) {
        throw new Error(`${field} must be between ${min} and ${max}.`);
    }

    return n;
}

function parseRunLimits(v: unknown): RunLimits | undefined {
    if (v == null) return undefined;
    if (!isRecord(v)) throw new Error("limits must be an object.");

    const out: RunLimits = {};

    if ("cpu_time_limit" in v) {
        out.cpu_time_limit = asNumberInRange(
            v.cpu_time_limit,
            "limits.cpu_time_limit",
            1,
            10,
        );
    }

    if ("cpu_extra_time" in v) {
        out.cpu_extra_time = asNumberInRange(
            v.cpu_extra_time,
            "limits.cpu_extra_time",
            0,
            5,
        );
    }

    if ("wall_time_limit" in v) {
        out.wall_time_limit = asNumberInRange(
            v.wall_time_limit,
            "limits.wall_time_limit",
            2,
            20,
        );
    }

    if ("memory_limit" in v) {
        out.memory_limit = asNumberInRange(
            v.memory_limit,
            "limits.memory_limit",
            64000,
            512000,
            { integer: true },
        );
    }

    if ("stack_limit" in v) {
        out.stack_limit = asNumberInRange(
            v.stack_limit,
            "limits.stack_limit",
            16000,
            256000,
            { integer: true },
        );
    }

    if ("max_processes_and_or_threads" in v) {
        out.max_processes_and_or_threads = asNumberInRange(
            v.max_processes_and_or_threads,
            "limits.max_processes_and_or_threads",
            1,
            120,
            { integer: true },
        );
    }

    if ("enable_network" in v) {
        out.enable_network = asBoolean(v.enable_network, "limits.enable_network");
    }

    if ("number_of_runs" in v) {
        out.number_of_runs = asNumberInRange(
            v.number_of_runs,
            "limits.number_of_runs",
            1,
            3,
            { integer: true },
        );
    }

    return out;
}

function parseSqlLimits(v: unknown): SqlRunLimits | undefined {
    if (v == null) return undefined;
    if (!isRecord(v)) throw new Error("limits must be an object.");

    const out: SqlRunLimits = {};

    if ("statementTimeoutMs" in v) {
        out.statementTimeoutMs = asNumberInRange(
            v.statementTimeoutMs,
            "limits.statementTimeoutMs",
            250,
            15000,
            { integer: true },
        );
    }

    if ("maxRows" in v) {
        out.maxRows = asNumberInRange(
            v.maxRows,
            "limits.maxRows",
            1,
            1000,
            { integer: true },
        );
    }

    if ("maxBytes" in v) {
        out.maxBytes = asNumberInRange(
            v.maxBytes,
            "limits.maxBytes",
            2048,
            512000,
            { integer: true },
        );
    }

    return out;
}

function parseFiles(v: unknown) {
    if (Array.isArray(v)) {
        return v.map((item, i) => {
            if (!isRecord(item)) throw new Error(`files[${i}] must be an object.`);
            return {
                path: asString(item.path, `files[${i}].path`, 512),
                content: asString(item.content, `files[${i}].content`, 300_000),
            };
        });
    }

    if (isRecord(v)) {
        const out: Record<string, string> = {};

        for (const [path, content] of Object.entries(v)) {
            out[asString(path, "files key", 512)] = asString(
                content,
                `files["${path}"]`,
                300_000,
            );
        }

        return out;
    }

    throw new Error("files must be an array or object.");
}

export function parseRunReq(input: unknown): RunReq {
    if (!isRecord(input)) throw new Error("Request body must be an object.");

    const rawLanguage = input.language;

    if (rawLanguage === "sql" || input.kind === "sql") {
        const dialect = input.dialect;

        if (!SQL_DIALECTS.has(dialect as SqlDialect)) {
            throw new Error("Invalid SQL dialect.");
        }

        return {
            kind: "sql",
            language: "sql",
            dialect: dialect as SqlDialect,
            code: asString(input.code, "code", 300_000),
            resultShape: asOptionalSqlResultShape(input.resultShape),
            checkSql: asOptionalString(input.checkSql, "checkSql", 300_000),
            schemaSql: asOptionalString(
                input.schemaSql ?? input.setupSql,
                "schemaSql",
                300_000,
            ),
            seedSql: asOptionalString(input.seedSql, "seedSql", 300_000),
            datasetId: asOptionalString(input.datasetId, "datasetId", 256),
            limits: parseSqlLimits(input.limits),
        };
    }

    if (!CODE_LANGS.has(rawLanguage as InteractiveLanguage)) {
        throw new Error("Invalid code language.");
    }

    const language = rawLanguage as InteractiveLanguage;

    if ("files" in input || "entry" in input) {
        return {
            kind: "code",
            language,
            entry: asString(input.entry, "entry", 512),
            files: parseFiles(input.files),
            stdin: asOptionalString(input.stdin, "stdin", 100_000),
            limits: parseRunLimits(input.limits),
        };
    }

    return {
        kind: "code",
        language,
        code: asString(input.code, "code", 300_000),
        stdin: asOptionalString(input.stdin, "stdin", 100_000),
        limits: parseRunLimits(input.limits),
    };
}

export function parseRunToken(raw: unknown) {
    const token = typeof raw === "string" ? raw.trim() : "";

    if (!/^[A-Za-z0-9_-]{1,200}$/.test(token)) {
        throw new Error("Invalid run token.");
    }

    return token;
}
