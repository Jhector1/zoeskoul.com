import "server-only";

import crypto from "node:crypto";

import type { RunLimits, RunReq, SqlRunLimits } from "@/lib/code/types";
import type { SqlDialect } from "@/lib/practice/types";
import type {
    BinaryWorkspaceFileEntry,
    FileEntry,
    InteractiveLanguage,
} from "@zoeskoul/code-contracts";
import {
    assertWorkspaceRelativePath,
    normalizeWorkspaceBase64,
    resolveWorkspaceFileCapability,
    workspaceBase64DecodedByteLength,
} from "@zoeskoul/code-contracts";

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

const MAX_MULTI_FILE_RUN_FILES = 20;
const MAX_MULTI_FILE_RUN_TEXT_TOTAL_BYTES = 1_000_000;
const MAX_MULTI_FILE_RUN_BINARY_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_MULTI_FILE_RUN_BINARY_FILE_BYTES = 5 * 1024 * 1024;

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

function bytesOfText(input: string) {
    return new TextEncoder().encode(String(input ?? "")).length;
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

function strictBase64Bytes(value: unknown, field: string) {
    const data = normalizeWorkspaceBase64(value);
    const sizeBytes = workspaceBase64DecodedByteLength(value);
    if (data == null || sizeBytes == null) {
        throw new Error(`${field} must be canonical base64.`);
    }
    return { data, sizeBytes };
}

function parseFileEntry(item: unknown, index: number): FileEntry {
    if (!isRecord(item)) throw new Error(`files[${index}] must be an object.`);

    const path = assertWorkspaceRelativePath(
        asString(item.path, `files[${index}].path`, 512),
    );
    const capability = resolveWorkspaceFileCapability(path);
    if (!capability) {
        throw new Error(`files[${index}] has an unsupported file type.`);
    }

    if (capability.storage === "binary") {
        if (item.encoding !== "base64") {
            throw new Error(`files[${index}] must use base64 encoding.`);
        }

        const { data, sizeBytes } = strictBase64Bytes(
            item.data,
            `files[${index}].data`,
        );
        if (sizeBytes > MAX_MULTI_FILE_RUN_BINARY_FILE_BYTES) {
            throw new Error(
                `files[${index}] exceeds the ${MAX_MULTI_FILE_RUN_BINARY_FILE_BYTES} byte binary-file limit.`,
            );
        }
        if (
            typeof item.sizeBytes !== "number" ||
            !Number.isInteger(item.sizeBytes) ||
            item.sizeBytes !== sizeBytes
        ) {
            throw new Error(`files[${index}].sizeBytes does not match its binary payload.`);
        }

        const checksum =
            typeof item.checksum === "string" && item.checksum.trim()
                ? item.checksum.trim().toLowerCase()
                : undefined;
        if (checksum && !/^sha256:[a-f0-9]{64}$/.test(checksum)) {
            throw new Error(`files[${index}].checksum must be a SHA-256 checksum.`);
        }
        if (checksum) {
            const actual = `sha256:${crypto
                .createHash("sha256")
                .update(Buffer.from(data, "base64"))
                .digest("hex")}`;
            if (actual !== checksum) {
                throw new Error(`files[${index}].checksum does not match its binary payload.`);
            }
        }

        const binary: BinaryWorkspaceFileEntry = {
            kind: "file",
            path,
            encoding: "base64",
            data,
            mimeType: capability.mimeType,
            sizeBytes,
            ...(checksum ? { checksum } : {}),
        };
        return binary;
    }

    if (item.encoding === "base64") {
        throw new Error(`files[${index}] is a text file and cannot use base64 encoding.`);
    }

    return {
        kind: "file",
        path,
        content: asString(item.content, `files[${index}].content`, 300_000),
    };
}

function parseFiles(v: unknown) {
    if (Array.isArray(v)) {
        if (v.length > MAX_MULTI_FILE_RUN_FILES) {
            throw new Error(`files must contain at most ${MAX_MULTI_FILE_RUN_FILES} files.`);
        }

        const files = v.map(parseFileEntry);
        let textBytes = 0;
        let binaryBytes = 0;

        for (const file of files) {
            if (file.encoding === "base64") {
                binaryBytes += file.sizeBytes;
            } else {
                textBytes += bytesOfText(file.content);
            }
        }

        if (textBytes > MAX_MULTI_FILE_RUN_TEXT_TOTAL_BYTES) {
            throw new Error(
                `files total content exceeds the ${MAX_MULTI_FILE_RUN_TEXT_TOTAL_BYTES} byte text limit.`,
            );
        }
        if (binaryBytes > MAX_MULTI_FILE_RUN_BINARY_TOTAL_BYTES) {
            throw new Error(
                `files binary content exceeds the ${MAX_MULTI_FILE_RUN_BINARY_TOTAL_BYTES} byte limit.`,
            );
        }

        return files;
    }

    if (isRecord(v)) {
        const entries = Object.entries(v);
        if (entries.length > MAX_MULTI_FILE_RUN_FILES) {
            throw new Error(`files must contain at most ${MAX_MULTI_FILE_RUN_FILES} files.`);
        }

        const out: Record<string, string> = {};
        let totalBytes = 0;

        for (const [path, content] of entries) {
            const safePath = assertWorkspaceRelativePath(
                asString(path, "files key", 512),
            );
            const capability = resolveWorkspaceFileCapability(safePath);
            if (!capability || capability.storage !== "text") {
                throw new Error(
                    `files["${path}"] must be a supported text file; use the array form for binary files.`,
                );
            }
            const safeContent = asString(
                content,
                `files["${path}"]`,
                300_000,
            );
            totalBytes += bytesOfText(safeContent);
            out[safePath] = safeContent;
        }

        if (totalBytes > MAX_MULTI_FILE_RUN_TEXT_TOTAL_BYTES) {
            throw new Error(
                `files total content exceeds the ${MAX_MULTI_FILE_RUN_TEXT_TOTAL_BYTES} byte limit.`,
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
            code:
                typeof input.code === "string"
                    ? asString(input.code, "code", 300_000)
                    : undefined,
            entry: assertWorkspaceRelativePath(
                asString(input.entry, "entry", 512),
            ),
            files: parseFiles(input.files),
            stdin: asOptionalString(input.stdin, "stdin", 100_000),
            limits: parseRunLimits(input.limits),
            captureWorkspace:
                typeof input.captureWorkspace === "boolean"
                    ? input.captureWorkspace
                    : undefined,
        };
    }

    return {
        kind: "code",
        language,
        code: asString(input.code, "code", 300_000),
        stdin: asOptionalString(input.stdin, "stdin", 100_000),
        limits: parseRunLimits(input.limits),
        captureWorkspace:
            typeof input.captureWorkspace === "boolean"
                ? input.captureWorkspace
                : undefined,
    };
}

export function parseRunToken(raw: unknown) {
    const token = typeof raw === "string" ? raw.trim() : "";

    if (!/^[A-Za-z0-9_-]{1,200}$/.test(token)) {
        throw new Error("Invalid run token.");
    }

    return token;
}
